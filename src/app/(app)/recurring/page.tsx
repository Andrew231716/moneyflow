import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchAccounts, fetchCategories, fetchRecurring } from "@/lib/data/queries";
import { RecurringManager } from "@/features/recurring/recurring-manager";

export default async function RecurringPage() {
  if (!hasSupabaseEnv()) return null;
  const [items, accounts, categories] = await Promise.all([
    fetchRecurring(),
    fetchAccounts(),
    fetchCategories(),
  ]);
  return (
    <AppShell title="Ricorrenti">
      <RecurringManager items={items} accounts={accounts} categories={categories} />
    </AppShell>
  );
}
