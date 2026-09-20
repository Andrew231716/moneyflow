import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchCategories,
  fetchRules,
  fetchTransactions,
} from "@/lib/data/queries";
import { TransactionsManager } from "@/features/transactions/transactions-manager";
import { LoadingState } from "@/components/money";

export const dynamic = "force-dynamic";

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
      <Suspense fallback={<LoadingState label="Caricamento movimenti…" />}>
        <TransactionsManager
          transactions={transactions}
          accounts={accounts}
          categories={categories}
          rules={rules}
        />
      </Suspense>
    </AppShell>
  );
}
