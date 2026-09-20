export class OpenBankingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenBankingConfigError";
  }
}

export class OpenBankingProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerCode: string | null = null
  ) {
    super(message);
    this.name = "OpenBankingProviderError";
  }
}

/** Partial page fetch succeeded but continuation failed — carry txs already retrieved. */
export const RATE_LIMIT_PARTIAL_MESSAGE =
  "Riprova tra qualche minuto — i movimenti già scaricati sono al sicuro";

export class IncompleteTransactionsError extends Error {
  constructor(
    message: string,
    public readonly transactions: import("./types").ProviderTransaction[]
  ) {
    super(message);
    this.name = "IncompleteTransactionsError";
  }
}

export function friendlyProviderStatusMessage(
  status: number,
  providerCode?: string | null
): string {
  const code = (providerCode ?? "").toUpperCase();
  if (code === "ASPSP_RATE_LIMIT_EXCEEDED" || status === 429) {
    return "Troppe richieste al provider bancario. Riprova tra qualche minuto.";
  }
  if (code === "WRONG_REQUEST_PARAMETERS" || status === 422) {
    return "Parametri non validi per la banca. Riprova la sincronizzazione tra poco.";
  }
  if (status === 401 || status === 403 || code === "ACCESS_DENIED") {
    return "Autenticazione Open Banking non valida. Controlla le credenziali del provider.";
  }
  if (status === 404) {
    return "Risorsa bancaria non trovata.";
  }
  if (status >= 500) {
    return "Il provider bancario non è disponibile al momento. Riprova più tardi.";
  }
  return "Errore nella comunicazione con il provider bancario.";
}
