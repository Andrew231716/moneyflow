import { describe, expect, it } from "vitest";
import { countSyncReviewItems } from "@/lib/finance/sync-review";
import type { Transaction } from "@/types/database";

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: "1",
    user_id: "u",
    account_id: "a",
    category_id: null,
    type: "expense",
    amount: 10,
    description: "x",
    notes: null,
    date: "2026-11-01",
    source: "manual",
    transfer_pair_id: null,
    transfer_account_id: null,
    excluded_from_budget: false,
    booking_status: "booked",
    original_description: null,
    original_merchant: null,
    category_source: "manual",
    provider: null,
    provider_transaction_id: null,
    bank_account_id: null,
    raw_data: null,
    manual_description_override: false,
    manual_category_override: false,
    fingerprint: null,
    merchant: null,
    possible_transfer_match_id: null,
    manual_override_fields: [],
    created_at: "",
    updated_at: "",
    ...over,
  }) as Transaction;

describe("countSyncReviewItems", () => {
  it("counts pending, uncategorized, and transfer pairs", () => {
    const rows = [
      tx({ id: "p1", booking_status: "pending" }),
      tx({ id: "u1", category_id: null }),
      tx({
        id: "t1",
        amount: 50,
        possible_transfer_match_id: "t2",
        category_id: "c1",
      }),
      tx({
        id: "t2",
        amount: 50,
        type: "income",
        possible_transfer_match_id: "t1",
        category_id: "c1",
      }),
    ];
    expect(countSyncReviewItems(rows)).toEqual({
      pending: 1,
      uncategorized: 1,
      transfers: 1,
      total: 3,
    });
  });
});
