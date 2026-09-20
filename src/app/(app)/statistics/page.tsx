import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchBudgets, fetchGoals, fetchTransactions } from "@/lib/data/queries";
import {
  calcExpenseByCategory,
  calcMonthlySeries,
} from "@/lib/finance/engine";
import { rankCutPotential } from "@/lib/finance/cut-potential";
import { calcGoalTrajectories } from "@/lib/finance/goal-trajectory";
import { StatisticsView } from "@/features/analytics/statistics-view";

export default async function StatisticsPage() {
  if (!hasSupabaseEnv()) return null;
  const [transactions, budgets, goals] = await Promise.all([
    fetchTransactions(12),
    fetchBudgets(),
    fetchGoals(),
  ]);
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
        byCategory={calcExpenseByCategory(transactions)}
        cutPotential={cutPotential}
        goalTrajectories={calcGoalTrajectories(goals).slice(0, 4)}
      />
    </AppShell>
  );
}
