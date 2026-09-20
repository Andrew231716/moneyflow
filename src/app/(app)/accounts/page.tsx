import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchAccounts, fetchGoals } from "@/lib/data/queries";
import { AccountsManager } from "@/features/accounts/accounts-manager";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  if (!hasSupabaseEnv()) return null;
  const [accounts, goals] = await Promise.all([fetchAccounts(), fetchGoals()]);
  return (
    <AppShell title="Conti">
      <Suspense fallback={null}>
        <AccountsManager accounts={accounts} goals={goals} />
      </Suspense>
    </AppShell>
  );
}
