import { addMonths, format, parseISO } from "date-fns";
import type {
  RecurringFrequency,
  RecurringTransaction,
  Transaction,
} from "@/types/database";

/** Stable id for a detected pattern (also used to dismiss suggestions). */
export type DetectedRecurringId = string;

export interface DetectedRecurring {
  id: DetectedRecurringId;
  /** Clean label for the recurring row */
  description: string;
  amount: number;
  type: "income" | "expense";
  frequency: Extract<RecurringFrequency, "monthly">;
  account_id: string;
  /** Mode of historical category_id, if any */
  suggested_category_id: string | null;
  next_due_date: string;
  occurrence_count: number;
  /** Distinct months covered */
  month_count: number;
  /** Typical day of month (1–31) */
  day_of_month: number;
  /** Median absolute gap between consecutive hits (days) */
  median_interval_days: number;
  sample_dates: string[];
  confidence: number;
  transaction_ids: string[];
}

export interface DetectRecurringOptions {
  /** Minimum booked hits (default 2) */
  minOccurrences?: number;
  /** Relative amount tolerance vs median (default 0.03 = 3%) */
  amountTolerancePct?: number;
  /** Absolute amount tolerance floor in currency units (default 0.5) */
  amountToleranceAbs?: number;
  /** Acceptable monthly gap range in days (default 24–40) */
  minIntervalDays?: number;
  maxIntervalDays?: number;
  /** Day-of-month tolerance when clustering by amount (default 3) */
  dayTolerance?: number;
  /** Only expenses, only income, or both (default both) */
  types?: Array<"income" | "expense">;
  /** Reference "today" for next_due_date (default now) */
  asOf?: Date;
}

const NOISE =
  /\b(carta|card|pos|pagamento|pag\.?|addebito|addeb|bonifico|bon\.?|sepa|sdd|rid|trx|ref|id|nr|n\.?|oper\.?|operazione|commissione|comm\.?|visa|mastercard|bancomat)\b/gi;
const DIGITS_REF = /\b\d{3,}\b/g;
const MULTI_SPACE = /\s+/g;

/** Normalize merchant/description for grouping recurring candidates. */
export function normalizeRecurringLabel(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(NOISE, " ")
    .replace(DIGITS_REF, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(MULTI_SPACE, " ")
    .trim();
}

function pickRawLabel(
  tx: Pick<
    Transaction,
    "merchant" | "description" | "original_merchant" | "original_description"
  >
): string {
  const candidates = [
    tx.merchant,
    tx.original_merchant,
    tx.description,
    tx.original_description,
  ];
  for (const c of candidates) {
    const t = (c ?? "").trim();
    if (t) return t;
  }
  return "";
}

function displayLabel(raw: string, normalized: string): string {
  const cleaned = raw
    .replace(DIGITS_REF, " ")
    .replace(MULTI_SPACE, " ")
    .trim();
  if (cleaned.length >= 3) {
    return cleaned
      .split(" ")
      .slice(0, 6)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return normalized
    .split(" ")
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function mode<T extends string | number>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function daysBetween(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function amountsClose(
  a: number,
  b: number,
  pct: number,
  absFloor: number
): boolean {
  const tol = Math.max(absFloor, Math.abs(a) * pct);
  return Math.abs(a - b) <= tol;
}

function dayDistance(a: number, b: number): number {
  const direct = Math.abs(a - b);
  return Math.min(direct, 31 - direct);
}

function looksLikeExisting(
  candidate: { description: string; amount: number; type: string },
  existing: RecurringTransaction[],
  pct: number,
  absFloor: number
): boolean {
  const candNorm = normalizeRecurringLabel(candidate.description);
  for (const r of existing) {
    if (!r.is_active) continue;
    if (r.type !== candidate.type) continue;
    if (!amountsClose(Number(r.amount), candidate.amount, pct, absFloor)) {
      continue;
    }
    const existingNorm = normalizeRecurringLabel(r.description);
    if (!existingNorm || !candNorm) {
      // Same amount alone is enough to skip if descriptions empty
      if (!existingNorm && !candNorm) return true;
      continue;
    }
    if (
      existingNorm === candNorm ||
      existingNorm.includes(candNorm) ||
      candNorm.includes(existingNorm) ||
      shareSignificantToken(existingNorm, candNorm)
    ) {
      return true;
    }
  }
  return false;
}

function shareSignificantToken(a: string, b: string): boolean {
  const tokensA = a.split(" ").filter((t) => t.length >= 4);
  const tokensB = new Set(b.split(" ").filter((t) => t.length >= 4));
  return tokensA.some((t) => tokensB.has(t));
}

function nextDueFromPattern(
  lastDate: string,
  dayOfMonth: number,
  asOf: Date
): string {
  const last = parseISO(lastDate);
  let candidate = addMonths(last, 1);
  candidate = new Date(
    candidate.getFullYear(),
    candidate.getMonth(),
    Math.min(
      dayOfMonth,
      new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()
    )
  );
  const asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  let guard = 0;
  while (candidate < asOfDay && guard < 24) {
    candidate = addMonths(candidate, 1);
    candidate = new Date(
      candidate.getFullYear(),
      candidate.getMonth(),
      Math.min(
        dayOfMonth,
        new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()
      )
    );
    guard += 1;
  }
  return format(candidate, "yyyy-MM-dd");
}

function scoreConfidence(params: {
  occurrenceCount: number;
  monthCount: number;
  medianInterval: number;
  amountSpreadPct: number;
  daySpread: number;
  labelConsistent: boolean;
}): number {
  let score = 0.3;
  score += Math.min(0.35, (params.occurrenceCount - 2) * 0.1);
  score += Math.min(0.2, (params.monthCount - 2) * 0.07);
  if (params.medianInterval >= 28 && params.medianInterval <= 32) score += 0.15;
  else if (params.medianInterval >= 24 && params.medianInterval <= 40)
    score += 0.08;
  if (params.amountSpreadPct <= 0.01) score += 0.12;
  else if (params.amountSpreadPct <= 0.03) score += 0.06;
  if (params.daySpread <= 2) score += 0.12;
  else if (params.daySpread <= 4) score += 0.05;
  if (params.labelConsistent) score += 0.08;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

function onePerMonth(
  txs: Transaction[],
  medAmount: number
): Transaction[] {
  const byMonth = new Map<string, Transaction>();
  for (const tx of txs) {
    const monthKey = tx.date.slice(0, 7);
    const prev = byMonth.get(monthKey);
    if (!prev) {
      byMonth.set(monthKey, tx);
      continue;
    }
    if (
      Math.abs(Number(tx.amount) - medAmount) <
      Math.abs(Number(prev.amount) - medAmount)
    ) {
      byMonth.set(monthKey, tx);
    }
  }
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildCandidateFromMonthly(
  monthly: Transaction[],
  opts: {
    amountTolerancePct: number;
    amountToleranceAbs: number;
    minIntervalDays: number;
    maxIntervalDays: number;
    minOccurrences: number;
    existing: RecurringTransaction[];
    asOf: Date;
    preferredLabel?: string;
  }
): DetectedRecurring | null {
  if (monthly.length < opts.minOccurrences) return null;

  const intervals: number[] = [];
  for (let i = 1; i < monthly.length; i++) {
    intervals.push(daysBetween(monthly[i - 1]!.date, monthly[i]!.date));
  }
  const medInterval = median(intervals);
  // Single interval (2 hits): must look monthly
  if (intervals.length === 1) {
    if (
      medInterval < opts.minIntervalDays ||
      medInterval > opts.maxIntervalDays
    ) {
      return null;
    }
  } else {
    if (medInterval < opts.minIntervalDays || medInterval > opts.maxIntervalDays) {
      return null;
    }
    const goodGaps = intervals.filter(
      (d) => d >= opts.minIntervalDays && d <= opts.maxIntervalDays
    ).length;
    const doubleGaps = intervals.filter(
      (d) =>
        d >= opts.minIntervalDays * 2 - 5 && d <= opts.maxIntervalDays * 2 + 5
    ).length;
    if (goodGaps + doubleGaps < intervals.length * 0.5) return null;
  }

  const days = monthly.map((t) => parseISO(t.date).getDate());
  const dayOfMonth = mode(days) ?? days[days.length - 1]!;
  const daySpread =
    Math.max(...days) - Math.min(...days) <= 12
      ? Math.max(...days) - Math.min(...days)
      : Math.min(
          Math.max(...days) - Math.min(...days),
          31 - Math.max(...days) + Math.min(...days)
        );

  const amounts = monthly.map((t) => Number(t.amount));
  const amountMed = median(amounts);
  const amountSpreadPct =
    amountMed > 0
      ? (Math.max(...amounts) - Math.min(...amounts)) / amountMed
      : 0;

  const type = monthly[0]!.type as "income" | "expense";
  const accountId =
    mode(monthly.map((t) => t.account_id)) ??
    monthly[monthly.length - 1]!.account_id;

  const categoryIds = monthly
    .map((t) => t.category_id)
    .filter((id): id is string => Boolean(id));
  const suggestedCategory = mode(categoryIds);

  const rawLabels = monthly.map((t) => pickRawLabel(t)).filter(Boolean);
  const norms = rawLabels.map(normalizeRecurringLabel).filter((n) => n.length >= 3);
  const labelConsistent =
    norms.length >= 2 &&
    (Boolean(mode(norms)) ||
      norms.some((n, i) =>
        norms.some((m, j) => i !== j && shareSignificantToken(n, m))
      ));

  const bestNorm = mode(norms) ?? norms[0] ?? "";
  const rawBest =
    opts.preferredLabel ||
    mode(rawLabels.map((l) => l.trim()).filter(Boolean)) ||
    rawLabels[0] ||
    `Uscita ${amountMed.toFixed(2)}`;
  const description = displayLabel(rawBest, bestNorm || `importo ${amountMed}`);

  if (
    looksLikeExisting(
      { description, amount: amountMed, type },
      opts.existing,
      opts.amountTolerancePct,
      opts.amountToleranceAbs
    )
  ) {
    return null;
  }

  const last = monthly[monthly.length - 1]!;
  const confidence = scoreConfidence({
    occurrenceCount: monthly.length,
    monthCount: monthly.length,
    medianInterval: medInterval,
    amountSpreadPct,
    daySpread,
    labelConsistent,
  });

  const roundedAmount = Math.round(amountMed * 100) / 100;
  const idKey = bestNorm || `amt${roundedAmount.toFixed(2)}-d${dayOfMonth}`;
  const id = `${type}:${idKey}:${roundedAmount.toFixed(2)}`;

  return {
    id,
    description,
    amount: roundedAmount,
    type,
    frequency: "monthly",
    account_id: accountId,
    suggested_category_id: suggestedCategory,
    next_due_date: nextDueFromPattern(last.date, dayOfMonth, opts.asOf),
    occurrence_count: monthly.length,
    month_count: monthly.length,
    day_of_month: dayOfMonth,
    median_interval_days: medInterval,
    sample_dates: monthly.map((t) => t.date),
    confidence,
    transaction_ids: monthly.map((t) => t.id),
  };
}

/**
 * Detect monthly recurring income/expense patterns from booked transaction history.
 * Uses merchant/description groups AND same-amount + same day-of-month clusters
 * (even when bank labels differ month to month).
 */
export function detectRecurringFromHistory(
  transactions: Transaction[],
  existing: RecurringTransaction[] = [],
  options: DetectRecurringOptions = {}
): DetectedRecurring[] {
  const minOccurrences = options.minOccurrences ?? 2;
  const amountTolerancePct = options.amountTolerancePct ?? 0.03;
  const amountToleranceAbs = options.amountToleranceAbs ?? 0.5;
  const minIntervalDays = options.minIntervalDays ?? 24;
  const maxIntervalDays = options.maxIntervalDays ?? 40;
  const dayTolerance = options.dayTolerance ?? 3;
  const types = options.types ?? (["income", "expense"] as const);
  const asOf = options.asOf ?? new Date();
  const typeSet = new Set(types);

  const eligible = transactions.filter((tx) => {
    if (tx.type !== "income" && tx.type !== "expense") return false;
    if (!typeSet.has(tx.type)) return false;
    if (tx.booking_status === "pending") return false;
    if (tx.excluded_from_budget) return false;
    return true;
  });

  const results: DetectedRecurring[] = [];
  const seenTx = new Set<string>();

  const pushUnique = (candidate: DetectedRecurring | null) => {
    if (!candidate) return;
    // Skip if most txs already claimed by a stronger candidate
    const fresh = candidate.transaction_ids.filter((id) => !seenTx.has(id));
    if (fresh.length < minOccurrences && candidate.occurrence_count > fresh.length) {
      // Still allow if majority new
      if (fresh.length < Math.ceil(candidate.occurrence_count * 0.6)) return;
    }
    // Dedup by similar id/amount/day
    const dup = results.find(
      (r) =>
        r.type === candidate.type &&
        amountsClose(r.amount, candidate.amount, amountTolerancePct, amountToleranceAbs) &&
        dayDistance(r.day_of_month, candidate.day_of_month) <= dayTolerance
    );
    if (dup) {
      if (candidate.confidence > dup.confidence) {
        const idx = results.indexOf(dup);
        results[idx] = candidate;
        for (const id of candidate.transaction_ids) seenTx.add(id);
      }
      return;
    }
    results.push(candidate);
    for (const id of candidate.transaction_ids) seenTx.add(id);
  };

  // Pass 1: group by type + normalized label
  const labelGroups = new Map<
    string,
    { rawLabels: string[]; txs: Transaction[] }
  >();
  for (const tx of eligible) {
    const raw = pickRawLabel(tx);
    const norm = normalizeRecurringLabel(raw);
    if (norm.length < 3) continue;
    const key = `${tx.type}::${norm}`;
    const g = labelGroups.get(key) ?? { rawLabels: [], txs: [] };
    g.rawLabels.push(raw);
    g.txs.push(tx);
    labelGroups.set(key, g);
  }

  for (const [, group] of labelGroups) {
    const sortedAll = [...group.txs].sort((a, b) => a.date.localeCompare(b.date));
    const medAmount = median(sortedAll.map((t) => Number(t.amount)));
    const cluster = sortedAll.filter((t) =>
      amountsClose(
        Number(t.amount),
        medAmount,
        amountTolerancePct,
        amountToleranceAbs
      )
    );
    const monthly = onePerMonth(cluster, medAmount);
    pushUnique(
      buildCandidateFromMonthly(monthly, {
        amountTolerancePct,
        amountToleranceAbs,
        minIntervalDays,
        maxIntervalDays,
        minOccurrences,
        existing,
        asOf,
        preferredLabel:
          mode(group.rawLabels.map((l) => l.trim()).filter(Boolean)) ?? undefined,
      })
    );
  }

  // Pass 2: same amount (+tolerance) + same day-of-month — catches varying bank labels
  const byTypeAmount = new Map<string, Transaction[]>();
  for (const tx of eligible) {
    const amt = Math.round(Number(tx.amount) * 100) / 100;
    const key = `${tx.type}::${amt.toFixed(2)}`;
    const list = byTypeAmount.get(key) ?? [];
    list.push(tx);
    byTypeAmount.set(key, list);
  }

  for (const [, txs] of byTypeAmount) {
    if (txs.length < minOccurrences) continue;
    const days = txs.map((t) => parseISO(t.date).getDate());
    const dayMode = mode(days);
    if (dayMode == null) continue;

    const dayCluster = txs.filter(
      (t) => dayDistance(parseISO(t.date).getDate(), dayMode) <= dayTolerance
    );
    const medAmount = median(dayCluster.map((t) => Number(t.amount)));
    const monthly = onePerMonth(dayCluster, medAmount);
    pushUnique(
      buildCandidateFromMonthly(monthly, {
        amountTolerancePct,
        amountToleranceAbs,
        minIntervalDays,
        maxIntervalDays,
        minOccurrences,
        existing,
        asOf,
      })
    );
  }

  return results.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.amount - a.amount;
  });
}
