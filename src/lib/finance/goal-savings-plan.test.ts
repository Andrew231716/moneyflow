import { describe, expect, it } from "vitest";
import { buildGoalSavingsPlan } from "./goal-savings-plan";
import type { Goal, Transaction } from "@/types/database";

const baseGoal = (over: Partial<Goal> = {}): Goal =>
  ({
    id: "g1",
    user_id: "u",
    name: "Islanda",
    target_amount: 1200,
    current_amount: 0,
    deadline: "2026-12-21",
    status: "active",
    settled: false,
    settled_at: null,
    account_id: null,
    created_at: "2026-08-21T00:00:00.000Z",
    updated_at: "2026-08-21T00:00:00.000Z",
    ...over,
  }) as Goal;

const baseTx = (over: Partial<Transaction>): Transaction =>
  ({
    id: "1",
    user_id: "u",
    account_id: "a",
    category_id: "c-food",
    type: "expense",
    amount: 200,
    description: "Spesa",
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
    category: {
      id: "c-food",
      user_id: "u",
      name: "Ristoranti",
      type: "expense",
      icon: "utensils",
      color: "#d946ef",
      parent_id: null,
      is_system: true,
      created_at: "",
    },
    ...over,
  }) as Transaction;

describe("buildGoalSavingsPlan", () => {
  it("computes monthly need for Iceland-style goal", () => {
    const now = new Date("2026-09-15T12:00:00.000Z");
    const plan = buildGoalSavingsPlan({
      goal: baseGoal({
        deadline: "2027-01-15",
        created_at: "2026-09-01T00:00:00.000Z",
      }),
      transactions: [
        baseTx({ amount: 300, date: "2026-09-10" }),
        baseTx({
          id: "2",
          amount: 150,
          date: "2026-09-05",
          category_id: "c-sub",
          category: {
            id: "c-sub",
            user_id: "u",
            name: "Abbonamenti",
            type: "expense",
            icon: "repeat",
            color: "#3b82f6",
            parent_id: null,
            is_system: true,
            created_at: "",
          },
        }),
      ],
      month: now,
    });

    expect(plan.remaining).toBe(1200);
    expect(plan.neededMonthly).toBeGreaterThan(250);
    expect(plan.neededMonthly).toBeLessThan(400);
    expect(plan.statusMessage).toMatch(/Islanda/);
    expect(plan.cutTips.length).toBeGreaterThan(0);
  });

  it("asks for deadline when missing", () => {
    const plan = buildGoalSavingsPlan({
      goal: baseGoal({ deadline: null }),
      transactions: [],
      month: new Date("2026-09-21"),
    });
    expect(plan.neededMonthly).toBeNull();
    expect(plan.statusMessage).toMatch(/scadenza/i);
  });
});
