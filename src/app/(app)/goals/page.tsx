import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchBudgets,
  fetchGoals,
  fetchTransactions,
} from "@/lib/data/queries";
import { GoalsManager } from "@/features/goals/goals-manager";
import { buildGoalSavingsPlan } from "@/lib/finance/goal-savings-plan";
import { isGoalSettled } from "@/lib/finance/engine";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  if (!hasSupabaseEnv()) return null;
  const [goals, accounts, transactions, budgets] = await Promise.all([
    fetchGoals(),
    fetchAccounts(),
    fetchTransactions(6),
    fetchBudgets(),
  ]);
  const savingsAccounts = accounts.filter(
    (a) => a.type === "savings" && !a.is_archived
  );
  const now = new Date();
  const savingsPlans = goals
    .filter((g) => !isGoalSettled(g) && g.status === "active")
    .map((goal) =>
      buildGoalSavingsPlan({
        goal,
        transactions,
        budgets,
        month: now,
        tipLimit: 4,
      })
    )
    .filter((p) => p.remaining > 0)
    .sort((a, b) => {
      const da = a.daysRemaining ?? Number.POSITIVE_INFINITY;
      const db = b.daysRemaining ?? Number.POSITIVE_INFINITY;
      return da - db;
    });

  return (
    <AppShell title="Obiettivi">
      <GoalsManager
        goals={goals}
        savingsAccounts={savingsAccounts}
        savingsPlans={savingsPlans}
      />
    </AppShell>
  );
}
