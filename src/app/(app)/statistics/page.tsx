import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchBudgets,
  fetchGoals,
  fetchTransactions,
} from "@/lib/data/queries";
import {
  calcBudgetProgress,
  calcExpenseByCategory,
  calcMonthSummary,
  calcMonthlySeries,
} from "@/lib/finance/engine";
import { rankCutPotential } from "@/lib/finance/cut-potential";
import { calcGoalTrajectories } from "@/lib/finance/goal-trajectory";
import { StatisticsView } from "@/features/analytics/statistics-view";
import { subMonths } from "date-fns";

export default async function StatisticsPage() {
  if (!hasSupabaseEnv()) return null;
  const [transactions, budgets, goals, accounts] = await Promise.all([
    fetchTransactions(12),
    fetchBudgets(),
    fetchGoals(),
    fetchAccounts(),
  ]);
  const now = new Date();
  const prev = subMonths(now, 1);
  const cutPotential = rankCutPotential({
    transactions,
    budgets,
    goals,
    limit: 6,
  });
  return (
    <AppShell title="Statistiche">
      <StatisticsView
        series6={calcMonthlySeries(transactions, 6)}
        series12={calcMonthlySeries(transactions, 12)}
        byCategory={calcExpenseByCategory(transactions, now)}
        previousByCategory={calcExpenseByCategory(transactions, prev)}
        cutPotential={cutPotential}
        goalTrajectories={calcGoalTrajectories(goals).slice(0, 4)}
        summary={calcMonthSummary(transactions, now)}
        previousSummary={calcMonthSummary(transactions, prev)}
        transactions={transactions}
        accounts={accounts}
        budgetProgress={calcBudgetProgress(budgets, transactions, now)}
        goals={goals}
      />
    </AppShell>
  );
}
