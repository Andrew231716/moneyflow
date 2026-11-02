import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { EnvMissing } from "@/components/env-missing";
import { AppLockProvider } from "@/features/security/app-lock-provider";

/** Auth + live balances/movements must never be statically prerendered. */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!hasSupabaseEnv()) {
    return (
      <AppShell title="Configurazione">
        <EnvMissing />
      </AppShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AppLockProvider>{children}</AppLockProvider>;
}
