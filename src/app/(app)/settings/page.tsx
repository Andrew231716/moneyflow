import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchCategories, fetchRules } from "@/lib/data/queries";
import { SettingsPanel } from "@/features/settings/settings-panel";

export default async function SettingsPage() {
  if (!hasSupabaseEnv()) return null;
  const [categories, rules] = await Promise.all([
    fetchCategories(),
    fetchRules(),
  ]);
  return (
    <AppShell title="Impostazioni">
      <SettingsPanel categories={categories} rules={rules} />
    </AppShell>
  );
}
