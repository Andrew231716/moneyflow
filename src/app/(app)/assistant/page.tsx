import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchBudgets,
  fetchCategories,
  fetchGoals,
  fetchRecurring,
  fetchRules,
  fetchTransactions,
} from "@/lib/data/queries";
import { AssistantPanel } from "@/features/assistant/assistant-panel";

export default async function AssistantPage() {
  if (!hasSupabaseEnv()) return null;
  const [accounts, categories, transactions, rules, recurring, goals, budgets] =
    await Promise.all([
      fetchAccounts(),
      fetchCategories(),
      fetchTransactions(12),
      fetchRules(),
      fetchRecurring(),
      fetchGoals(),
      fetchBudgets(),
    ]);
  return (
    <AppShell title="Gestore">
      <AssistantPanel
        accounts={accounts}
        categories={categories}
        transactions={transactions}
        rules={rules}
        recurring={recurring}
        goals={goals}
        budgets={budgets}
      />
    </AppShell>
  );
}
