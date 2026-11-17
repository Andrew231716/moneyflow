import { format, parseISO } from "date-fns";
import {
  detectRecurringFromHistory,
  type DetectedRecurring,
} from "@/lib/finance/detect-recurring";
import type { Debt, RecurringTransaction, Transaction } from "@/types/database";

export type UpcomingPaymentSource = "recurring" | "debt" | "predicted";

export interface UpcomingPaymentItem {
  id: string;
  date: string;
  title: string;
  amount: number;
  currency?: string;
  source: UpcomingPaymentSource;
  /** For predicted items: confidence 0–1 */
  confidence?: number;
  /** How many past months/hits informed the prediction */
  occurrence_count?: number;
  href?: string;
  /** Confirmed recurring row id (without prefix) */
  recurring_id?: string;
  /** Debt row id */
  debt_id?: string;
  /** Seed fields for confirming a prediction */
  account_id?: string;
  category_id?: string | null;
  detection_key?: string;
  frequency?: RecurringTransaction["frequency"];
}

export interface BuildUpcomingPaymentsParams {
  recurring: RecurringTransaction[];
  debts: Debt[];
  transactions?: Transaction[];
  /** Include history-based predictions (default true) */
  includePredicted?: boolean;
  /** Max days ahead to keep (default 60) */
  horizonDays?: number;
  /** Min confidence for predicted items (default 0.5) */
  minConfidence?: number;
  asOf?: Date;
  limit?: number;
}

function isoToday(asOf: Date): string {
  return format(asOf, "yyyy-MM-dd");
}

function addDaysIso(asOf: Date, days: number): string {
  const d = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

/**
 * Build a sorted list of upcoming money outflows:
 * confirmed recurring expenses, dated debts, and high-confidence
 * patterns inferred from previous months (not yet added as recurring).
 */
export function buildUpcomingPayments(
  params: BuildUpcomingPaymentsParams
): UpcomingPaymentItem[] {
  const {
    recurring,
    debts,
    transactions = [],
    includePredicted = true,
    horizonDays = 60,
    minConfidence = 0.5,
    asOf = new Date(),
    limit = 12,
  } = params;

  const today = isoToday(asOf);
  const until = addDaysIso(asOf, horizonDays);

  const items: UpcomingPaymentItem[] = [];

  for (const item of recurring) {
    if (!item.is_active || item.type !== "expense") continue;
    const date = item.next_due_date.slice(0, 10);
    if (date < today || date > until) continue;
    items.push({
      id: `recurring-${item.id}`,
      date,
      title: item.description,
      amount: Number(item.amount),
      currency: item.account?.currency,
      source: "recurring",
      href: "/recurring",
      recurring_id: item.id,
      account_id: item.account_id,
      category_id: item.category_id,
      frequency: item.frequency,
    });
  }

  for (const item of debts) {
    if (item.paid_at || !item.due_date) continue;
    const date = item.due_date.slice(0, 10);
    if (date < today || date > until) continue;
    items.push({
      id: `debt-${item.id}`,
      date,
      title: item.name,
      amount: Number(item.amount),
      source: "debt",
      href: "/debts",
      debt_id: item.id,
    });
  }

  if (includePredicted && transactions.length > 0) {
    const detections = detectRecurringFromHistory(transactions, recurring, {
      types: ["expense"],
      asOf,
      minOccurrences: 3,
    });
    for (const d of detections) {
      if (d.confidence < minConfidence) continue;
      const date = d.next_due_date.slice(0, 10);
      if (date < today || date > until) continue;
      if (overlapsConfirmed(d, items)) continue;
      items.push({
        id: `predicted-${d.id}`,
        date,
        title: d.description,
        amount: d.amount,
        source: "predicted",
        confidence: d.confidence,
        occurrence_count: d.occurrence_count,
        href: "/recurring",
        account_id: d.account_id,
        category_id: d.suggested_category_id,
        detection_key: d.id,
        frequency: d.frequency,
      });
    }
  }

  items.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    // Prefer confirmed over predicted on same day
    const rank = (s: UpcomingPaymentSource) =>
      s === "recurring" ? 0 : s === "debt" ? 1 : 2;
    return rank(a.source) - rank(b.source);
  });

  return items.slice(0, limit);
}

function overlapsConfirmed(
  detection: DetectedRecurring,
  items: UpcomingPaymentItem[]
): boolean {
  const day = detection.day_of_month;
  for (const item of items) {
    if (item.source === "predicted") continue;
    const itemDay = parseISO(item.date).getDate();
    const amountClose =
      Math.abs(item.amount - detection.amount) <=
      Math.max(0.5, detection.amount * 0.05);
    const dayClose = Math.abs(itemDay - day) <= 3;
    if (amountClose && dayClose) return true;
    const title = item.title.toLowerCase();
    const det = detection.description.toLowerCase();
    if (amountClose && (title.includes(det) || det.includes(title))) {
      return true;
    }
  }
  return false;
}

export function sumUpcomingAmounts(items: UpcomingPaymentItem[]): number {
  return Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;
}

export function unpaidDebtsWithoutDue(debts: Debt[]): Debt[] {
  return debts.filter((d) => !d.paid_at && !d.due_date);
}
