import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchCategories,
  fetchRules,
  fetchTransactions,
} from "@/lib/data/queries";
import { TransactionsManager } from "@/features/transactions/transactions-manager";

export default async function TransactionsPage() {
  if (!hasSupabaseEnv()) return null;
  const [transactions, accounts, categories, rules] = await Promise.all([
    fetchTransactions(24),
    fetchAccounts(),
    fetchCategories(),
    fetchRules(),
  ]);
  return (
    <AppShell title="Movimenti">
      <TransactionsManager
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        rules={rules}
      />
    </AppShell>
  );
}
