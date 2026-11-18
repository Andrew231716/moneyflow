import type { Transaction } from "@/types/database";

/** Pure helper — safe to import from Server Components. */
export function countTransferPairs(transactions: Transaction[]): number {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  const seen = new Set<string>();
  let n = 0;
  for (const tx of transactions) {
    if (!tx.possible_transfer_match_id || tx.type === "transfer") continue;
    const other = byId.get(tx.possible_transfer_match_id);
    if (!other || other.type === "transfer") continue;
    const key = [tx.id, other.id].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    n += 1;
  }
  return n;
}

/** Pure helper — safe to import from Server Components. */
export function countSyncReviewItems(transactions: Transaction[]): {
  pending: number;
  uncategorized: number;
  transfers: number;
  total: number;
} {
  const pending = transactions.filter(
    (t) => (t.booking_status ?? "booked") === "pending"
  ).length;
  const uncategorized = transactions.filter(
    (t) =>
      t.type !== "transfer" &&
      !t.category_id &&
      (t.booking_status ?? "booked") !== "pending"
  ).length;
  const transfers = countTransferPairs(transactions);
  return {
    pending,
    uncategorized,
    transfers,
    total: pending + uncategorized + transfers,
  };
}
