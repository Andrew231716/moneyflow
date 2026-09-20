import { createEnableBankingProvider, isEnableBankingConfigured } from "./enablebanking-provider";
import { createGoCardlessProvider } from "./gocardless-provider";
import type { OpenBankingProvider } from "./provider";
import type { OpenBankingProviderId } from "./types";

/**
 * Prefer Enable Banking when configured (GoCardless closed to new signups).
 * Override with OPEN_BANKING_PROVIDER=gocardless|enablebanking.
 *
 * Use this (not a module-level constant) so env changes in tests / serverless
 * cold starts resolve correctly — DEFAULT_PROVIDER ≡ resolveDefaultProviderId().
 */
export function resolveDefaultProviderId(): OpenBankingProviderId {
  const forced = process.env.OPEN_BANKING_PROVIDER?.trim().toLowerCase();
  if (forced === "gocardless" || forced === "enablebanking") {
    return forced;
  }
  if (isEnableBankingConfigured()) return "enablebanking";
  if (process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY) {
    return "gocardless";
  }
  // Default to Enable Banking so missing-config errors mention the active provider.
  return "enablebanking";
}

/**
 * Factory — app uses OpenBankingProvider only.
 */
export function getOpenBankingProvider(
  providerId: OpenBankingProviderId = resolveDefaultProviderId()
): OpenBankingProvider {
  switch (providerId) {
    case "enablebanking":
      return createEnableBankingProvider();
    case "gocardless":
      return createGoCardlessProvider();
    case "tink":
    case "truelayer":
    case "yapily":
    case "saltedge":
      throw new Error(
        `Provider Open Banking "${providerId}" non ancora configurato.`
      );
    default:
      throw new Error(`Provider Open Banking sconosciuto: ${providerId}`);
  }
}
