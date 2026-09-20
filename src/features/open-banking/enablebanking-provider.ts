import { SignJWT, importPKCS8 } from "jose";
import type { OpenBankingProvider } from "./provider";
import {
  IncompleteTransactionsError,
  OpenBankingConfigError,
  OpenBankingProviderError,
  RATE_LIMIT_PARTIAL_MESSAGE,
  friendlyProviderStatusMessage,
} from "./errors";
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

const API_BASE = "https://api.enablebanking.com";

/** Encode ASPSP as stable institution id: COUNTRY::Name */
export function encodeInstitutionId(country: string, name: string): string {
  return `${country.toUpperCase()}::${name}`;
}

export function decodeInstitutionId(id: string): { country: string; name: string } {
  const sep = id.indexOf("::");
  if (sep <= 0) {
    throw new OpenBankingConfigError("Identificativo banca Enable Banking non valido.");
  }
  return {
    country: id.slice(0, sep).toUpperCase(),
    name: id.slice(sep + 2),
  };
}

function requireCredentials(): { applicationId: string; privateKeyPem: string } {
  const applicationId = process.env.ENABLEBANKING_APPLICATION_ID?.trim();
  const privateKeyPem = process.env.ENABLEBANKING_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!applicationId || !privateKeyPem) {
    throw new OpenBankingConfigError(
      "Credenziali Enable Banking mancanti. Configura ENABLEBANKING_APPLICATION_ID e ENABLEBANKING_PRIVATE_KEY."
    );
  }
  return { applicationId, privateKeyPem };
}

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

async function parseJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

let cachedKey: CryptoKey | null = null;
let cachedKeyFingerprint: string | null = null;

/** Test helper — drop cached PKCS8 key between cases. */
export function clearEnableBankingKeyCache(): void {
  cachedKey = null;
  cachedKeyFingerprint = null;
}

async function getPrivateKey(pem: string): Promise<CryptoKey> {
  if (cachedKey && cachedKeyFingerprint === pem) return cachedKey;
  cachedKey = await importPKCS8(pem, "RS256");
  cachedKeyFingerprint = pem;
  return cachedKey;
}

/** Build short-lived RS256 JWT for Enable Banking API auth. */
export async function createEnableBankingJwt(): Promise<string> {
  const { applicationId, privateKeyPem } = requireCredentials();
  const key = await getPrivateKey(privateKeyPem);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: applicationId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

function sleep(ms: number): Promise<void> {
  // Skip pacing in unit tests so suites stay fast.
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Intesa / Enable Banking ASPSP limits need long pauses, not rapid retries. */
const RATE_LIMIT_BACKOFF_MS = [5_000, 15_000, 45_000] as const;
/** Pause between transaction pages to stay under ASPSP quotas. */
const TX_PAGE_DELAY_MS = 2_500;

function rateLimitBackoffMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt - 1, 0), RATE_LIMIT_BACKOFF_MS.length - 1);
  return RATE_LIMIT_BACKOFF_MS[idx] + Math.floor(Math.random() * 500);
}

function isRateLimitError(err: unknown): boolean {
  return (
    err instanceof OpenBankingProviderError &&
    (err.status === 429 ||
      (err.providerCode ?? "").toUpperCase() === "ASPSP_RATE_LIMIT_EXCEEDED")
  );
}

async function ebFetch<T>(
  path: string,
  init: RequestInit = {},
  options?: { maxRetries?: number; timeoutMs?: number }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  let attempt = 0;

  while (true) {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const jwt = await createEnableBankingJwt();
    headers.set("Authorization", `Bearer ${jwt}`);

    const timeout = createRequestTimeout(init.signal, timeoutMs);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: timeout.signal,
      });
      if (!res.ok) {
        const errBody = await parseJsonSafe(res);
        const providerCode =
          errBody &&
          typeof errBody === "object" &&
          "error" in errBody &&
          typeof (errBody as { error: unknown }).error === "string"
            ? (errBody as { error: string }).error
            : null;
        const error = new OpenBankingProviderError(
          friendlyProviderStatusMessage(res.status, providerCode),
          res.status,
          providerCode
        );
        if (isRateLimitError(error) && attempt < maxRetries) {
          attempt += 1;
          await sleep(rateLimitBackoffMs(attempt));
          continue;
        }
        throw error;
      }
      if (res.status === 204) return undefined as T;
      return (await parseJsonSafe(res)) as T;
    } catch (err) {
      if (
        !init.signal?.aborted &&
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
      if (isRateLimitError(err) && attempt < maxRetries) {
        attempt += 1;
        await sleep(rateLimitBackoffMs(attempt));
        continue;
      }
      throw err;
    } finally {
      timeout.clear();
    }
  }
}

interface EbAspsp {
  name: string;
  country: string;
  logo?: string | null;
  bic?: string | null;
  maximum_consent_validity?: number;
}

interface EbAuthResponse {
  url: string;
  authorization_id: string;
}

interface EbSessionAccount {
  uid: string;
  name?: string;
  currency?: string;
  product?: string;
  account_id?: { iban?: string };
}

interface EbSessionResponse {
  session_id: string;
  accounts: Array<EbSessionAccount | string>;
  access?: {
    valid_until?: string;
    balances?: boolean;
    transactions?: boolean;
  };
  aspsp?: { name: string; country: string };
}

interface EbBalance {
  name?: string;
  balance_amount?: { amount: string; currency: string };
  balance_type?: string;
  reference_date?: string;
  date?: string;
}

interface EbTransaction {
  entry_reference?: string;
  transaction_id?: string;
  booking_date?: string;
  value_date?: string;
  status?: string;
  credit_debit_indicator?: "CRDT" | "DBIT";
  transaction_amount?: { amount: string; currency: string };
  remittance_information?: string[];
  creditor?: { name?: string };
  debtor?: { name?: string };
}

/** Session payloads may return full account objects or bare UUID strings. */
function mapSessionAccount(a: EbSessionAccount | string): ProviderAccount {
  if (typeof a === "string") {
    return { id: a };
  }
  return {
    id: a.uid,
    iban: a.account_id?.iban ?? null,
    name: a.name ?? a.product ?? null,
    currency: a.currency ?? null,
    product: a.product ?? null,
  };
}

function consentValidUntilIso(maximumConsentValiditySec?: number | null): string {
  const requestedSec = 90 * 24 * 60 * 60;
  const maxSec =
    maximumConsentValiditySec != null && maximumConsentValiditySec > 0
      ? maximumConsentValiditySec
      : requestedSec;
  // Stay slightly under ASPSP max to avoid boundary rejections.
  const cappedSec = Math.min(requestedSec, Math.max(60, maxSec - 60));
  return new Date(Date.now() + cappedSec * 1000).toISOString();
}

function mapTx(tx: EbTransaction): ProviderTransaction {
  const rawAmount = Number(tx.transaction_amount?.amount ?? 0);
  const indicator = tx.credit_debit_indicator;
  // Prefer signed amount: CRDT positive, DBIT negative when amount is absolute.
  let amount = rawAmount;
  if (indicator === "DBIT" && amount > 0) amount = -amount;
  if (indicator === "CRDT" && amount < 0) amount = Math.abs(amount);

  const remittance = tx.remittance_information?.filter(Boolean).join(" ") || null;

  return {
    id: tx.entry_reference ?? tx.transaction_id ?? null,
    bookingDate: tx.booking_date ?? null,
    valueDate: tx.value_date ?? null,
    amount,
    currency: tx.transaction_amount?.currency ?? "EUR",
    description: remittance,
    merchantName: tx.creditor?.name ?? tx.debtor?.name ?? null,
    remittanceInformation: remittance,
    debtorName: tx.debtor?.name ?? null,
    creditorName: tx.creditor?.name ?? null,
    raw: tx as unknown as Record<string, unknown>,
  };
}

export class EnableBankingProvider implements OpenBankingProvider {
  readonly id = "enablebanking" as const;

  async getInstitutions(country: string): Promise<Institution[]> {
    const code = country.toUpperCase();
    const data = await ebFetch<{ aspsps: EbAspsp[] }>(
      `/aspsps?country=${encodeURIComponent(code)}`
    );
    return (data.aspsps ?? []).map((a) => {
      const days =
        a.maximum_consent_validity != null
          ? Math.floor(a.maximum_consent_validity / 86400)
          : null;
      return {
        id: encodeInstitutionId(a.country || code, a.name),
        name: a.name,
        bic: a.bic ?? null,
        logo: a.logo ?? null,
        countries: [a.country || code],
        transactionTotalDays: Number.isFinite(days) ? days : null,
      };
    });
  }

  async createConnection(
    params: CreateConnectionParams
  ): Promise<ProviderConnection> {
    const { country, name } = decodeInstitutionId(params.institutionId);
    const aspsps = await ebFetch<{ aspsps: EbAspsp[] }>(
      `/aspsps?country=${encodeURIComponent(country)}`
    );
    const aspsp = (aspsps.aspsps ?? []).find(
      (a) => a.name === name && (a.country || country).toUpperCase() === country
    );
    const validUntil = consentValidUntilIso(aspsp?.maximum_consent_validity);

    const data = await ebFetch<EbAuthResponse>("/auth", {
      method: "POST",
      body: JSON.stringify({
        access: {
          balances: true,
          transactions: true,
          valid_until: validUntil,
        },
        aspsp: { name, country },
        state: params.reference,
        redirect_url: params.redirectUrl,
        psu_type: "personal",
      }),
    });

    return {
      id: data.authorization_id,
      status: "PENDING",
      institutionId: params.institutionId,
      link: data.url,
      accounts: [],
      reference: params.reference,
      agreement: null,
      rawStatus: "PENDING",
    };
  }

  /**
   * Exchange authorization code for session (Enable Banking callback step).
   */
  async completeAuthorization(params: {
    code: string;
  }): Promise<{
    connection: ProviderConnection;
    accounts: ProviderAccount[];
    consentExpiresAt: string | null;
  }> {
    const session = await ebFetch<EbSessionResponse>("/sessions", {
      method: "POST",
      body: JSON.stringify({ code: params.code }),
    });

    const accounts = (session.accounts ?? [])
      .map(mapSessionAccount)
      .filter((a) => Boolean(a.id));
    const institutionId = session.aspsp
      ? encodeInstitutionId(session.aspsp.country, session.aspsp.name)
      : "";

    return {
      connection: {
        id: session.session_id,
        status: "ACTIVE",
        institutionId,
        link: null,
        accounts: accounts.map((a) => a.id),
        reference: null,
        agreement: null,
        rawStatus: "ACTIVE",
      },
      accounts,
      consentExpiresAt: session.access?.valid_until ?? null,
    };
  }

  async getConnection(connectionId: string): Promise<ProviderConnection> {
    const session = await ebFetch<EbSessionResponse>(
      `/sessions/${encodeURIComponent(connectionId)}`
    );
    const accounts = (session.accounts ?? [])
      .map(mapSessionAccount)
      .filter((a) => Boolean(a.id));
    return {
      id: session.session_id,
      status: "ACTIVE",
      institutionId: session.aspsp
        ? encodeInstitutionId(session.aspsp.country, session.aspsp.name)
        : "",
      link: null,
      accounts: accounts.map((a) => a.id),
      reference: null,
      agreement: null,
      rawStatus: "ACTIVE",
    };
  }

  async getAgreement(): Promise<ProviderAgreement | null> {
    // Consent window comes from session.access.valid_until at authorize time.
    return null;
  }

  async getAccounts(connectionId: string): Promise<ProviderAccount[]> {
    const connection = await this.getConnection(connectionId);
    return Promise.all(
      connection.accounts.map((id) => this.getAccountDetails(id))
    );
  }

  async getAccountDetails(accountId: string): Promise<ProviderAccount> {
    try {
      const details = await ebFetch<{
        account?: EbSessionAccount & { uid?: string };
        uid?: string;
        name?: string;
        currency?: string;
        product?: string;
        account_id?: { iban?: string };
      }>(`/accounts/${encodeURIComponent(accountId)}/details`);

      const a = details.account ?? details;
      return {
        id: a.uid ?? accountId,
        iban: a.account_id?.iban ?? null,
        name: a.name ?? a.product ?? null,
        currency: a.currency ?? null,
        product: a.product ?? null,
      };
    } catch {
      return { id: accountId };
    }
  }

  async getBalances(accountId: string): Promise<ProviderBalance[]> {
    const data = await ebFetch<{ balances?: EbBalance[] }>(
      `/accounts/${encodeURIComponent(accountId)}/balances`
    );
    return (data.balances ?? []).map((b) => ({
      amount: Number(b.balance_amount?.amount ?? 0),
      currency: b.balance_amount?.currency ?? "EUR",
      type: b.balance_type ?? b.name ?? null,
      referenceDate: b.reference_date ?? b.date ?? null,
    }));
  }

  async getTransactions(
    params: GetTransactionsParams
  ): Promise<ProviderTransaction[]> {
    // Freeze query params once — continuation_key requires identical GET params
    // on every page (Enable Banking FAQ). Do not send transaction_status: some
    // ASPSPs (incl. Intesa) embed it in the continuation key inconsistently and
    // return 422 WRONG_REQUEST_PARAMETERS on page 2+. Filter BOOK client-side.
    const q = new URLSearchParams();
    if (params.dateFrom) q.set("date_from", params.dateFrom);
    if (params.dateTo) q.set("date_to", params.dateTo);
    const basePath = `/accounts/${encodeURIComponent(params.accountId)}/transactions`;

    const all: ProviderTransaction[] = [];
    let continuation: string | null = null;
    let pages = 0;
    const maxPages = 50;

    do {
      pages += 1;
      if (pages > maxPages) {
        throw new IncompleteTransactionsError(
          "Sincronizzazione movimenti incompleta: troppe pagine dal provider. Riprova.",
          all
        );
      }

      // Pace pages aggressively — Intesa ASPSP_RATE_LIMIT_EXCEEDED is common.
      if (pages > 1) await sleep(TX_PAGE_DELAY_MS);

      const pageQuery = new URLSearchParams(q);
      if (continuation) pageQuery.set("continuation_key", continuation);
      const pagePath = `${basePath}?${pageQuery.toString()}`;
      let data: {
        transactions?: EbTransaction[];
        continuation_key?: string | null;
      };
      try {
        // 2 long backoffs (5s + 15s); prefer partial save over burning the window.
        data = await ebFetch(pagePath, {}, { timeoutMs: 25_000, maxRetries: 2 });
      } catch (err) {
        if (all.length > 0 && (continuation || isRateLimitError(err))) {
          throw new IncompleteTransactionsError(
            isRateLimitError(err)
              ? RATE_LIMIT_PARTIAL_MESSAGE
              : "Sincronizzazione movimenti incompleta: il provider ha interrotto la paginazione. Riprova tra poco per i restanti.",
            all
          );
        }
        throw err;
      }
      const booked = (data.transactions ?? []).filter(
        (t: EbTransaction) => !t.status || t.status.toUpperCase() === "BOOK"
      );
      all.push(...booked.map(mapTx));
      continuation = data.continuation_key ?? null;
    } while (continuation);

    return all;
  }

  async deleteConnection(connectionId: string): Promise<void> {
    await ebFetch<void>(`/sessions/${encodeURIComponent(connectionId)}`, {
      method: "DELETE",
    });
  }
}

export { RATE_LIMIT_PARTIAL_MESSAGE };

export function createEnableBankingProvider(): OpenBankingProvider {
  return new EnableBankingProvider();
}

export function isEnableBankingConfigured(): boolean {
  return Boolean(
    process.env.ENABLEBANKING_APPLICATION_ID?.trim() &&
      process.env.ENABLEBANKING_PRIVATE_KEY?.trim()
  );
}
