import { describe, expect, it } from "vitest";
import { buildUpcomingPayments } from "@/lib/finance/upcoming-payments";
import type { Debt, RecurringTransaction, Transaction } from "@/types/database";

const asOf = new Date("2026-11-05");

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

describe("buildUpcomingPayments", () => {
  it("includes confirmed recurring and dated debts in horizon", () => {
    const recurring = [
      {
        id: "r1",
        description: "Affitto",
        amount: 800,
        type: "expense",
        is_active: true,
        next_due_date: "2026-11-10",
      },
      {
        id: "r2",
        description: "Vecchio",
        amount: 10,
        type: "expense",
        is_active: true,
        next_due_date: "2026-10-01",
      },
    ] as RecurringTransaction[];

    const debts = [
      {
        id: "d1",
        name: "Mutuo auto",
        amount: 200,
        paid_at: null,
        due_date: "2026-11-20",
      },
      {
        id: "d2",
        name: "Senza data",
        amount: 50,
        paid_at: null,
        due_date: null,
      },
    ] as Debt[];

    const items = buildUpcomingPayments({
      recurring,
      debts,
      transactions: [],
      asOf,
      includePredicted: false,
    });

    expect(items.map((i) => i.title)).toEqual(["Affitto", "Mutuo auto"]);
    expect(items[0]!.source).toBe("recurring");
    expect(items[1]!.source).toBe("debt");
  });

  it("adds predicted payments from prior months when not already recurring", () => {
    const txs = [
      baseTx({
        id: "n1",
        merchant: "Netflix",
        amount: 15.99,
        date: "2026-08-12",
      }),
      baseTx({
        id: "n2",
        merchant: "Netflix",
        amount: 15.99,
        date: "2026-09-12",
      }),
      baseTx({
        id: "n3",
        merchant: "Netflix",
        amount: 15.99,
        date: "2026-10-12",
      }),
    ];

    const items = buildUpcomingPayments({
      recurring: [],
      debts: [],
      transactions: txs,
      asOf,
    });

    expect(items.some((i) => i.source === "predicted")).toBe(true);
    const netflix = items.find((i) => i.title.toLowerCase().includes("netflix"));
    expect(netflix).toBeTruthy();
    expect(netflix!.date).toBe("2026-11-12");
    expect(netflix!.occurrence_count).toBe(3);
  });

  it("does not duplicate a prediction already covered by recurring", () => {
    const txs = [
      baseTx({
        id: "n1",
        merchant: "Netflix",
        amount: 15.99,
        date: "2026-08-12",
      }),
      baseTx({
        id: "n2",
        merchant: "Netflix",
        amount: 15.99,
        date: "2026-09-12",
      }),
      baseTx({
        id: "n3",
        merchant: "Netflix",
        amount: 15.99,
        date: "2026-10-12",
      }),
    ];
    const recurring = [
      {
        id: "r1",
        description: "Netflix",
        amount: 15.99,
        type: "expense",
        is_active: true,
        next_due_date: "2026-11-12",
      },
    ] as RecurringTransaction[];

    const items = buildUpcomingPayments({
      recurring,
      debts: [],
      transactions: txs,
      asOf,
    });

    expect(items.filter((i) => i.source === "predicted")).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0]!.source).toBe("recurring");
  });
});
