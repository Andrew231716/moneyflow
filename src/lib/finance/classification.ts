import type {
  Category,
  ClassificationRule,
  MatchType,
  Transaction,
} from "@/types/database";

export function matchesPattern(
  text: string,
  pattern: string,
  matchType: MatchType
): boolean {
  const hay = text.toLowerCase();
  const needle = pattern.toLowerCase();

  switch (matchType) {
    case "contains":
      return hay.includes(needle);
    case "starts_with":
      return hay.startsWith(needle);
    case "exact":
      return hay === needle;
    case "regex":
      try {
        return new RegExp(pattern, "i").test(text);
      } catch {
        return false;
      }
  }
}

export function classifyDescription(
  description: string,
  rules: ClassificationRule[],
  categories: Category[]
): Category | null {
  const active = [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of active) {
    if (matchesPattern(description, rule.pattern, rule.match_type)) {
      const cat =
        rule.category ??
        categories.find((c) => c.id === rule.category_id) ??
        null;
      if (cat) return cat;
    }
  }
  return null;
}

/** Never overwrite a manually set category (legacy flags + OB override array). */
export function shouldApplyRuleCategory(
  tx: Pick<
    Transaction,
    "manual_category_override" | "category_source" | "manual_override_fields"
  >
): boolean {
  if (tx.manual_category_override) return false;
  if (tx.category_source === "manual") return false;
  const overrides = tx.manual_override_fields ?? [];
  if (overrides.includes("category_id")) return false;
  return true;
}

export function resolveDisplayDescription(
  tx: Pick<
    Transaction,
    "description" | "original_description" | "manual_description_override"
  >
): string {
  if (tx.manual_description_override && tx.description) return tx.description;
  return tx.description || tx.original_description || "";
}
