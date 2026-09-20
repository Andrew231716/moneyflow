import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchAccounts, fetchGoals } from "@/lib/data/queries";
import { GoalsManager } from "@/features/goals/goals-manager";

export default async function GoalsPage() {
  if (!hasSupabaseEnv()) return null;
  const [goals, accounts] = await Promise.all([fetchGoals(), fetchAccounts()]);
  const savingsAccounts = accounts.filter(
    (a) => a.type === "savings" && !a.is_archived
  );
  return (
    <AppShell title="Obiettivi">
      <GoalsManager goals={goals} savingsAccounts={savingsAccounts} />
    </AppShell>
  );
}
