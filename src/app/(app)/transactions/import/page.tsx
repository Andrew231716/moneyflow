import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchCategories,
  fetchRules,
  fetchTransactions,
} from "@/lib/data/queries";
import { CsvImportWizard } from "@/features/transactions/csv-import-wizard";

export default async function ImportPage() {
  if (!hasSupabaseEnv()) return null;
  const [accounts, categories, rules, transactions] = await Promise.all([
    fetchAccounts(),
    fetchCategories(),
    fetchRules(),
    fetchTransactions(36),
  ]);
  const existingKeys = transactions.map(
    (t) =>
      `${t.date}|${Number(t.amount).toFixed(2)}|${(t.description || "").toLowerCase()}`
  );
  return (
    <AppShell title="Import CSV">
      <CsvImportWizard
        accounts={accounts}
        categories={categories}
        rules={rules}
        existingKeys={existingKeys}
      />
    </AppShell>
  );
}
