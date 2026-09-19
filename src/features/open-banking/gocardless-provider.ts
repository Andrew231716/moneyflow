import type { OpenBankingProvider } from "./provider";
import type {
  CreateConnectionParams,
  GetTransactionsParams,
  Institution,
  ProviderAccount,
  ProviderAgreement,
  ProviderBalance,
  ProviderConnection,
  ProviderTransaction,
} from "./types";

const API_BASE = "https://bankaccountdata.gocardless.com/api/v2";

interface TokenCache {
  access: string;
  refresh: string;
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

let tokenCache: TokenCache | null = null;

function requireSecrets(): { secretId: string; secretKey: string } {
  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;
  if (!secretId || !secretKey) {
    throw new OpenBankingConfigError(
      "Credenziali GoCardless mancanti. Configura GOCARDLESS_SECRET_ID e GOCARDLESS_SECRET_KEY."
    );
  }
  return { secretId, secretKey };
}

export class OpenBankingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenBankingConfigError";
  }
}

export class GoCardlessApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "GoCardlessApiError";
  }
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function friendlyStatusMessage(status: number): string {
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

/** Prefer a clearable timeout over AbortSignal.timeout so completed requests do not leave live timers (hangs vitest / idle Node). */
function createRequestTimeout(existing: AbortSignal | null | undefined, ms = 15_000): {
  signal: AbortSignal;
  clear: () => void;
} {
  if (existing) {
    return { signal: existing, clear: () => undefined };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(Object.assign(new Error("Timeout"), { name: "TimeoutError" }));
  }, ms);
  timer.unref?.();
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

async function gcFetch<T>(
  path: string,
  init: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Accept", "application/json");
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!skipAuth) {
    const token = await getAccessToken();
    headers.set("Authorization", `Bearer ${token}`);
  }

  const timeout = createRequestTimeout(rest.signal);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers,
      cache: "no-store",
      signal: timeout.signal,
    });
    if (!res.ok) {
      // Never log tokens / secrets / full bank payloads
      throw new GoCardlessApiError(friendlyStatusMessage(res.status), res.status);
    }
    if (res.status === 204) {
      return undefined as T;
    }
    return (await parseJsonSafe(res)) as T;
  } catch (err) {
    if (
      !rest.signal?.aborted &&
      timeout.signal.aborted &&
      err &&
      typeof err === "object" &&
      "name" in err &&
      ((err as { name: string }).name === "AbortError" ||
        (err as { name: string }).name === "TimeoutError")
    ) {
      throw Object.assign(new Error("Timeout del provider bancario. Riprova più tardi."), {
        name: "TimeoutError",
      });
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

interface TokenResponse {
  access: string;
  access_expires: number;
  refresh: string;
  refresh_expires: number;
}

async function fetchNewTokenPair(): Promise<TokenCache> {
  const { secretId, secretKey } = requireSecrets();
  const data = await gcFetch<TokenResponse>("/token/new/", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
  });
  const now = Date.now();
  return {
    access: data.access,
    refresh: data.refresh,
    accessExpiresAt: now + data.access_expires * 1000,
    refreshExpiresAt: now + data.refresh_expires * 1000,
  };
}

async function refreshAccessToken(refresh: string): Promise<TokenCache> {
  const data = await gcFetch<TokenResponse>("/token/refresh/", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ refresh }),
  });
  const now = Date.now();
  return {
    access: data.access,
    refresh: data.refresh ?? refresh,
    accessExpiresAt: now + data.access_expires * 1000,
    refreshExpiresAt:
      data.refresh_expires != null
        ? now + data.refresh_expires * 1000
        : (tokenCache?.refreshExpiresAt ?? now + 30 * 24 * 3600 * 1000),
  };
}

/** Server-side token cache with expiry + auto-refresh. */
export async function getAccessToken(): Promise<string> {
  const skewMs = 60_000;
  const now = Date.now();

  if (tokenCache && tokenCache.accessExpiresAt - skewMs > now) {
    return tokenCache.access;
  }

  if (tokenCache && tokenCache.refreshExpiresAt - skewMs > now) {
    try {
      tokenCache = await refreshAccessToken(tokenCache.refresh);
      return tokenCache.access;
    } catch {
      tokenCache = null;
    }
  }

  tokenCache = await fetchNewTokenPair();
  return tokenCache.access;
}

/** Test helper — clears in-memory token cache. */
export function clearTokenCache(): void {
  tokenCache = null;
}

interface GcInstitution {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  countries: string[];
  transaction_total_days?: string | number;
}

interface GcRequisition {
  id: string;
  status: string;
  institution_id: string;
  link?: string;
  accounts?: string[];
  reference?: string;
  agreement?: string;
}

interface GcAgreement {
  id: string;
  created?: string;
  accepted?: string | null;
  access_valid_for_days?: number | string | null;
}

interface GcAccount {
  id: string;
  iban?: string;
  name?: string;
  currency?: string;
  ownerName?: string;
  product?: string;
  cashAccountType?: string;
}

interface GcAccountDetails {
  account?: GcAccount;
}

interface GcBalanceAmount {
  amount: string;
  currency: string;
}

interface GcBalance {
  balanceAmount: GcBalanceAmount;
  balanceType?: string;
  referenceDate?: string;
}

interface GcBalancesResponse {
  balances?: GcBalance[];
}

interface GcTransactionAmount {
  amount: string;
  currency: string;
}

interface GcTx {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: GcTransactionAmount;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  creditorName?: string;
  debtorName?: string;
  proprietaryBankTransactionCode?: string;
  additionalInformation?: string;
}

interface GcTransactionsResponse {
  transactions?: {
    booked?: GcTx[];
    pending?: GcTx[];
  };
}

function mapInstitution(i: GcInstitution): Institution {
  const days =
    i.transaction_total_days != null
      ? Number(i.transaction_total_days)
      : null;
  return {
    id: i.id,
    name: i.name,
    bic: i.bic ?? null,
    logo: i.logo ?? null,
    countries: i.countries ?? [],
    transactionTotalDays: Number.isFinite(days) ? days : null,
  };
}

function mapConnection(r: GcRequisition): ProviderConnection {
  return {
    id: r.id,
    status: r.status,
    institutionId: r.institution_id,
    link: r.link ?? null,
    accounts: r.accounts ?? [],
    reference: r.reference ?? null,
    agreement: r.agreement ?? null,
    rawStatus: r.status,
  };
}

function mapAccount(a: GcAccount): ProviderAccount {
  return {
    id: a.id,
    iban: a.iban ?? null,
    name: a.name ?? a.product ?? null,
    currency: a.currency ?? null,
    ownerName: a.ownerName ?? null,
    product: a.product ?? null,
  };
}

function mapTx(tx: GcTx): ProviderTransaction {
  const amount = Number(tx.transactionAmount.amount);
  const remittance =
    tx.remittanceInformationUnstructured ??
    tx.remittanceInformationUnstructuredArray?.join(" ") ??
    null;

  return {
    id: tx.transactionId ?? tx.internalTransactionId ?? null,
    bookingDate: tx.bookingDate ?? null,
    valueDate: tx.valueDate ?? null,
    amount,
    currency: tx.transactionAmount.currency,
    description: remittance ?? tx.additionalInformation ?? null,
    merchantName: tx.creditorName ?? tx.debtorName ?? null,
    remittanceInformation: remittance,
    debtorName: tx.debtorName ?? null,
    creditorName: tx.creditorName ?? null,
    raw: tx as unknown as Record<string, unknown>,
  };
}

export class GoCardlessProvider implements OpenBankingProvider {
  readonly id = "gocardless" as const;

  async getInstitutions(country: string): Promise<Institution[]> {
    const data = await gcFetch<GcInstitution[]>(
      `/institutions/?country=${encodeURIComponent(country.toLowerCase())}`
    );
    return (data ?? []).map(mapInstitution);
  }

  async createConnection(
    params: CreateConnectionParams
  ): Promise<ProviderConnection> {
    const body = {
      redirect: params.redirectUrl,
      institution_id: params.institutionId,
      reference: params.reference,
      user_language: params.userLanguage ?? "IT",
    };
    const data = await gcFetch<GcRequisition>("/requisitions/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return mapConnection(data);
  }

  async getConnection(connectionId: string): Promise<ProviderConnection> {
    const data = await gcFetch<GcRequisition>(
      `/requisitions/${encodeURIComponent(connectionId)}/`
    );
    return mapConnection(data);
  }

  async getAgreement(agreementId: string): Promise<ProviderAgreement | null> {
    if (!agreementId) return null;
    const data = await gcFetch<GcAgreement>(
      `/agreements/enduser/${encodeURIComponent(agreementId)}/`
    );
    const daysRaw = data.access_valid_for_days;
    const days =
      daysRaw == null || daysRaw === ""
        ? null
        : Number(daysRaw);
    return {
      id: data.id,
      acceptedAt: data.accepted || null,
      accessValidForDays: Number.isFinite(days) ? days : null,
      createdAt: data.created ?? null,
    };
  }

  async getAccounts(connectionId: string): Promise<ProviderAccount[]> {
    const connection = await this.getConnection(connectionId);
    const accounts: ProviderAccount[] = [];
    for (const accountId of connection.accounts) {
      try {
        accounts.push(await this.getAccountDetails(accountId));
      } catch {
        accounts.push({ id: accountId });
      }
    }
    return accounts;
  }

  async getAccountDetails(accountId: string): Promise<ProviderAccount> {
    const meta = await gcFetch<GcAccount>(
      `/accounts/${encodeURIComponent(accountId)}/`
    );
    let details: GcAccount | undefined;
    try {
      const d = await gcFetch<GcAccountDetails>(
        `/accounts/${encodeURIComponent(accountId)}/details/`
      );
      details = d.account;
    } catch {
      details = undefined;
    }
    return mapAccount({ ...meta, ...details, id: accountId });
  }

  async getBalances(accountId: string): Promise<ProviderBalance[]> {
    const data = await gcFetch<GcBalancesResponse>(
      `/accounts/${encodeURIComponent(accountId)}/balances/`
    );
    return (data.balances ?? []).map((b) => ({
      amount: Number(b.balanceAmount.amount),
      currency: b.balanceAmount.currency,
      type: b.balanceType ?? null,
      referenceDate: b.referenceDate ?? null,
    }));
  }

  async getTransactions(
    params: GetTransactionsParams
  ): Promise<ProviderTransaction[]> {
    const q = new URLSearchParams();
    if (params.dateFrom) q.set("date_from", params.dateFrom);
    if (params.dateTo) q.set("date_to", params.dateTo);
    const qs = q.toString();
    const path = `/accounts/${encodeURIComponent(params.accountId)}/transactions/${qs ? `?${qs}` : ""}`;
    const data = await gcFetch<GcTransactionsResponse>(path);
    const booked = data.transactions?.booked ?? [];
    // Pending transactions can change identity and amount before booking.
    // Persist only booked entries to avoid counting the same payment twice.
    return booked.map(mapTx);
  }

  async deleteConnection(connectionId: string): Promise<void> {
    await gcFetch<void>(
      `/requisitions/${encodeURIComponent(connectionId)}/`,
      { method: "DELETE" }
    );
  }
}

export function createGoCardlessProvider(): OpenBankingProvider {
  return new GoCardlessProvider();
}
