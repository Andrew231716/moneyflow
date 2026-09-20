import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchAccounts } from "@/lib/data/queries";
import { AccountsManager } from "@/features/accounts/accounts-manager";

export default async function AccountsPage() {
  if (!hasSupabaseEnv()) return null;
  const accounts = await fetchAccounts();
  return (
    <AppShell title="Conti">
      <Suspense fallback={null}>
        <AccountsManager accounts={accounts} />
      </Suspense>
    </AppShell>
  );
}
