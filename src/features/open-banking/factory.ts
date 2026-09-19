import { createGoCardlessProvider } from "./gocardless-provider";
import type { OpenBankingProvider } from "./provider";
import type { OpenBankingProviderId } from "./types";

/**
 * Factory — app uses OpenBankingProvider only.
 * Swap adapters here when adding Tink / TrueLayer / Yapily / Salt Edge.
 */
export function getOpenBankingProvider(
  providerId: OpenBankingProviderId = "gocardless"
): OpenBankingProvider {
  switch (providerId) {
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
