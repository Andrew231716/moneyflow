import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchDebts } from "@/lib/data/queries";
import { DebtsManager } from "@/features/debts/debts-manager";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  if (!hasSupabaseEnv()) return null;
  const debts = await fetchDebts();
  return (
    <AppShell title="Debiti">
      <DebtsManager debts={debts} />
    </AppShell>
  );
}
