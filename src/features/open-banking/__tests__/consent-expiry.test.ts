import { describe, expect, it, vi } from "vitest";
import { resolveConsentExpiresAt } from "../service";

describe("resolveConsentExpiresAt", () => {
  it("computes expiry from acceptedAt + accessValidForDays", async () => {
    const provider = {
      getAgreement: vi.fn(async () => ({
        id: "agr-1",
        acceptedAt: "2026-01-01T00:00:00.000Z",
        accessValidForDays: 30,
        createdAt: "2025-12-01T00:00:00.000Z",
      })),
    };
    const iso = await resolveConsentExpiresAt(provider, { agreement: "agr-1" });
    expect(iso).toBe("2026-01-31T00:00:00.000Z");
  });

  it("returns null when agreement data is incomplete (no invented 90 days)", async () => {
    expect(await resolveConsentExpiresAt({}, { agreement: "agr-1" })).toBeNull();
    expect(
      await resolveConsentExpiresAt(
        {
          getAgreement: async () => ({
            id: "agr-1",
            acceptedAt: null,
            accessValidForDays: 90,
            createdAt: null,
          }),
        },
        { agreement: "agr-1" }
      )
    ).toBeNull();
    expect(
      await resolveConsentExpiresAt(
        {
          getAgreement: async () => ({
            id: "agr-1",
            acceptedAt: "2026-01-01T00:00:00.000Z",
            accessValidForDays: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
        },
        { agreement: "agr-1" }
      )
    ).toBeNull();
  });

  it("falls back to createdAt when acceptedAt is empty", async () => {
    const iso = await resolveConsentExpiresAt(
      {
        getAgreement: async () => ({
          id: "agr-1",
          acceptedAt: null,
          accessValidForDays: 10,
          createdAt: "2026-03-01T12:00:00.000Z",
        }),
      },
      { agreement: "agr-1" }
    );
    expect(iso).toBe("2026-03-11T12:00:00.000Z");
  });
});
