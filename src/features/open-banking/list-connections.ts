import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lightweight connection list for Home SSR.
 * Avoids importing the full open-banking service (providers, jose, sync).
 */
export async function listBankConnectionsForAlerts(options: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<
  Array<{
    id: string;
    institution_name: string;
    consent_expires_at: string | null;
    status: string;
    consent_expired: boolean;
    consent_message: string | null;
  }>
> {
  const { data, error } = await options.supabase
    .from("bank_connections")
    .select("id, institution_name, consent_expires_at, status")
    .eq("user_id", options.userId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listBankConnectionsForAlerts", error.message);
    return [];
  }

  const now = Date.now();
  return (data ?? []).map((c) => {
    const consent_expired =
      c.status === "expired" ||
      (!!c.consent_expires_at &&
        new Date(c.consent_expires_at).getTime() < now);
    const consent_message = consent_expired
      ? /intesa/i.test(c.institution_name)
        ? "Il consenso Open Banking di Intesa Sanpaolo è scaduto. Ricollega il conto per continuare la sincronizzazione."
        : `Il consenso Open Banking di ${c.institution_name} è scaduto. Ricollega il conto.`
      : null;
    return {
      id: c.id as string,
      institution_name: c.institution_name as string,
      consent_expires_at: (c.consent_expires_at as string | null) ?? null,
      status: c.status as string,
      consent_expired,
      consent_message,
    };
  });
}
