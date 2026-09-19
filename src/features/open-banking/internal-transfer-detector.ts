import type { InternalTransferSuggestion } from "./types";

export interface TransferCandidate {
  id: string;
  amount: number;
  currency: string;
  date: string; // YYYY-MM-DD
  type: "income" | "expense" | "transfer";
  account_id: string;
}

function parseDate(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
}

function daysApart(a: string, b: string): number {
  return Math.abs(parseDate(a) - parseDate(b)) / (24 * 60 * 60 * 1000);
}

/**
 * Suggest possible internal transfers:
 * same absolute amount + currency + user scope, opposite direction,
 * different accounts, within ±1 day.
 *
 * Suggestion only — never set type=transfer without user confirm.
 */
export function detectInternalTransfers(
  candidates: TransferCandidate[],
  options: { maxDayDelta?: number } = {}
): InternalTransferSuggestion[] {
  const maxDayDelta = options.maxDayDelta ?? 1;
  const suggestions: InternalTransferSuggestion[] = [];
  const used = new Set<string>();

  const sorted = [...candidates]
    .filter((c) => c.type === "income" || c.type === "expense")
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (used.has(a.id)) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (used.has(b.id)) continue;
      if (a.account_id === b.account_id) continue;
      if (a.type === b.type) continue;
      if (a.currency.toUpperCase() !== b.currency.toUpperCase()) continue;
      if (Math.abs(a.amount - b.amount) > 0.001) continue;
      if (daysApart(a.date, b.date) > maxDayDelta) continue;

      suggestions.push({
        transactionId: a.id,
        matchedTransactionId: b.id,
        amount: a.amount,
        currency: a.currency,
        dateA: a.date,
        dateB: b.date,
      });
      used.add(a.id);
      used.add(b.id);
      break;
    }
  }

  return suggestions;
}
