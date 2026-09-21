import type { ManualOverrideField, NormalizedBankTransaction } from "./types";

export interface ExistingTransactionForDedup {
  id: string;
  provider: string | null;
  provider_transaction_id: string | null;
  fingerprint: string | null;
  category_id: string | null;
  description: string;
  merchant: string | null;
  notes: string | null;
  amount?: number | null;
  date?: string | null;
  type?: string | null;
  booking_status?: "booked" | "pending" | string | null;
  manual_override_fields: ManualOverrideField[] | string[] | null;
}

export type DedupDecision =
  | { action: "insert" }
  | { action: "skip"; existingId: string; reason: "provider_id" | "fingerprint" }
  | {
      action: "update";
      existingId: string;
      fields: Record<string, unknown>;
    }
  | {
      action: "promote";
      existingId: string;
      fields: Record<string, unknown>;
    };

function asOverrideSet(
  fields: ManualOverrideField[] | string[] | null | undefined
): Set<string> {
  return new Set(fields ?? []);
}

function cleanCompare(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T12:00:00Z`);
  const db = Date.parse(`${b.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(da - db) / (24 * 60 * 60 * 1000);
}

/**
 * Protect user edits: never overwrite overridden fields on re-sync.
 */
export function mergeWithManualOverrides(
  existing: ExistingTransactionForDedup,
  incoming: NormalizedBankTransaction
): Record<string, unknown> {
  const overrides = asOverrideSet(existing.manual_override_fields);
  const patch: Record<string, unknown> = {};

  if (
    !overrides.has("description") &&
    existing.description !== incoming.description
  ) {
    patch.description = incoming.description;
  }
  if (!overrides.has("merchant") && existing.merchant !== incoming.merchant) {
    patch.merchant = incoming.merchant;
  }
  if (
    !overrides.has("notes") &&
    incoming.notes != null &&
    existing.notes !== incoming.notes
  ) {
    patch.notes = incoming.notes;
  }
  // category_id is never auto-set from bank sync in this module

  return patch;
}

function isPendingRow(row: ExistingTransactionForDedup): boolean {
  return (row.booking_status ?? "booked") === "pending";
}

/**
 * When a booked AIS row arrives, find a prior pending row for the same economic
 * event so we can promote it instead of duplicating.
 */
export function findPendingPromotionTarget(
  incoming: NormalizedBankTransaction,
  pendingRows: ExistingTransactionForDedup[]
): ExistingTransactionForDedup | null {
  if (incoming.bookingStatus !== "booked" || pendingRows.length === 0) {
    return null;
  }

  if (incoming.providerTransactionId) {
    const byId = pendingRows.find(
      (r) =>
        r.provider_transaction_id &&
        r.provider_transaction_id === incoming.providerTransactionId
    );
    if (byId) return byId;
  }

  const desc = cleanCompare(incoming.description);
  const merchant = cleanCompare(incoming.merchant);
  let best: { row: ExistingTransactionForDedup; score: number } | null = null;

  for (const row of pendingRows) {
    if (!isPendingRow(row)) continue;
    if (row.type && row.type !== incoming.type) continue;
    if (
      row.amount != null &&
      Math.abs(Number(row.amount) - incoming.amount) > 0.009
    ) {
      continue;
    }
    const rowDate = (row.date ?? "").slice(0, 10);
    if (rowDate && daysBetween(rowDate, incoming.date) > 5) continue;

    const rowDesc = cleanCompare(row.description);
    const rowMerchant = cleanCompare(row.merchant);
    const textHit =
      (desc &&
        rowDesc &&
        (desc === rowDesc || desc.includes(rowDesc) || rowDesc.includes(desc))) ||
      (merchant &&
        rowMerchant &&
        (merchant === rowMerchant ||
          merchant.includes(rowMerchant) ||
          rowMerchant.includes(merchant)));

    // Require text affinity when ids differ — avoids promoting the wrong pending.
    if (!textHit) continue;

    const score =
      10 + (rowDate ? Math.max(0, 5 - daysBetween(rowDate, incoming.date)) : 0);
    if (!best || score > best.score) best = { row, score };
  }

  return best ? best.row : null;
}

/**
 * Deduplicate by provider_transaction_id first, then fingerprint.
 * Booked rows can promote a matching pending row.
 */
export function decideDedup(
  incoming: NormalizedBankTransaction,
  existingByProviderId: Map<string, ExistingTransactionForDedup>,
  existingByFingerprint: Map<string, ExistingTransactionForDedup>,
  pendingRows: ExistingTransactionForDedup[] = []
): DedupDecision {
  if (incoming.bookingStatus === "booked") {
    const pendingHit = findPendingPromotionTarget(incoming, pendingRows);
    if (pendingHit) {
      const fields = {
        ...mergeWithManualOverrides(pendingHit, incoming),
        booking_status: "booked",
        date: incoming.date,
        fingerprint: incoming.fingerprint,
        amount: incoming.amount,
        type: incoming.type,
        provider_transaction_id:
          incoming.providerTransactionId ?? pendingHit.provider_transaction_id,
      };
      return { action: "promote", existingId: pendingHit.id, fields };
    }
  }

  if (incoming.providerTransactionId) {
    const hit = existingByProviderId.get(incoming.providerTransactionId);
    if (hit) {
      // Pending feed for an already-booked id → keep booked, skip pending.
      if (incoming.bookingStatus === "pending" && !isPendingRow(hit)) {
        return { action: "skip", existingId: hit.id, reason: "provider_id" };
      }
      const fields = mergeWithManualOverrides(hit, incoming);
      if (isPendingRow(hit) && incoming.bookingStatus === "booked") {
        fields.booking_status = "booked";
        fields.date = incoming.date;
        fields.fingerprint = incoming.fingerprint;
        if (incoming.providerTransactionId) {
          fields.provider_transaction_id = incoming.providerTransactionId;
        }
        return { action: "promote", existingId: hit.id, fields };
      }
      if (!isPendingRow(hit) && incoming.bookingStatus === "pending") {
        return { action: "skip", existingId: hit.id, reason: "provider_id" };
      }
      if (
        incoming.bookingStatus &&
        (hit.booking_status ?? "booked") !== incoming.bookingStatus
      ) {
        fields.booking_status = incoming.bookingStatus;
      }
      if (Object.keys(fields).length === 0) {
        return { action: "skip", existingId: hit.id, reason: "provider_id" };
      }
      return { action: "update", existingId: hit.id, fields };
    }
  }

  const byFp = existingByFingerprint.get(incoming.fingerprint);
  if (byFp) {
    if (incoming.bookingStatus === "pending" && !isPendingRow(byFp)) {
      return { action: "skip", existingId: byFp.id, reason: "fingerprint" };
    }
    const fields = mergeWithManualOverrides(byFp, incoming);
    if (isPendingRow(byFp) && incoming.bookingStatus === "booked") {
      fields.booking_status = "booked";
      fields.date = incoming.date;
      fields.fingerprint = incoming.fingerprint;
      return { action: "promote", existingId: byFp.id, fields };
    }
    if (
      incoming.bookingStatus &&
      (byFp.booking_status ?? "booked") !== incoming.bookingStatus
    ) {
      fields.booking_status = incoming.bookingStatus;
    }
    if (Object.keys(fields).length === 0) {
      return { action: "skip", existingId: byFp.id, reason: "fingerprint" };
    }
    return { action: "update", existingId: byFp.id, fields };
  }

  return { action: "insert" };
}

export function buildDedupIndexes(
  rows: ExistingTransactionForDedup[]
): {
  byProviderId: Map<string, ExistingTransactionForDedup>;
  byFingerprint: Map<string, ExistingTransactionForDedup>;
  pendingRows: ExistingTransactionForDedup[];
} {
  const byProviderId = new Map<string, ExistingTransactionForDedup>();
  const byFingerprint = new Map<string, ExistingTransactionForDedup>();
  const pendingRows: ExistingTransactionForDedup[] = [];

  for (const row of rows) {
    if (row.provider_transaction_id) {
      byProviderId.set(row.provider_transaction_id, row);
    }
    if (row.fingerprint) {
      byFingerprint.set(row.fingerprint, row);
    }
    if (isPendingRow(row)) pendingRows.push(row);
  }

  return { byProviderId, byFingerprint, pendingRows };
}

/** Mark fields the user edited so future syncs leave them alone. */
export function addManualOverrides(
  current: string[] | null | undefined,
  fields: ManualOverrideField[]
): ManualOverrideField[] {
  return Array.from(new Set([...(current ?? []), ...fields])) as ManualOverrideField[];
}
