import { describe, expect, it } from "vitest";
import {
  classifyDescription,
  matchesPattern,
  shouldApplyRuleCategory,
} from "@/lib/finance/classification";
import type { Category, ClassificationRule } from "@/types/database";

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
});
