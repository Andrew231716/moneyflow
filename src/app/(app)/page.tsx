import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchBudgets,
  fetchDebts,
  fetchGoals,
  fetchRecurring,
  fetchTransactions,
} from "@/lib/data/queries";
import { DashboardView } from "@/features/analytics/dashboard-view";
import {
  calcBudgetProgress,
  calcExpenseByCategory,
  calcMonthSummary,
  calcMonthlySeries,
  calcDisponibilitaTotale,
  calcNetWorth,
  calcOpenDebtsTotal,
  calcReservedGoalsTotal,
  forecastMonthEnd,
  generateInsights,
} from "@/lib/finance/engine";
import { rankCutPotential } from "@/lib/finance/cut-potential";
import { calcGoalTrajectories } from "@/lib/finance/goal-trajectory";
import { subMonths } from "date-fns";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  const [accounts, transactions, budgets, goals, recurring, debts] =
    await Promise.all([
      fetchAccounts(),
      fetchTransactions(12),
      fetchBudgets(),
      fetchGoals(),
      fetchRecurring(),
      fetchDebts(),
    ]);

  const now = new Date();
  const summary = calcMonthSummary(transactions, now);
  const previousSummary = calcMonthSummary(transactions, subMonths(now, 1));
  const series = calcMonthlySeries(transactions, 6);
  const byCategory = calcExpenseByCategory(transactions, now);
  const budgetProgress = calcBudgetProgress(budgets, transactions, now);
  const forecast = forecastMonthEnd(transactions, recurring, now);
  const insights = generateInsights({
    summary,
    budgets: budgetProgress,
    goals,
    forecast,
    previousSummary,
  });
  const reservedGoalsTotal = calcReservedGoalsTotal(goals);
  const availability = calcDisponibilitaTotale(accounts, goals);
  const openDebtsTotal = calcOpenDebtsTotal(debts);
  const netWorth = calcNetWorth(availability, debts);
  const recent = transactions.filter((t) => t.type !== "transfer").slice(0, 8);
  const savingsAccounts = accounts.filter((a) => a.type === "savings");
  const cutPotential = rankCutPotential({
    transactions,
    budgets,
    goals,
    month: now,
    limit: 4,
  });
  const goalTrajectories = calcGoalTrajectories(goals, now).filter(
    (t) => !goals.find((g) => g.id === t.goalId)?.settled
  );

  return (
    <AppShell title="Home">
      <DashboardView
        availability={availability}
        summary={summary}
        previousSummary={previousSummary}
        series={series}
        byCategory={byCategory}
        budgetProgress={budgetProgress}
        goals={goals}
        savingsAccounts={savingsAccounts}
        reservedGoalsTotal={reservedGoalsTotal}
        debts={debts}
        openDebtsTotal={openDebtsTotal}
        netWorth={netWorth}
        recent={recent}
        forecast={forecast}
        insights={insights}
        cutPotential={cutPotential}
        goalTrajectories={goalTrajectories.slice(0, 3)}
        isEmpty={accounts.length === 0 && transactions.length === 0}
      />
    </AppShell>
  );
}
