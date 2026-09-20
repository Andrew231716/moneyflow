export class OpenBankingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenBankingConfigError";
  }
}

export class OpenBankingProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "OpenBankingProviderError";
  }
}

export function friendlyProviderStatusMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "Autenticazione Open Banking non valida. Controlla le credenziali del provider.";
  }
  if (status === 404) {
    return "Risorsa bancaria non trovata.";
  }
  if (status === 429) {
    return "Troppe richieste al provider bancario. Riprova tra poco.";
  }
  if (status >= 500) {
    return "Il provider bancario non è disponibile al momento. Riprova più tardi.";
  }
  return "Errore nella comunicazione con il provider bancario.";
}
