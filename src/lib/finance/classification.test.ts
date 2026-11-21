import { describe, expect, it } from "vitest";
import {
  classifyDescription,
  classifyTransaction,
  learnCategoryFromHistory,
  matchesPattern,
  planAutoCategorize,
  shouldApplyRuleCategory,
} from "@/lib/finance/classification";
import type { Category, ClassificationRule, Transaction } from "@/types/database";

const cats = [
  {
    id: "c1",
    name: "Alimentari",
    type: "expense",
  },
] as Category[];

const rules = [
  {
    id: "r1",
    pattern: "Esselunga",
    match_type: "contains",
    category_id: "c1",
    priority: 10,
    is_active: true,
    category: cats[0],
  },
] as ClassificationRule[];

describe("classification rules", () => {
  it("matches contains", () => {
    expect(matchesPattern("Spesa Esselunga Milano", "esselunga", "contains")).toBe(
      true
    );
  });

  it("classifies by priority rule", () => {
    const cat = classifyDescription("ESSELUNGA VIA ROMA", rules, cats);
    expect(cat?.id).toBe("c1");
  });

  it("does not overwrite manual categories", () => {
    expect(
      shouldApplyRuleCategory({
        manual_category_override: true,
        category_source: "rule",
        manual_override_fields: [],
      })
    ).toBe(false);
    expect(
      shouldApplyRuleCategory({
        manual_category_override: false,
        category_source: "manual",
        manual_override_fields: [],
      })
    ).toBe(false);
    expect(
      shouldApplyRuleCategory({
        manual_category_override: false,
        category_source: "bank",
        manual_override_fields: ["category_id"],
      })
    ).toBe(false);
    expect(
      shouldApplyRuleCategory({
        manual_category_override: false,
        category_source: "bank",
        manual_override_fields: [],
      })
    ).toBe(true);
  });

  it("falls back to built-in Italian merchants", () => {
    const moreCats = [
      ...cats,
      { id: "c2", name: "Abbonamenti", type: "expense" },
    ] as Category[];
    const cat = classifyDescription("NETFLIX.COM", [], moreCats);
    expect(cat?.id).toBe("c2");
  });

  it("can disable built-in defaults", () => {
    const moreCats = [
      ...cats,
      { id: "c2", name: "Abbonamenti", type: "expense" },
    ] as Category[];
    expect(
      classifyDescription("NETFLIX.COM", [], moreCats, {
        useBuiltInDefaults: false,
      })
    ).toBeNull();
  });

  it("learns category from same merchant in history", () => {
    const moreCats = [
      ...cats,
      { id: "c2", name: "Abbonamenti", type: "expense" },
    ] as Category[];
    const history = [
      {
        id: "h1",
        type: "expense",
        merchant: "Palestra FitLife",
        description: "ABBONAMENTO",
        category_id: "c2",
      },
      {
        id: "h2",
        type: "expense",
        merchant: "Palestra FitLife",
        description: "MENSILE",
        category_id: "c2",
      },
    ] as Transaction[];
    const tx = {
      id: "new",
      type: "expense",
      merchant: "Palestra FitLife",
      description: "RINNOVO",
    } as Transaction;
    expect(learnCategoryFromHistory(tx, history, moreCats)?.id).toBe("c2");
    expect(classifyTransaction(tx, [], moreCats, history)?.id).toBe("c2");
  });

  it("plans auto-categorize for uncategorized rows", () => {
    const moreCats = [
      ...cats,
      { id: "c2", name: "Abbonamenti", type: "expense" },
    ] as Category[];
    const txs = [
      {
        id: "u1",
        type: "expense",
        description: "NETFLIX.COM",
        merchant: "Netflix",
        category_id: null,
        category_source: "bank",
        manual_category_override: false,
        manual_override_fields: [],
      },
      {
        id: "u2",
        type: "expense",
        description: "Sconosciuto XYZ",
        category_id: null,
        category_source: "bank",
        manual_category_override: false,
        manual_override_fields: [],
      },
    ] as unknown as Transaction[];
    const plan = planAutoCategorize(txs, [], moreCats);
    expect(plan.some((p) => p.transactionId === "u1" && p.categoryId === "c2")).toBe(
      true
    );
    expect(plan.some((p) => p.transactionId === "u2")).toBe(false);
  });
});
