import type {
  Category,
  ClassificationRule,
  MatchType,
  Transaction,
} from "@/types/database";
import { DEFAULT_IT_CLASSIFICATION_RULES } from "@/lib/finance/default-classification-rules";
import { normalizeRecurringLabel } from "@/lib/finance/detect-recurring";

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

function classifyWithBuiltInDefaults(
  description: string,
  categories: Category[],
  type?: Category["type"]
): Category | null {
  const sorted = [...DEFAULT_IT_CLASSIFICATION_RULES].sort(
    (a, b) => b.priority - a.priority
  );
  for (const rule of sorted) {
    if (!matchesPattern(description, rule.pattern, "contains")) continue;
    const cat = categories.find(
      (c) =>
        c.name.toLowerCase() === rule.categoryName.toLowerCase() &&
        (type == null || c.type === type)
    );
    if (cat) return cat;
  }
  return null;
}

export function classifyDescription(
  description: string,
  rules: ClassificationRule[],
  categories: Category[],
  options?: { useBuiltInDefaults?: boolean; type?: Category["type"] }
): Category | null {
  const active = [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of active) {
    if (!matchesPattern(description, rule.pattern, rule.match_type)) continue;
    const cat =
      rule.category ??
      categories.find((c) => c.id === rule.category_id) ??
      null;
    if (!cat) continue;
    if (options?.type && cat.type !== options.type) continue;
    return cat;
  }

  if (options?.useBuiltInDefaults === false) return null;
  return classifyWithBuiltInDefaults(description, categories, options?.type);
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

/** Combined merchant + description text for rule matching. */
export function classificationText(
  tx: Pick<
    Transaction,
    | "description"
    | "merchant"
    | "original_description"
    | "original_merchant"
  >
): string {
  return [
    tx.merchant,
    tx.original_merchant,
    tx.description,
    tx.original_description,
  ]
    .filter((v): v is string => Boolean(v && v.trim()))
    .join(" ");
}

function merchantKey(
  tx: Pick<
    Transaction,
    "merchant" | "original_merchant" | "description" | "original_description"
  >
): string {
  const raw =
    tx.merchant ||
    tx.original_merchant ||
    tx.description ||
    tx.original_description ||
    "";
  return normalizeRecurringLabel(raw);
}

/**
 * Reuse the category most often used for the same merchant/description
 * in already-categorized history.
 */
export function learnCategoryFromHistory(
  tx: Pick<
    Transaction,
    | "id"
    | "type"
    | "merchant"
    | "original_merchant"
    | "description"
    | "original_description"
  >,
  history: Transaction[],
  categories: Category[]
): Category | null {
  if (tx.type === "transfer") return null;
  const key = merchantKey(tx);
  if (key.length < 3) return null;

  const counts = new Map<string, number>();
  for (const past of history) {
    if (past.id === tx.id) continue;
    if (past.type !== tx.type) continue;
    if (!past.category_id) continue;
    const pastKey = merchantKey(past);
    if (pastKey.length < 3) continue;
    if (
      pastKey !== key &&
      !pastKey.includes(key) &&
      !key.includes(pastKey)
    ) {
      continue;
    }
    counts.set(past.category_id, (counts.get(past.category_id) ?? 0) + 1);
  }

  let bestId: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestId = id;
      bestN = n;
    }
  }
  if (!bestId || bestN < 1) return null;
  return (
    categories.find((c) => c.id === bestId && c.type === tx.type) ?? null
  );
}

/** Full classify: rules → built-ins → history of same merchant. */
export function classifyTransaction(
  tx: Pick<
    Transaction,
    | "id"
    | "type"
    | "description"
    | "merchant"
    | "original_description"
    | "original_merchant"
    | "manual_category_override"
    | "category_source"
    | "manual_override_fields"
  >,
  rules: ClassificationRule[],
  categories: Category[],
  history: Transaction[] = [],
  options?: { useBuiltInDefaults?: boolean }
): Category | null {
  if (tx.type === "transfer") return null;
  const text = classificationText(tx);
  if (text.trim()) {
    const fromRules = classifyDescription(text, rules, categories, {
      useBuiltInDefaults: options?.useBuiltInDefaults,
      type: tx.type,
    });
    if (fromRules) return fromRules;
  }
  return learnCategoryFromHistory(tx, history, categories);
}

export type AutoCategorizePlanItem = {
  transactionId: string;
  categoryId: string;
  categoryName: string;
  reason: "rule" | "history";
};

/** Plan category updates for uncategorized (or safely rewritable) transactions. */
export function planAutoCategorize(
  transactions: Transaction[],
  rules: ClassificationRule[],
  categories: Category[]
): AutoCategorizePlanItem[] {
  const history = transactions.filter((t) => Boolean(t.category_id));
  const plan: AutoCategorizePlanItem[] = [];

  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    if (tx.category_id) continue;
    if (!shouldApplyRuleCategory(tx)) continue;

    const text = classificationText(tx);
    let cat: Category | null = null;
    let reason: "rule" | "history" = "rule";

    if (text.trim()) {
      cat = classifyDescription(text, rules, categories, { type: tx.type });
    }
    if (!cat) {
      cat = learnCategoryFromHistory(tx, history, categories);
      if (cat) reason = "history";
    }
    if (!cat) continue;

    plan.push({
      transactionId: tx.id,
      categoryId: cat.id,
      categoryName: cat.name,
      reason,
    });
  }

  return plan;
}
