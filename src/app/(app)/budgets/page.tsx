import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchBudgets, fetchCategories, fetchTransactions } from "@/lib/data/queries";
import { calcBudgetProgress, calcExpenseByCategory } from "@/lib/finance/engine";
import { BudgetsManager } from "@/features/budgets/budgets-manager";

export default async function BudgetsPage() {
  if (!hasSupabaseEnv()) return null;
  const [budgets, transactions, categories] = await Promise.all([
    fetchBudgets(),
    fetchTransactions(2),
    fetchCategories(),
  ]);
  const progress = calcBudgetProgress(budgets, transactions);
  const topExpenses = calcExpenseByCategory(transactions, new Date());
  return (
    <AppShell title="Budget">
      <BudgetsManager
        progress={progress}
        categories={categories}
        topExpenses={topExpenses}
      />
    </AppShell>
  );
}
