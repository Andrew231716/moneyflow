import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchCategories,
  fetchRecurring,
  fetchRules,
  fetchTransactions,
} from "@/lib/data/queries";
import { AssistantPanel } from "@/features/assistant/assistant-panel";

export default async function AssistantPage() {
  if (!hasSupabaseEnv()) return null;
  const [accounts, categories, transactions, rules, recurring] = await Promise.all([
    fetchAccounts(),
    fetchCategories(),
    fetchTransactions(12),
    fetchRules(),
    fetchRecurring(),
  ]);
  return (
    <AppShell title="Assistente">
      <AssistantPanel
        accounts={accounts}
        categories={categories}
        transactions={transactions}
        rules={rules}
        recurring={recurring}
      />
    </AppShell>
  );
}
