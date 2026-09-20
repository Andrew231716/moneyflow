import { subMonths } from "date-fns";
import {
  calcExpenseByCategory,
  calcMonthSummary,
} from "@/lib/finance/engine";
import {
  calcGoalTrajectory,
  estimateWeeksFaster,
  pickPrimaryGoal,
  type GoalTrajectory,
} from "@/lib/finance/goal-trajectory";
import type { Budget, Goal, MonthSummary, Transaction } from "@/types/database";

export interface CutPotentialTip {
  categoryId: string | null;
  categoryName: string;
  color: string;
  spent: number;
  previousSpent: number;
  averageSpent: number;
  budgetAmount: number | null;
  overBudget: number;
  growthAmount: number;
  growthPercent: number | null;
  score: number;
  suggestedMonthlyCut: number;
  suggestedWeeklyCut: number;
  savingsRateImpactPp: number;
  comparisonLabel: string;
  transactionsHref: string;
  budgetHref: string;
  goalImpact: {
    goalId: string;
    goalName: string;
    weeksFaster: number;
    message: string;
  } | null;
}

export interface CutPotentialResult {
  tips: CutPotentialTip[];
  empty: boolean;
  emptyReason: string | null;
  primaryGoal: GoalTrajectory | null;
  summary: MonthSummary;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);
}

function averageCategorySpend(
  transactions: Transaction[],
  categoryKey: string,
  monthsBack: number,
  asOf: Date
): number {
  if (monthsBack <= 0) return 0;
  let total = 0;
  for (let i = 1; i <= monthsBack; i++) {
    const month = subMonths(asOf, i);
    const rows = calcExpenseByCategory(transactions, month);
    const row = rows.find((r) => (r.categoryId ?? "uncategorized") === categoryKey);
    total += row?.total ?? 0;
  }
  return total / monthsBack;
}

function suggestMonthlyCut(params: {
  spent: number;
  previousSpent: number;
  averageSpent: number;
  overBudget: number;
}): number {
  const { spent, previousSpent, averageSpent, overBudget } = params;
  if (spent <= 0) return 0;

  let cut = 0;
  if (overBudget > 0) {
    cut = Math.min(overBudget, spent * 0.35);
  } else if (spent > previousSpent && previousSpent > 0) {
    cut = Math.min((spent - previousSpent) * 0.7, spent * 0.25);
  } else if (spent > averageSpent && averageSpent > 0) {
    cut = Math.min((spent - averageSpent) * 0.5, spent * 0.2);
  } else {
    cut = spent * 0.1;
  }

  // Soft floor / ceiling for actionable tips
  cut = Math.min(cut, spent * 0.4);
  if (cut < 5 && spent >= 20) cut = Math.min(10, spent * 0.15);
  if (cut < 3) return 0;
  return roundMoney(Math.round(cut)); // whole euros for UX
}

function scoreCategory(params: {
  spent: number;
  totalExpense: number;
  growthPercent: number | null;
  overBudget: number;
}): number {
  const { spent, totalExpense, growthPercent, overBudget } = params;
  const share = totalExpense > 0 ? spent / totalExpense : 0;
  const growthScore =
    growthPercent != null && growthPercent > 0
      ? Math.min(growthPercent / 100, 1.5)
      : 0;
  const overScore = spent > 0 ? Math.min(overBudget / spent, 1) : 0;
  return share * 40 + growthScore * 30 + overScore * 30 + spent * 0.001;
}

function comparisonLabel(params: {
  spent: number;
  previousSpent: number;
  averageSpent: number;
  budgetAmount: number | null;
  overBudget: number;
  growthPercent: number | null;
}): string {
  const {
    spent,
    previousSpent,
    averageSpent,
    budgetAmount,
    overBudget,
    growthPercent,
  } = params;

  if (overBudget > 0 && budgetAmount != null) {
    return `${formatEuro(overBudget)} oltre il budget (${formatEuro(budgetAmount)})`;
  }
  if (growthPercent != null && previousSpent > 0) {
    const sign = growthPercent >= 0 ? "+" : "";
    return `${sign}${growthPercent.toFixed(0)}% vs mese scorso (${formatEuro(previousSpent)})`;
  }
  if (averageSpent > 0) {
    const delta = spent - averageSpent;
    if (Math.abs(delta) >= 1) {
      return delta > 0
        ? `${formatEuro(delta)} sopra la media 3 mesi`
        : `${formatEuro(Math.abs(delta))} sotto la media 3 mesi`;
    }
  }
  return `Spesi ${formatEuro(spent)} questo mese`;
}

export function rankCutPotential(params: {
  transactions: Transaction[];
  budgets?: Budget[];
  goals?: Goal[];
  month?: Date;
  limit?: number;
}): CutPotentialResult {
  const {
    transactions,
    budgets = [],
    goals = [],
    month = new Date(),
    limit = 5,
  } = params;

  const summary = calcMonthSummary(transactions, month);
  const current = calcExpenseByCategory(transactions, month);
  const previous = calcExpenseByCategory(transactions, subMonths(month, 1));
  const prevMap = new Map(
    previous.map((r) => [r.categoryId ?? "uncategorized", r.total])
  );

  const budgetByCategory = new Map<string, number>();
  for (const b of budgets) {
    budgetByCategory.set(b.category_id, Number(b.amount));
  }

  const primaryGoal = pickPrimaryGoal(goals);
  const trajectory = primaryGoal
    ? calcGoalTrajectory(primaryGoal, month)
    : null;

  const monthlyPaceForImpact =
    trajectory?.avgMonthlyPace && trajectory.avgMonthlyPace > 0
      ? trajectory.avgMonthlyPace
      : trajectory?.neededMonthlyPace && trajectory.neededMonthlyPace > 0
        ? trajectory.neededMonthlyPace
        : Math.max(summary.savings, 1);

  if (summary.expense <= 0 || current.length === 0) {
    return {
      tips: [],
      empty: true,
      emptyReason:
        "Servono spese categorizzate questo mese per stimare dove puoi tagliare.",
      primaryGoal: trajectory,
      summary,
    };
  }

  const tips: CutPotentialTip[] = current
    .map((row) => {
      const key = row.categoryId ?? "uncategorized";
      const previousSpent = prevMap.get(key) ?? 0;
      const averageSpent = averageCategorySpend(transactions, key, 3, month);
      const budgetAmount = row.categoryId
        ? (budgetByCategory.get(row.categoryId) ?? null)
        : null;
      const overBudget =
        budgetAmount != null ? Math.max(0, row.total - budgetAmount) : 0;
      const growthAmount = row.total - previousSpent;
      const growthPercent =
        previousSpent > 0 ? (growthAmount / previousSpent) * 100 : null;
      const suggestedMonthlyCut = suggestMonthlyCut({
        spent: row.total,
        previousSpent,
        averageSpent,
        overBudget,
      });
      const suggestedWeeklyCut = roundMoney(suggestedMonthlyCut / 4.345);
      const savingsRateImpactPp =
        summary.income > 0
          ? roundMoney((suggestedMonthlyCut / summary.income) * 100)
          : 0;

      let goalImpact: CutPotentialTip["goalImpact"] = null;
      if (trajectory && suggestedMonthlyCut > 0 && trajectory.remaining > 0) {
        const weeksFaster = estimateWeeksFaster({
          remaining: trajectory.remaining,
          monthlyPace: monthlyPaceForImpact,
          extraMonthly: suggestedMonthlyCut,
        });
        if (weeksFaster >= 0.5) {
          const weeksLabel =
            weeksFaster >= 4
              ? `~${Math.round(weeksFaster / 4.345)} mes${Math.round(weeksFaster / 4.345) === 1 ? "e" : "i"}`
              : `~${weeksFaster.toFixed(weeksFaster % 1 === 0 ? 0 : 1)} settiman${weeksFaster === 1 ? "a" : "e"}`;
          goalImpact = {
            goalId: trajectory.goalId,
            goalName: trajectory.goalName,
            weeksFaster,
            message: `Se riduci ${row.name} di ${formatEuro(suggestedMonthlyCut)}/mese, anticipi «${trajectory.goalName}» di ${weeksLabel}`,
          };
        }
      }

      const score = scoreCategory({
        spent: row.total,
        totalExpense: summary.expense,
        growthPercent,
        overBudget,
      });

      const categoryQuery = row.categoryId
        ? `category=${encodeURIComponent(row.categoryId)}`
        : "category=uncategorized";

      return {
        categoryId: row.categoryId,
        categoryName: row.name,
        color: row.color,
        spent: roundMoney(row.total),
        previousSpent: roundMoney(previousSpent),
        averageSpent: roundMoney(averageSpent),
        budgetAmount,
        overBudget: roundMoney(overBudget),
        growthAmount: roundMoney(growthAmount),
        growthPercent:
          growthPercent != null ? roundMoney(growthPercent) : null,
        score,
        suggestedMonthlyCut,
        suggestedWeeklyCut,
        savingsRateImpactPp,
        comparisonLabel: comparisonLabel({
          spent: row.total,
          previousSpent,
          averageSpent,
          budgetAmount,
          overBudget,
          growthPercent,
        }),
        transactionsHref: `/transactions?${categoryQuery}`,
        budgetHref: "/budgets",
        goalImpact,
      } satisfies CutPotentialTip;
    })
    .filter((t) => t.suggestedMonthlyCut > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (tips.length === 0) {
    return {
      tips: [],
      empty: true,
      emptyReason:
        "Non ci sono tagli evidenti questo mese: le categorie sono stabili o sotto budget.",
      primaryGoal: trajectory,
      summary,
    };
  }

  return {
    tips,
    empty: false,
    emptyReason: null,
    primaryGoal: trajectory,
    summary,
  };
}

export function formatCutPotentialAssistantText(result: CutPotentialResult): string {
  if (result.empty) {
    return result.emptyReason ?? "Nessun suggerimento di risparmio disponibile.";
  }
  const lines = result.tips.slice(0, 4).map((t, i) => {
    const impact = t.goalImpact ? ` — ${t.goalImpact.message}` : "";
    const rate =
      t.savingsRateImpactPp > 0
        ? ` (+${t.savingsRateImpactPp.toFixed(1)} pp tasso risparmio)`
        : "";
    return `${i + 1}. ${t.categoryName}: spesi ${formatEuro(t.spent)} (${t.comparisonLabel}). Taglio suggerito ${formatEuro(t.suggestedMonthlyCut)}/mese (~${formatEuro(t.suggestedWeeklyCut)}/sett.)${rate}${impact}`;
  });
  const header = "Dove puoi risparmiare:";
  return [header, ...lines].join("\n");
}
