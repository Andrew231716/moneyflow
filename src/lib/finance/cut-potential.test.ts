import { describe, expect, it } from "vitest";
import { rankCutPotential } from "@/lib/finance/cut-potential";
import type { Budget, Goal, Transaction } from "@/types/database";

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

describe("cut potential ranking", () => {
  const month = new Date("2026-09-15");

  it("returns empty state without expenses", () => {
    const result = rankCutPotential({
      transactions: [
        baseTx({ type: "income", amount: 2000, category_id: null }),
      ],
      month,
    });
    expect(result.empty).toBe(true);
    expect(result.tips).toHaveLength(0);
  });

  it("ranks high-spend growing over-budget categories first", () => {
    const txs = [
      baseTx({
        id: "inc",
        type: "income",
        amount: 3000,
        category_id: null,
        date: "2026-09-01",
      }),
      // Ristoranti: high + growing + over budget
      baseTx({
        id: "r1",
        amount: 200,
        category_id: "cat-rist",
        date: "2026-09-05",
        category: {
          id: "cat-rist",
          user_id: "u",
          name: "Ristoranti",
          type: "expense",
          color: "#f00",
          icon: "utensils",
          is_system: false,
          parent_id: null,
          created_at: "",
        },
      }),
      baseTx({
        id: "r0",
        amount: 80,
        category_id: "cat-rist",
        date: "2026-08-10",
        category: {
          id: "cat-rist",
          user_id: "u",
          name: "Ristoranti",
          type: "expense",
          color: "#f00",
          icon: "utensils",
          is_system: false,
          parent_id: null,
          created_at: "",
        },
      }),
      // Affitto: high but stable / no budget
      baseTx({
        id: "a1",
        amount: 900,
        category_id: "cat-aff",
        date: "2026-09-02",
        category: {
          id: "cat-aff",
          user_id: "u",
          name: "Affitto",
          type: "expense",
          color: "#0af",
          icon: "home",
          is_system: false,
          parent_id: null,
          created_at: "",
        },
      }),
      baseTx({
        id: "a0",
        amount: 900,
        category_id: "cat-aff",
        date: "2026-08-02",
        category: {
          id: "cat-aff",
          user_id: "u",
          name: "Affitto",
          type: "expense",
          color: "#0af",
          icon: "home",
          is_system: false,
          parent_id: null,
          created_at: "",
        },
      }),
    ];

    const budgets = [
      {
        id: "b1",
        user_id: "u",
        category_id: "cat-rist",
        amount: 100,
        month: "2026-09-01",
        created_at: "",
        updated_at: "",
      },
    ] as Budget[];

    const goals = [
      {
        id: "g1",
        user_id: "u",
        name: "Matrimonio",
        target_amount: 5000,
        current_amount: 1000,
        deadline: "2027-06-01",
        account_id: null,
        color: "#0d9488",
        icon: "heart",
        status: "active",
        settled: false,
        settled_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "",
      },
    ] as Goal[];

    const result = rankCutPotential({
      transactions: txs,
      budgets,
      goals,
      month,
      limit: 3,
    });

    expect(result.empty).toBe(false);
    expect(result.tips.length).toBeGreaterThan(0);
    expect(result.tips[0].categoryName).toBe("Ristoranti");
    expect(result.tips[0].suggestedMonthlyCut).toBeGreaterThan(0);
    expect(result.tips[0].overBudget).toBe(100);
    expect(result.tips[0].transactionsHref).toContain("category=cat-rist");
    expect(result.primaryGoal?.goalName).toBe("Matrimonio");
    expect(result.tips[0].goalImpact?.message).toMatch(/anticipi/i);
  });

  it("suggests weekly cut proportional to monthly", () => {
    const txs = [
      baseTx({
        id: "inc",
        type: "income",
        amount: 2000,
        date: "2026-09-01",
      }),
      baseTx({
        id: "e1",
        amount: 400,
        category_id: "cat-shop",
        date: "2026-09-08",
        category: {
          id: "cat-shop",
          user_id: "u",
          name: "Shopping",
          type: "expense",
          color: "#abc",
          icon: "bag",
          is_system: false,
          parent_id: null,
          created_at: "",
        },
      }),
      baseTx({
        id: "e0",
        amount: 100,
        category_id: "cat-shop",
        date: "2026-08-08",
        category: {
          id: "cat-shop",
          user_id: "u",
          name: "Shopping",
          type: "expense",
          color: "#abc",
          icon: "bag",
          is_system: false,
          parent_id: null,
          created_at: "",
        },
      }),
    ];
    const result = rankCutPotential({ transactions: txs, month });
    const tip = result.tips[0];
    expect(tip).toBeTruthy();
    expect(tip.suggestedWeeklyCut).toBeCloseTo(tip.suggestedMonthlyCut / 4.345, 1);
  });
});
