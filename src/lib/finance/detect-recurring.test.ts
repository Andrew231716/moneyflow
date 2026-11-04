import { describe, expect, it } from "vitest";
import {
  detectRecurringFromHistory,
  normalizeRecurringLabel,
} from "@/lib/finance/detect-recurring";
import type { RecurringTransaction, Transaction } from "@/types/database";

const baseTx = (over: Partial<Transaction>): Transaction =>
  ({
    id: "1",
    user_id: "u",
    account_id: "acc1",
    category_id: null,
    type: "expense",
    amount: 10,
    description: "x",
    notes: null,
    date: "2026-09-10",
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

describe("normalizeRecurringLabel", () => {
  it("strips noise and digits", () => {
    expect(normalizeRecurringLabel("NETFLIX.COM 48392011 PAGAMENTO")).toBe(
      "netflix com"
    );
    expect(normalizeRecurringLabel("Spotify AB SEPA 998877")).toContain("spotify");
  });
});

describe("detectRecurringFromHistory", () => {
  const asOf = new Date("2026-11-05");

  it("detects a monthly Netflix-like expense and seeds category", () => {
    const txs = [
      baseTx({
        id: "n1",
        merchant: "Netflix",
        description: "NETFLIX.COM",
        amount: 15.99,
        date: "2026-08-12",
        category_id: "cat-abb",
      }),
      baseTx({
        id: "n2",
        merchant: "Netflix",
        description: "NETFLIX.COM",
        amount: 15.99,
        date: "2026-09-12",
        category_id: "cat-abb",
      }),
      baseTx({
        id: "n3",
        merchant: "Netflix",
        description: "NETFLIX.COM",
        amount: 15.99,
        date: "2026-10-12",
        category_id: "cat-abb",
      }),
    ];

    const found = detectRecurringFromHistory(txs, [], { asOf });
    expect(found).toHaveLength(1);
    expect(found[0]!.description.toLowerCase()).toContain("netflix");
    expect(found[0]!.amount).toBe(15.99);
    expect(found[0]!.type).toBe("expense");
    expect(found[0]!.frequency).toBe("monthly");
    expect(found[0]!.suggested_category_id).toBe("cat-abb");
    expect(found[0]!.occurrence_count).toBe(3);
    expect(found[0]!.day_of_month).toBe(12);
    expect(found[0]!.next_due_date).toBe("2026-11-12");
    expect(found[0]!.confidence).toBeGreaterThan(0.5);
  });

  it("ignores one-off and irregular spend", () => {
    const txs = [
      baseTx({ id: "a", description: "Esselunga", amount: 80, date: "2026-08-03" }),
      baseTx({ id: "b", description: "Esselunga", amount: 45, date: "2026-08-17" }),
      baseTx({ id: "c", description: "Esselunga", amount: 120, date: "2026-09-02" }),
      baseTx({ id: "d", description: "Esselunga", amount: 30, date: "2026-09-20" }),
      baseTx({ id: "e", description: "Esselunga", amount: 95, date: "2026-10-05" }),
    ];
    expect(detectRecurringFromHistory(txs, [], { asOf })).toHaveLength(0);
  });

  it("skips patterns already covered by an active recurring", () => {
    const txs = [
      baseTx({
        id: "r1",
        description: "Affitto casa",
        amount: 800,
        date: "2026-08-01",
      }),
      baseTx({
        id: "r2",
        description: "Affitto casa",
        amount: 800,
        date: "2026-09-01",
      }),
      baseTx({
        id: "r3",
        description: "Affitto casa",
        amount: 800,
        date: "2026-10-01",
      }),
    ];
    const existing = [
      {
        id: "rec1",
        description: "Affitto",
        amount: 800,
        type: "expense",
        is_active: true,
      },
    ] as RecurringTransaction[];

    expect(detectRecurringFromHistory(txs, existing, { asOf })).toHaveLength(0);
  });

  it("tolerates small amount drift and prefers expenses when filtered", () => {
    const txs = [
      baseTx({
        id: "g1",
        merchant: "Palestra Fit",
        amount: 39.9,
        date: "2026-07-05",
      }),
      baseTx({
        id: "g2",
        merchant: "Palestra Fit",
        amount: 39.9,
        date: "2026-08-05",
      }),
      baseTx({
        id: "g3",
        merchant: "Palestra Fit",
        amount: 41.0,
        date: "2026-09-05",
      }),
      baseTx({
        id: "g4",
        merchant: "Palestra Fit",
        amount: 39.9,
        date: "2026-10-05",
      }),
      baseTx({
        id: "inc",
        type: "income",
        merchant: "ACME SRL",
        description: "Stipendio",
        amount: 2200,
        date: "2026-08-27",
      }),
      baseTx({
        id: "inc2",
        type: "income",
        merchant: "ACME SRL",
        description: "Stipendio",
        amount: 2200,
        date: "2026-09-27",
      }),
      baseTx({
        id: "inc3",
        type: "income",
        merchant: "ACME SRL",
        description: "Stipendio",
        amount: 2200,
        date: "2026-10-27",
      }),
    ];

    const expensesOnly = detectRecurringFromHistory(txs, [], {
      asOf,
      types: ["expense"],
    });
    expect(expensesOnly).toHaveLength(1);
    expect(expensesOnly[0]!.description.toLowerCase()).toContain("palestra");

    const both = detectRecurringFromHistory(txs, [], { asOf });
    expect(both.length).toBeGreaterThanOrEqual(2);
  });

  it("excludes pending bank rows", () => {
    const txs = [
      baseTx({
        id: "p1",
        merchant: "Sky",
        amount: 29.9,
        date: "2026-08-10",
        booking_status: "pending",
      }),
      baseTx({
        id: "p2",
        merchant: "Sky",
        amount: 29.9,
        date: "2026-09-10",
      }),
      baseTx({
        id: "p3",
        merchant: "Sky",
        amount: 29.9,
        date: "2026-10-10",
      }),
    ];
    // Only 2 booked → below minOccurrences
    expect(detectRecurringFromHistory(txs, [], { asOf })).toHaveLength(0);
  });
});
