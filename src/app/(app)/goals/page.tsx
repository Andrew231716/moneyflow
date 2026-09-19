import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchGoals } from "@/lib/data/queries";
import { GoalsManager } from "@/features/goals/goals-manager";

export default async function GoalsPage() {
  if (!hasSupabaseEnv()) return null;
  const goals = await fetchGoals();
  return (
    <AppShell title="Obiettivi">
      <GoalsManager goals={goals} />
    </AppShell>
  );
}
