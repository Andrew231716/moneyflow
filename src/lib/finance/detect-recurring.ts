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
  /** Minimum booked hits (default 3) */
  minOccurrences?: number;
  /** Relative amount tolerance vs median (default 0.05 = 5%) */
  amountTolerancePct?: number;
  /** Absolute amount tolerance floor in currency units (default 0.5) */
  amountToleranceAbs?: number;
  /** Acceptable monthly gap range in days (default 26–35) */
  minIntervalDays?: number;
  maxIntervalDays?: number;
  /** Only expenses, only income, or both (default both) */
  types?: Array<"income" | "expense">;
  /** Reference "today" for next_due_date (default now) */
  asOf?: Date;
}

const NOISE =
  /\b(carta|card|pos|pagamento|pag\.?|addebito|addeb|bonifico|bon\.?|sepa|sdd|rid|trx|ref|id|nr|n\.?|oper\.?|operazione|commissione|comm\.?)\b/gi;
const DIGITS_REF = /\b\d{4,}\b/g;
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

function pickRawLabel(tx: Pick<Transaction, "merchant" | "description" | "original_merchant" | "original_description">): string {
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
    // Title-case first words for a nicer recurring description
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
    if (!existingNorm || !candNorm) continue;
    if (
      existingNorm === candNorm ||
      existingNorm.includes(candNorm) ||
      candNorm.includes(existingNorm)
    ) {
      return true;
    }
  }
  return false;
}

function nextDueFromPattern(
  lastDate: string,
  dayOfMonth: number,
  asOf: Date
): string {
  const last = parseISO(lastDate);
  let candidate = addMonths(last, 1);
  // Snap to typical day-of-month when possible
  const snapped = new Date(
    candidate.getFullYear(),
    candidate.getMonth(),
    Math.min(
      dayOfMonth,
      new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()
    )
  );
  candidate = snapped;
  // Advance until on/after asOf
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
}): number {
  let score = 0.35;
  score += Math.min(0.3, (params.occurrenceCount - 3) * 0.08);
  score += Math.min(0.2, (params.monthCount - 3) * 0.05);
  if (params.medianInterval >= 28 && params.medianInterval <= 32) score += 0.15;
  else if (params.medianInterval >= 26 && params.medianInterval <= 35)
    score += 0.08;
  if (params.amountSpreadPct <= 0.02) score += 0.1;
  else if (params.amountSpreadPct <= 0.05) score += 0.05;
  if (params.daySpread <= 2) score += 0.1;
  else if (params.daySpread <= 4) score += 0.04;
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100));
}

/**
 * Detect monthly recurring income/expense patterns from booked transaction history.
 * Pure function — does not write to the DB.
 */
export function detectRecurringFromHistory(
  transactions: Transaction[],
  existing: RecurringTransaction[] = [],
  options: DetectRecurringOptions = {}
): DetectedRecurring[] {
  const minOccurrences = options.minOccurrences ?? 3;
  const amountTolerancePct = options.amountTolerancePct ?? 0.05;
  const amountToleranceAbs = options.amountToleranceAbs ?? 0.5;
  const minIntervalDays = options.minIntervalDays ?? 26;
  const maxIntervalDays = options.maxIntervalDays ?? 35;
  const types = options.types ?? (["income", "expense"] as const);
  const asOf = options.asOf ?? new Date();

  const typeSet = new Set(types);

  // Group by type + normalized label
  const groups = new Map<
    string,
    { rawLabels: string[]; txs: Transaction[] }
  >();

  for (const tx of transactions) {
    if (tx.type !== "income" && tx.type !== "expense") continue;
    if (!typeSet.has(tx.type)) continue;
    if (tx.booking_status === "pending") continue;
    if (tx.excluded_from_budget) continue;

    const raw = pickRawLabel(tx);
    const norm = normalizeRecurringLabel(raw);
    if (norm.length < 3) continue;

    const key = `${tx.type}::${norm}`;
    const g = groups.get(key) ?? { rawLabels: [], txs: [] };
    g.rawLabels.push(raw);
    g.txs.push(tx);
    groups.set(key, g);
  }

  const results: DetectedRecurring[] = [];

  for (const [key, group] of groups) {
    const sortedAll = [...group.txs].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // Cluster by amount around the median of all hits for this label
    const allAmounts = sortedAll.map((t) => Number(t.amount));
    const medAmount = median(allAmounts);
    const cluster = sortedAll.filter((t) =>
      amountsClose(Number(t.amount), medAmount, amountTolerancePct, amountToleranceAbs)
    );

    if (cluster.length < minOccurrences) continue;

    // One hit per calendar month (keep closest to median day later)
    const byMonth = new Map<string, Transaction>();
    for (const tx of cluster) {
      const monthKey = tx.date.slice(0, 7);
      const prev = byMonth.get(monthKey);
      if (!prev) {
        byMonth.set(monthKey, tx);
        continue;
      }
      // Prefer amount closer to median
      if (
        Math.abs(Number(tx.amount) - medAmount) <
        Math.abs(Number(prev.amount) - medAmount)
      ) {
        byMonth.set(monthKey, tx);
      }
    }

    const monthly = [...byMonth.values()].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    if (monthly.length < minOccurrences) continue;

    const intervals: number[] = [];
    for (let i = 1; i < monthly.length; i++) {
      intervals.push(daysBetween(monthly[i - 1]!.date, monthly[i]!.date));
    }
    const medInterval = median(intervals);
    if (medInterval < minIntervalDays || medInterval > maxIntervalDays) {
      continue;
    }

    // Majority of gaps should look monthly (allow one skip / noise)
    const goodGaps = intervals.filter(
      (d) => d >= minIntervalDays && d <= maxIntervalDays
    ).length;
    const doubleGaps = intervals.filter(
      (d) => d >= minIntervalDays * 2 - 4 && d <= maxIntervalDays * 2 + 4
    ).length;
    if (goodGaps + doubleGaps < intervals.length * 0.6) continue;

    const days = monthly.map((t) => parseISO(t.date).getDate());
    const dayOfMonth = mode(days) ?? days[days.length - 1]!;
    const daySpread =
      Math.max(...days) - Math.min(...days) <= 10
        ? Math.max(...days) - Math.min(...days)
        : // wrap-around near month end (28–31 vs 1–3) → treat as tight
          Math.min(
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
    const accountCounts = monthly.map((t) => t.account_id);
    const accountId = mode(accountCounts) ?? monthly[monthly.length - 1]!.account_id;

    const categoryIds = monthly
      .map((t) => t.category_id)
      .filter((id): id is string => Boolean(id));
    const suggestedCategory = mode(categoryIds);

    const rawBest =
      mode(group.rawLabels.map((l) => l.trim()).filter(Boolean)) ??
      group.rawLabels[0] ??
      "";
    const norm = key.split("::")[1] ?? "";
    const description = displayLabel(rawBest, norm);

    if (
      looksLikeExisting(
        { description, amount: amountMed, type },
        existing,
        amountTolerancePct,
        amountToleranceAbs
      )
    ) {
      continue;
    }

    const last = monthly[monthly.length - 1]!;
    const confidence = scoreConfidence({
      occurrenceCount: monthly.length,
      monthCount: monthly.length,
      medianInterval: medInterval,
      amountSpreadPct,
      daySpread,
    });

    const roundedAmount = Math.round(amountMed * 100) / 100;
    const id = `${type}:${norm}:${roundedAmount.toFixed(2)}`;

    results.push({
      id,
      description,
      amount: roundedAmount,
      type,
      frequency: "monthly",
      account_id: accountId,
      suggested_category_id: suggestedCategory,
      next_due_date: nextDueFromPattern(last.date, dayOfMonth, asOf),
      occurrence_count: monthly.length,
      month_count: monthly.length,
      day_of_month: dayOfMonth,
      median_interval_days: medInterval,
      sample_dates: monthly.map((t) => t.date),
      confidence,
      transaction_ids: monthly.map((t) => t.id),
    });
  }

  return results.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.amount - a.amount;
  });
}
