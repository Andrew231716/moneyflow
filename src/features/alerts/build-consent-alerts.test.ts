import { describe, expect, it } from "vitest";
import { buildConsentAlerts } from "./build-consent-alerts";

describe("buildConsentAlerts", () => {
  it("flags expired and soon-expiring consents", () => {
    const now = Date.now();
    const alerts = buildConsentAlerts([
      {
        id: "1",
        institution_name: "Intesa",
        consent_expires_at: new Date(now - 86_400_000).toISOString(),
        status: "active",
      },
      {
        id: "2",
        institution_name: "Revolut",
        consent_expires_at: new Date(now + 3 * 86_400_000).toISOString(),
        status: "active",
      },
      {
        id: "3",
        institution_name: "OK Bank",
        consent_expires_at: new Date(now + 40 * 86_400_000).toISOString(),
        status: "active",
      },
    ]);
    expect(alerts.map((a) => a.id)).toEqual(["1", "2"]);
    expect(alerts[0].consent_expired).toBe(true);
    expect(alerts[1].consent_expired).toBe(false);
  });
});
