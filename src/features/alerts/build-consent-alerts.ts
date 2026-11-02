export type BankConsentAlert = {
  id: string;
  institution_name: string;
  consent_message: string | null;
  consent_expires_at: string | null;
  consent_expired: boolean;
  daysLeft: number | null;
};

/** Pure helper — safe to import from Server Components. */
export function buildConsentAlerts(
  connections: Array<{
    id: string;
    institution_name: string;
    consent_expires_at: string | null;
    consent_expired?: boolean;
    consent_message?: string | null;
    status?: string;
  }>
): BankConsentAlert[] {
  const now = Date.now();
  return connections
    .filter((c) => c.status !== "disconnected")
    .map((c) => {
      const expired =
        c.consent_expired === true ||
        c.status === "expired" ||
        (!!c.consent_expires_at &&
          new Date(c.consent_expires_at).getTime() < now);
      let daysLeft: number | null = null;
      if (c.consent_expires_at) {
        daysLeft = Math.ceil(
          (new Date(c.consent_expires_at).getTime() - now) / 86_400_000
        );
      }
      return {
        id: c.id,
        institution_name: c.institution_name,
        consent_message: c.consent_message ?? null,
        consent_expires_at: c.consent_expires_at,
        consent_expired: expired,
        daysLeft,
      };
    })
    .filter(
      (c) =>
        c.consent_expired ||
        (c.daysLeft != null && c.daysLeft >= 0 && c.daysLeft <= 14)
    );
}
