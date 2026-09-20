import { describe, expect, it } from "vitest";
import {
  calcMonthSummary,
  calcTotalAvailability,
  getBudgetState,
  calcBudgetProgress,
  calcRecurringTotals,
  calcReservedGoalsTotal,
  isGoalReached,
  isGoalSettled,
} from "@/lib/finance/engine";
import type {
  Account,
  Budget,
  Goal,
  RecurringTransaction,
  Transaction,
} from "@/types/database";

const baseTx = (over: Partial<Transaction>): Transaction =>
  ({
    id: "1",
    user_id: "u",
    account_id: "a",
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

describe("financial engine", () => {
  it("sums availability excluding archived", () => {
    const accounts = [
      { balance: 100, is_archived: false },
      { balance: 50, is_archived: true },
      { balance: 20, is_archived: false },
    ] as Account[];
    expect(calcTotalAvailability(accounts)).toBe(120);
  });

  it("excludes transfers from month summary", () => {
    const txs = [
      baseTx({ type: "income", amount: 1000 }),
      baseTx({ type: "expense", amount: 200 }),
      baseTx({ type: "transfer", amount: 500 }),
    ];
    const s = calcMonthSummary(txs, new Date("2026-09-15"));
    expect(s.income).toBe(1000);
    expect(s.expense).toBe(200);
    expect(s.savings).toBe(800);
  });

  it("maps budget progress states", () => {
    expect(getBudgetState(50)).toBe("ok");
    expect(getBudgetState(75)).toBe("warn");
    expect(getBudgetState(95)).toBe("critical");
    expect(getBudgetState(100)).toBe("over");
  });

  it("computes budget spent for category", () => {
    const budgets = [
      {
        id: "b1",
        user_id: "u",
        category_id: "c1",
        amount: 100,
        month: "2026-09-01",
      },
    ] as Budget[];
    const txs = [
      baseTx({ category_id: "c1", amount: 40 }),
      baseTx({ category_id: "c1", amount: 20 }),
      baseTx({ category_id: "c2", amount: 99 }),
      baseTx({ type: "transfer", category_id: "c1", amount: 50 }),
    ];
    const [p] = calcBudgetProgress(budgets, txs, new Date("2026-09-15"));
    expect(p.spent).toBe(60);
    expect(p.state).toBe("ok");
    expect(getBudgetState(75)).toBe("warn");
  });

  it("aggregates recurring monthly/yearly", () => {
    const items = [
      {
        is_active: true,
        type: "expense",
        amount: 30,
        frequency: "monthly",
      },
      {
        is_active: true,
        type: "income",
        amount: 100,
        frequency: "monthly",
      },
    ] as RecurringTransaction[];
    const t = calcRecurringTotals(items);
    expect(t.monthly).toBe(70);
    expect(t.yearly).toBe(840);
  });

  it("sums reserved goals excluding settled", () => {
    const goals = [
      {
        name: "Matrimonio",
        current_amount: 200,
        status: "completed",
        settled: false,
      },
      {
        name: "Vacanza",
        current_amount: 150,
        status: "active",
        settled: false,
      },
      {
        name: "Vecchio",
        current_amount: 500,
        status: "completed",
        settled: true,
      },
      {
        name: "Annullato",
        current_amount: 80,
        status: "cancelled",
        settled: false,
      },
    ] as Goal[];
    expect(calcReservedGoalsTotal(goals)).toBe(350);
    expect(isGoalReached(goals[0])).toBe(true);
    expect(isGoalSettled(goals[2])).toBe(true);
  });
});
