import {
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { it } from "date-fns/locale";
import type {
  Account,
  Budget,
  BudgetProgress,
  BudgetProgressState,
  Goal,
  Insight,
  MonthSummary,
  RecurringFrequency,
  RecurringTransaction,
  Transaction,
} from "@/types/database";

export function getBudgetState(percent: number): BudgetProgressState {
  if (percent >= 100) return "over";
  if (percent >= 90) return "critical";
  if (percent >= 70) return "warn";
  return "ok";
}

export function calcTotalAvailability(accounts: Account[]): number {
  return accounts
    .filter((a) => !a.is_archived)
    .reduce((sum, a) => sum + Number(a.balance), 0);
}

export function isIncomeOrExpense(tx: Transaction): boolean {
  return tx.type === "income" || tx.type === "expense";
}

export function calcMonthSummary(
  transactions: Transaction[],
  month: Date = new Date()
): MonthSummary {
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  let income = 0;
  let expense = 0;

  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    const d = new Date(tx.date);
    if (d < start || d > end) continue;
    if (tx.type === "income") income += Number(tx.amount);
    if (tx.type === "expense") expense += Number(tx.amount);
  }

  const savings = income - expense;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;

  return { income, expense, savings, savingsRate };
}

export function calcExpenseByCategory(
  transactions: Transaction[],
  month: Date = new Date()
): { categoryId: string | null; name: string; color: string; total: number }[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const map = new Map<
    string,
    { categoryId: string | null; name: string; color: string; total: number }
  >();

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const d = new Date(tx.date);
    if (d < start || d > end) continue;
    const key = tx.category_id ?? "uncategorized";
    const existing = map.get(key) ?? {
      categoryId: tx.category_id,
      name: tx.category?.name ?? "Senza categoria",
      color: tx.category?.color ?? "#94a3b8",
      total: 0,
    };
    existing.total += Number(tx.amount);
    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function calcMonthlySeries(
  transactions: Transaction[],
  months = 6
): { month: string; label: string; income: number; expense: number; savings: number }[] {
  const now = new Date();
  const result = [];

  for (let i = months - 1; i >= 0; i--) {
    const m = subMonths(now, i);
    const summary = calcMonthSummary(transactions, m);
    result.push({
      month: format(m, "yyyy-MM"),
      label: format(m, "MMM yy", { locale: it }),
      ...summary,
    });
  }

  return result;
}

export function calcBudgetProgress(
  budgets: Budget[],
  transactions: Transaction[],
  month: Date = new Date()
): BudgetProgress[] {
  const start = startOfMonth(month);
  const end = endOfMonth(month);

  return budgets.map((budget) => {
    const spent = transactions
      .filter(
        (tx) =>
          tx.type === "expense" &&
          !tx.excluded_from_budget &&
          tx.category_id === budget.category_id &&
          new Date(tx.date) >= start &&
          new Date(tx.date) <= end
      )
      .reduce((s, tx) => s + Number(tx.amount), 0);

    const amount = Number(budget.amount);
    const percent = amount > 0 ? (spent / amount) * 100 : 0;
    return {
      budget,
      spent,
      remaining: amount - spent,
      percent,
      state: getBudgetState(percent),
    };
  });
}

export function calcGoalProgress(goal: Goal): {
  percent: number;
  remaining: number;
} {
  const target = Number(goal.target_amount);
  const current = Number(goal.current_amount);
  return {
    percent: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    remaining: Math.max(0, target - current),
  };
}

/** Target met (raggiunto) — funds may still be earmarked and available. */
export function isGoalReached(goal: Goal): boolean {
  return (
    goal.status === "completed" ||
    Number(goal.current_amount) >= Number(goal.target_amount)
  );
}

/** Saldato — money spent/used, excluded from reserved-goals total. */
export function isGoalSettled(goal: Goal): boolean {
  return Boolean(goal.settled);
}

/**
 * Sum of current_amount for goals that are not settled.
 * These are earmarked but still count as available until marked Saldato.
 * Note: amounts may already live inside savings accounts — Home shows
 * Salvadanaio (accounts) and Obiettivi (reserved) as separate views;
 * totale disponibilità uses account balances only (source of truth).
 */
export function calcReservedGoalsTotal(goals: Goal[]): number {
  return goals
    .filter((g) => g.status !== "cancelled" && !isGoalSettled(g))
    .reduce((sum, g) => sum + Number(g.current_amount), 0);
}

export function frequencyToMonthlyFactor(frequency: RecurringFrequency): number {
  switch (frequency) {
    case "weekly":
      return 52 / 12;
    case "monthly":
      return 1;
    case "quarterly":
      return 1 / 3;
    case "semiannual":
      return 1 / 6;
    case "yearly":
      return 1 / 12;
  }
}

export function calcRecurringTotals(items: RecurringTransaction[]): {
  monthly: number;
  yearly: number;
} {
  const active = items.filter((i) => i.is_active);
  let monthly = 0;
  for (const item of active) {
    const signed =
      item.type === "expense" ? -Number(item.amount) : Number(item.amount);
    monthly += signed * frequencyToMonthlyFactor(item.frequency);
  }
  return { monthly, yearly: monthly * 12 };
}

export function forecastMonthEnd(
  transactions: Transaction[],
  recurring: RecurringTransaction[],
  month: Date = new Date()
): {
  projectedExpense: number;
  projectedIncome: number;
  projectedSavings: number;
  daysLeft: number;
  dailyBurn: number;
} {
  const summary = calcMonthSummary(transactions, month);
  const today = new Date();
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const dayOfMonth = Math.max(1, differenceInCalendarDays(today, start) + 1);
  const daysLeft = Math.max(0, differenceInCalendarDays(end, today));

  const dailyBurn = summary.expense / dayOfMonth;
  const remainingRecurringExpense = recurring
    .filter(
      (r) =>
        r.is_active &&
        r.type === "expense" &&
        new Date(r.next_due_date) >= today &&
        new Date(r.next_due_date) <= end
    )
    .reduce((s, r) => s + Number(r.amount), 0);

  const remainingRecurringIncome = recurring
    .filter(
      (r) =>
        r.is_active &&
        r.type === "income" &&
        new Date(r.next_due_date) >= today &&
        new Date(r.next_due_date) <= end
    )
    .reduce((s, r) => s + Number(r.amount), 0);

  const projectedExpense =
    summary.expense + dailyBurn * daysLeft * 0.5 + remainingRecurringExpense;
  const projectedIncome = summary.income + remainingRecurringIncome;

  return {
    projectedExpense,
    projectedIncome,
    projectedSavings: projectedIncome - projectedExpense,
    daysLeft,
    dailyBurn,
  };
}

export function generateInsights(params: {
  summary: MonthSummary;
  budgets: BudgetProgress[];
  goals: Goal[];
  forecast: ReturnType<typeof forecastMonthEnd>;
  previousSummary?: MonthSummary;
}): Insight[] {
  const insights: Insight[] = [];
  const { summary, budgets, goals, forecast, previousSummary } = params;

  if (summary.savingsRate >= 20) {
    insights.push({
      id: "savings-good",
      type: "success",
      title: "Ottimo risparmio",
      message: `Stai risparmiando il ${summary.savingsRate.toFixed(0)}% delle entrate questo mese.`,
    });
  } else if (summary.income > 0 && summary.savingsRate < 5) {
    insights.push({
      id: "savings-low",
      type: "warning",
      title: "Risparmio basso",
      message: "Il tasso di risparmio è sotto il 5%. Controlla le spese discrezionali.",
    });
  }

  const over = budgets.filter((b) => b.state === "over");
  if (over.length) {
    insights.push({
      id: "budget-over",
      type: "warning",
      title: "Budget superato",
      message: `${over.length} categor${over.length === 1 ? "ia ha" : "ie hanno"} superato il budget.`,
    });
  }

  const critical = budgets.filter((b) => b.state === "critical");
  if (critical.length) {
    insights.push({
      id: "budget-critical",
      type: "info",
      title: "Budget quasi esaurito",
      message: `${critical.length} categor${critical.length === 1 ? "ia è" : "ie sono"} sopra il 90%.`,
    });
  }

  if (forecast.projectedSavings < 0) {
    insights.push({
      id: "forecast-negative",
      type: "warning",
      title: "Previsione negativa",
      message: `A fine mese potresti chiudere a ${forecast.projectedSavings.toFixed(0)} €.`,
    });
  }

  const nearGoals = goals.filter((g) => {
    if (g.status !== "active") return false;
    const p = calcGoalProgress(g).percent;
    return p >= 80 && p < 100;
  });
  if (nearGoals.length) {
    insights.push({
      id: "goals-near",
      type: "success",
      title: "Obiettivi vicini",
      message: `${nearGoals.length} obiettiv${nearGoals.length === 1 ? "o è" : "i sono"} oltre l'80%.`,
    });
  }

  if (previousSummary && previousSummary.expense > 0) {
    const delta =
      ((summary.expense - previousSummary.expense) / previousSummary.expense) *
      100;
    if (delta > 15) {
      insights.push({
        id: "expense-up",
        type: "info",
        title: "Spese in aumento",
        message: `Le spese sono +${delta.toFixed(0)}% rispetto al mese scorso.`,
      });
    } else if (delta < -15) {
      insights.push({
        id: "expense-down",
        type: "success",
        title: "Spese in calo",
        message: `Hai speso ${Math.abs(delta).toFixed(0)}% in meno rispetto al mese scorso.`,
      });
    }
  }

  return insights.slice(0, 5);
}

export function nextDueAfter(
  date: Date,
  frequency: RecurringFrequency
): Date {
  switch (frequency) {
    case "weekly":
      return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "monthly":
      return addMonths(date, 1);
    case "quarterly":
      return addMonths(date, 3);
    case "semiannual":
      return addMonths(date, 6);
    case "yearly":
      return addMonths(date, 12);
  }
}

export function applyBalanceDelta(
  balance: number,
  type: Transaction["type"],
  amount: number,
  direction: "apply" | "revert" = "apply"
): number {
  const sign = direction === "apply" ? 1 : -1;
  if (type === "income") return balance + amount * sign;
  if (type === "expense") return balance - amount * sign;
  return balance;
}
