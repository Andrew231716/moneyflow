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
  manual_override_fields: ManualOverrideField[] | string[] | null;
}

export type DedupDecision =
  | { action: "insert" }
  | { action: "skip"; existingId: string; reason: "provider_id" | "fingerprint" }
  | {
      action: "update";
      existingId: string;
      fields: Record<string, unknown>;
    };

function asOverrideSet(
  fields: ManualOverrideField[] | string[] | null | undefined
): Set<string> {
  return new Set(fields ?? []);
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

/**
 * Deduplicate by provider_transaction_id first, then fingerprint.
 */
export function decideDedup(
  incoming: NormalizedBankTransaction,
  existingByProviderId: Map<string, ExistingTransactionForDedup>,
  existingByFingerprint: Map<string, ExistingTransactionForDedup>
): DedupDecision {
  if (incoming.providerTransactionId) {
    const hit = existingByProviderId.get(incoming.providerTransactionId);
    if (hit) {
      const fields = mergeWithManualOverrides(hit, incoming);
      if (Object.keys(fields).length === 0) {
        return { action: "skip", existingId: hit.id, reason: "provider_id" };
      }
      return { action: "update", existingId: hit.id, fields };
    }
  }

  const byFp = existingByFingerprint.get(incoming.fingerprint);
  if (byFp) {
    const fields = mergeWithManualOverrides(byFp, incoming);
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
} {
  const byProviderId = new Map<string, ExistingTransactionForDedup>();
  const byFingerprint = new Map<string, ExistingTransactionForDedup>();

  for (const row of rows) {
    if (row.provider_transaction_id) {
      byProviderId.set(row.provider_transaction_id, row);
    }
    if (row.fingerprint) {
      byFingerprint.set(row.fingerprint, row);
    }
  }

  return { byProviderId, byFingerprint };
}

/** Mark fields the user edited so future syncs leave them alone. */
export function addManualOverrides(
  current: string[] | null | undefined,
  fields: ManualOverrideField[]
): ManualOverrideField[] {
  return Array.from(new Set([...(current ?? []), ...fields])) as ManualOverrideField[];
}
