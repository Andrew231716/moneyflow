import type { Account } from "@/types/database";

export const SUPPORTED_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "PLN",
  "RON",
  "CZK",
  "SEK",
  "NOK",
  "DKK",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function normalizeCurrency(code: string | null | undefined): string {
  const c = (code || "EUR").trim().toUpperCase();
  return c || "EUR";
}

export function groupBalancesByCurrency(
  accounts: Account[]
): { currency: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const a of accounts) {
    if (a.is_archived) continue;
    const currency = normalizeCurrency(a.currency);
    const prev = map.get(currency) ?? { total: 0, count: 0 };
    prev.total += Number(a.balance);
    prev.count += 1;
    map.set(currency, prev);
  }
  return Array.from(map.entries())
    .map(([currency, v]) => ({ currency, total: v.total, count: v.count }))
    .sort((a, b) => {
      if (a.currency === "EUR") return -1;
      if (b.currency === "EUR") return 1;
      return a.currency.localeCompare(b.currency);
    });
}

/** Prefer EUR when mixed; otherwise the first group. Never sums across currencies. */
export function primaryCurrencyTotal(
  accounts: Account[]
): { currency: string; total: number; mixed: boolean } {
  const groups = groupBalancesByCurrency(accounts);
  if (groups.length === 0) return { currency: "EUR", total: 0, mixed: false };
  if (groups.length === 1) {
    return { currency: groups[0].currency, total: groups[0].total, mixed: false };
  }
  const eur = groups.find((g) => g.currency === "EUR");
  const primary = eur ?? groups[0];
  return {
    currency: primary.currency,
    total: primary.total,
    mixed: true,
  };
}
