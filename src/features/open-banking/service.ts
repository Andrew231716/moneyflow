import type { SupabaseClient } from "@supabase/supabase-js";
import { maskIban, mapRequisitionStatus, OpenBankingHttpError } from "./auth";
import { buildDedupIndexes, decideDedup } from "./deduplication";
import { getOpenBankingProvider, resolveDefaultProviderId } from "./factory";
import { detectInternalTransfers } from "./internal-transfer-detector";
import { normalizeProviderTransactions } from "./normalizer";
import type {
  BankAccountRow,
  BankConnectionRow,
  Institution,
  InternalTransferSuggestion,
  OpenBankingProviderId,
  SyncResult,
} from "./types";
import { prioritizeInstitutions } from "./institutions";
import {
  IncompleteTransactionsError,
  OpenBankingConfigError,
} from "./errors";

function redirectUrl(): string {
  const url = process.env.OPEN_BANKING_REDIRECT_URL;
  if (!url) {
    throw new OpenBankingConfigError(
      "OPEN_BANKING_REDIRECT_URL non configurato (es. http://localhost:3000/api/open-banking/callback)."
    );
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    throw new OpenBankingConfigError("OPEN_BANKING_REDIRECT_URL non valido.");
  }
  if (parsed.pathname !== "/api/open-banking/callback" || parsed.search || parsed.hash ||
      parsed.username || parsed.password ||
      (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && parsed.hostname === "localhost")) ||
      (process.env.VERCEL_ENV === "production" && parsed.protocol !== "https:")) {
    throw new OpenBankingConfigError("OPEN_BANKING_REDIRECT_URL deve indicare il callback HTTPS dell'app.");
  }
  return parsed.toString();
}

export async function listInstitutions(options: {
  country?: string;
  search?: string;
  providerId?: OpenBankingProviderId;
}): Promise<Institution[]> {
  const provider = getOpenBankingProvider(options.providerId ?? resolveDefaultProviderId());
  const country = (options.country ?? "IT").toUpperCase();
  const institutions = await provider.getInstitutions(country);
  return prioritizeInstitutions(institutions, options.search);
}

export async function startBankConnection(options: {
  supabase: SupabaseClient;
  userId: string;
  institutionId: string;
  institutionName: string;
  institutionLogo?: string | null;
  providerId?: OpenBankingProviderId;
}): Promise<{ connectionId: string; link: string }> {
  const providerId = options.providerId ?? resolveDefaultProviderId();
  const provider = getOpenBankingProvider(providerId);
  const reference = `mf_${crypto.randomUUID()}`;

  const created = await provider.createConnection({
    institutionId: options.institutionId,
    redirectUrl: redirectUrl(),
    reference,
    userLanguage: "IT",
  });

  if (!created.link) {
    throw new Error("Il provider non ha restituito il link di autorizzazione.");
  }

  const { data, error } = await options.supabase
    .from("bank_connections")
    .insert({
      user_id: options.userId,
      provider: providerId,
      provider_connection_id: created.id,
      institution_id: options.institutionId,
      institution_name: options.institutionName,
      institution_logo: options.institutionLogo ?? null,
      status: "pending",
      metadata: { reference },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Impossibile salvare la connessione bancaria.");
  }

  return { connectionId: data.id, link: created.link };
}

export async function handleConnectionCallback(options: {
  supabase: SupabaseClient;
  userId: string;
  /** Our bank_connections.id or provider requisition id / reference / Enable Banking state */
  ref?: string | null;
  requisitionId?: string | null;
  /** Enable Banking authorization code from callback */
  code?: string | null;
}): Promise<{ connection: BankConnectionRow; synced: boolean }> {
  let connection = await findConnection(options.supabase, options.userId, {
    id: options.ref,
    providerConnectionId: options.requisitionId ?? options.ref,
  });

  if (!connection || connection.status === "disconnected") {
    throw new OpenBankingHttpError("Connessione bancaria non trovata.", 404);
  }

  const provider = getOpenBankingProvider(connection.provider);

  // Enable Banking: exchange code → session before reading accounts.
  if (options.code && provider.completeAuthorization) {
    const completed = await provider.completeAuthorization({ code: options.code });
    const { data: sessionRow, error: sessionError } = await options.supabase
      .from("bank_connections")
      .update({
        provider_connection_id: completed.connection.id,
        consent_expires_at:
          connection.consent_expires_at ?? completed.consentExpiresAt,
        metadata: {
          ...(connection.metadata ?? {}),
          authorization_id: connection.provider_connection_id,
          session_id: completed.connection.id,
        },
        error_message: null,
      })
      .eq("id", connection.id)
      .eq("user_id", options.userId)
      .select("*")
      .single();

    if (sessionError || !sessionRow) {
      throw new Error("Impossibile salvare la sessione bancaria.");
    }
    connection = sessionRow as BankConnectionRow;

    for (const pa of completed.accounts) {
      await upsertBankAccountAndMoneyFlowAccount({
        supabase: options.supabase,
        userId: options.userId,
        connection,
        providerAccountId: pa.id,
        iban: pa.iban,
        name: pa.name ?? `${connection.institution_name}`,
        currency: pa.currency ?? "EUR",
      });
    }

    const { data: activated, error: activateError } = await options.supabase
      .from("bank_connections")
      .update({
        status: "active",
        error_message: null,
        consent_expires_at:
          connection.consent_expires_at ?? completed.consentExpiresAt,
      })
      .eq("id", connection.id)
      .eq("user_id", options.userId)
      .select("*")
      .single();

    if (activateError || !activated) {
      throw new Error("Impossibile attivare la connessione bancaria.");
    }
    connection = activated as BankConnectionRow;

    const result = await syncConnection({
      supabase: options.supabase,
      userId: options.userId,
      connectionId: connection.id,
    });

    return { connection, synced: result.errors.length === 0 };
  }

  // Ownership already enforced by user_id filter
  const remote = await provider.getConnection(connection.provider_connection_id);
  const status = mapRequisitionStatus(remote.status);

  if (status !== "active") {
    const errorMessage =
      status === "rejected"
        ? "Autorizzazione bancaria rifiutata."
        : status === "expired"
          ? "Autorizzazione bancaria scaduta."
          : status === "suspended"
            ? "Connessione bancaria sospesa."
            : status === "error"
              ? "Errore durante l'autorizzazione bancaria."
              : null;

    const { data: updated, error: updateError } = await options.supabase
      .from("bank_connections")
      .update({
        status,
        error_message: errorMessage,
      })
      .eq("id", connection.id)
      .eq("user_id", options.userId)
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error("Impossibile aggiornare lo stato della connessione bancaria.");
    }

    return {
      connection: updated as BankConnectionRow,
      synced: false,
    };
  }

  const accounts = await provider.getAccounts(connection.provider_connection_id);

  for (const pa of accounts) {
    await upsertBankAccountAndMoneyFlowAccount({
      supabase: options.supabase,
      userId: options.userId,
      connection,
      providerAccountId: pa.id,
      iban: pa.iban,
      name: pa.name ?? `${connection.institution_name}`,
      currency: pa.currency ?? "EUR",
    });
  }

  // Prefer real provider agreement expiry; never invent a 90-day extension.
  // Replaying a callback must not extend an already-stored consent window.
  const consentExpires =
    connection.consent_expires_at ??
    (await resolveConsentExpiresAt(provider, remote));

  const { data: activated, error: activateError } = await options.supabase
    .from("bank_connections")
    .update({
      status: "active",
      error_message: null,
      consent_expires_at: consentExpires,
    })
    .eq("id", connection.id)
    .eq("user_id", options.userId)
    .select("*")
    .single();

  if (activateError || !activated) {
    throw new Error("Impossibile attivare la connessione bancaria.");
  }

  connection = activated as BankConnectionRow;

  const result = await syncConnection({
    supabase: options.supabase,
    userId: options.userId,
    connectionId: connection.id,
  });

  return { connection, synced: result.errors.length === 0 };
}

/** Derive consent_expires_at from provider agreement data only. */
export async function resolveConsentExpiresAt(
  provider: { getAgreement?(agreementId: string): Promise<{ acceptedAt: string | null; accessValidForDays: number | null; createdAt: string | null } | null> },
  remote: { agreement?: string | null }
): Promise<string | null> {
  const agreementId = remote.agreement ?? null;
  if (!agreementId || !provider.getAgreement) return null;
  try {
    const agreement = await provider.getAgreement(agreementId);
    if (!agreement?.accessValidForDays || agreement.accessValidForDays <= 0) {
      return null;
    }
    const startIso = agreement.acceptedAt || agreement.createdAt;
    if (!startIso) return null;
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) return null;
    start.setUTCDate(start.getUTCDate() + agreement.accessValidForDays);
    return start.toISOString();
  } catch {
    return null;
  }
}

/**
 * Resolve connection from callback identifiers:
 * - Enable Banking `state` / our `reference` → metadata.reference
 * - GoCardless `ref` → metadata.reference
 * - bank_connections.id (UUID)
 * - provider_connection_id (requisition id / authorization id / session id)
 */
async function findConnection(
  supabase: SupabaseClient,
  userId: string,
  keys: { id?: string | null; providerConnectionId?: string | null }
): Promise<BankConnectionRow | null> {
  // state / reference (Enable Banking + GoCardless)
  if (keys.id) {
    const { data, error } = await supabase
      .from("bank_connections").select("*")
      .eq("user_id", userId).eq("metadata->>reference", keys.id).maybeSingle();
    if (error) throw new Error("Impossibile verificare la connessione bancaria.");
    if (data) return data as BankConnectionRow;
  }
  if (keys.id && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(keys.id)) {
    const { data, error } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("id", keys.id)
      .maybeSingle();
    if (error) throw new Error("Impossibile verificare la connessione bancaria.");
    if (data) return data as BankConnectionRow;
  }

  if (keys.providerConnectionId) {
    const { data, error } = await supabase
      .from("bank_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("provider_connection_id", keys.providerConnectionId)
      .maybeSingle();
    if (error) throw new Error("Impossibile verificare la connessione bancaria.");
    if (data) return data as BankConnectionRow;
  }

  // Missing or unknown callback identifiers must not select another connection.
  return null;
}

async function upsertBankAccountAndMoneyFlowAccount(options: {
  supabase: SupabaseClient;
  userId: string;
  connection: BankConnectionRow;
  providerAccountId: string;
  iban?: string | null;
  name: string;
  currency: string;
}): Promise<BankAccountRow> {
  const { supabase, userId, connection } = options;
  const ibanMasked = maskIban(options.iban);
  const accountName = options.name || connection.institution_name;
  const currency = options.currency || "EUR";

  // Already linked on this connection (same provider account uid).
  const { data: existing } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("connection_id", connection.id)
    .eq("provider_account_id", options.providerAccountId)
    .maybeSingle();

  if (existing) {
    return existing as BankAccountRow;
  }

  // Reuse MoneyFlow account when the same real bank account was linked before
  // (Enable Banking assigns a new account uid per session; match by IBAN mask
  // and/or prior provider_account_id so "Collega banca" does not duplicate Conti).
  let mfAccountId = await findReusableMoneyFlowAccountId({
    supabase,
    userId,
    providerAccountId: options.providerAccountId,
    ibanMasked,
  });

  if (mfAccountId) {
    const { error: reviveError } = await supabase
      .from("accounts")
      .update({
        is_archived: false,
        name: accountName,
        currency,
      })
      .eq("id", mfAccountId)
      .eq("user_id", userId);
    if (reviveError) {
      throw new Error("Impossibile aggiornare il conto MoneyFlow esistente.");
    }
  } else {
    const { data: mfAccount, error: accountError } = await supabase
      .from("accounts")
      .insert({
        user_id: userId,
        name: accountName,
        type: "bank",
        currency,
        balance: 0,
        icon: "landmark",
        color: "#0d9488",
      })
      .select("id")
      .single();

    if (accountError || !mfAccount) {
      throw new Error("Impossibile creare il conto MoneyFlow.");
    }
    mfAccountId = mfAccount.id as string;
  }

  const { data: bankAccount, error: baError } = await supabase
    .from("bank_accounts")
    .insert({
      user_id: userId,
      connection_id: connection.id,
      account_id: mfAccountId,
      provider_account_id: options.providerAccountId,
      iban_masked: ibanMasked,
      name: accountName,
      currency,
    })
    .select("*")
    .single();

  if (baError || !bankAccount) {
    throw new Error("Impossibile salvare il conto bancario.");
  }

  return bankAccount as BankAccountRow;
}

/**
 * Find an existing MoneyFlow account for the same physical bank account.
 * Prefer IBAN mask (stable across Enable Banking sessions); fall back to
 * provider_account_id when the ASPSP reuses the same uid.
 */
async function findReusableMoneyFlowAccountId(options: {
  supabase: SupabaseClient;
  userId: string;
  providerAccountId: string;
  ibanMasked: string | null;
}): Promise<string | null> {
  const { supabase, userId, providerAccountId, ibanMasked } = options;

  if (ibanMasked) {
    const { data: byIban } = await supabase
      .from("bank_accounts")
      .select("account_id")
      .eq("user_id", userId)
      .eq("iban_masked", ibanMasked)
      .not("account_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    const ibanHit = (byIban ?? []).find((r) => r.account_id);
    if (ibanHit?.account_id) return ibanHit.account_id as string;
  }

  const { data: byProvider } = await supabase
    .from("bank_accounts")
    .select("account_id")
    .eq("user_id", userId)
    .eq("provider_account_id", providerAccountId)
    .not("account_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (byProvider?.account_id as string | null | undefined) ?? null;
}

export async function syncConnection(options: {
  supabase: SupabaseClient;
  userId: string;
  connectionId: string;
}): Promise<SyncResult> {
  const { supabase, userId, connectionId } = options;

  const { data: connection, error } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .single();

  if (error || !connection) {
    throw new Error("Connessione non trovata o non autorizzata.");
  }

  const conn = connection as BankConnectionRow;

  if (conn.status !== "active") {
    throw new OpenBankingHttpError("La connessione non è attiva. Completa o rinnova il collegamento.", 409);
  }

  if (
    conn.consent_expires_at &&
    new Date(conn.consent_expires_at).getTime() < Date.now()
  ) {
    const { error: expireError } = await supabase
      .from("bank_connections")
      .update({ status: "expired" })
      .eq("id", conn.id)
      .eq("user_id", userId);
    if (expireError) {
      throw new Error("Impossibile aggiornare il consenso scaduto.");
    }
    throw new Error(
      `Il consenso Open Banking di ${conn.institution_name} è scaduto. Ricollega il conto.`
    );
  }

  const provider = getOpenBankingProvider(conn.provider);
  const { data: bankAccounts, error: bankAccountsError } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("connection_id", conn.id)
    .eq("user_id", userId);

  if (bankAccountsError || !bankAccounts?.length) {
    throw new Error("Nessun conto bancario disponibile per la sincronizzazione.");
  }
  const result: SyncResult = {
    connectionId: conn.id,
    imported: 0,
    skipped: 0,
    updated: 0,
    transferSuggestions: [],
    errors: [],
  };

  const allSuggestions: InternalTransferSuggestion[] = [];

  for (const ba of (bankAccounts ?? []) as BankAccountRow[]) {
    try {
      const balances = await provider.getBalances(ba.provider_account_id);
      const preferred =
        balances.find((b) => /interim|expected|closing/i.test(b.type ?? "")) ??
        balances[0];
      if (preferred && ba.account_id) {
        const { error: balanceError } = await supabase
          .from("accounts")
          .update({ balance: preferred.amount })
          .eq("id", ba.account_id)
          .eq("user_id", userId);
        if (balanceError) {
          result.errors.push("Impossibile aggiornare il saldo del conto.");
        }
        const { error: bankBalanceError } = await supabase
          .from("bank_accounts")
          .update({
            balance: preferred.amount,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", ba.id)
          .eq("user_id", userId);
        if (bankBalanceError) {
          result.errors.push("Impossibile aggiornare il saldo bancario.");
        }
      }

      const dateFrom = resolveSyncDateFrom(ba.last_synced_at, conn.last_synced_at, {
        forceFullWindow: Boolean(conn.error_message),
      });
      const dateFromIso = dateFrom.toISOString().slice(0, 10);

      let txs;
      try {
        txs = await provider.getTransactions({
          accountId: ba.provider_account_id,
          dateFrom: dateFromIso,
        });
      } catch (err) {
        if (
          err &&
          typeof err === "object" &&
          "name" in err &&
          (err as { name: string }).name === "IncompleteTransactionsError" &&
          "transactions" in err
        ) {
          const incomplete = err as IncompleteTransactionsError;
          txs = incomplete.transactions;
          result.errors.push(incomplete.message);
        } else {
          throw err;
        }
      }

      const normalized = normalizeProviderTransactions(txs, {
        provider: conn.provider,
        accountKey: ba.provider_account_id,
      });

      const { data: existingRows, error: existingError } = await supabase
        .from("transactions")
        .select(
          "id, provider, provider_transaction_id, fingerprint, category_id, description, merchant, notes, manual_override_fields"
        )
        .eq("user_id", userId)
        .eq("bank_account_id", ba.id);

      if (existingError) throw new Error("Impossibile verificare i movimenti esistenti.");

      const { byProviderId, byFingerprint } = buildDedupIndexes(
        (existingRows ?? []) as Parameters<typeof buildDedupIndexes>[0]
      );

      const newlyInsertedIds: string[] = [];

      for (const n of normalized) {
        const decision = decideDedup(n, byProviderId, byFingerprint);
        if (decision.action === "skip") {
          result.skipped += 1;
          continue;
        }
        if (decision.action === "update") {
          const { error: updateError } = await supabase
            .from("transactions")
            .update({
              ...decision.fields,
              updated_at: new Date().toISOString(),
            })
            .eq("id", decision.existingId)
            .eq("user_id", userId);
          if (updateError) {
            result.errors.push("Impossibile aggiornare un movimento bancario.");
            continue;
          }
          result.updated += 1;
          continue;
        }

        if (!ba.account_id) {
          result.errors.push("Conto MoneyFlow mancante per un conto bancario.");
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from("transactions")
          .insert({
            user_id: userId,
            account_id: ba.account_id,
            bank_account_id: ba.id,
            type: n.type,
            amount: n.amount,
            description: n.description,
            merchant: n.merchant,
            notes: n.notes,
            date: n.date,
            source: "bank",
            provider: n.provider,
            provider_transaction_id: n.providerTransactionId,
            fingerprint: n.fingerprint,
            category_id: null,
          })
          .select("id")
          .single();

        if (insertError) {
          if (insertError.code === "23505") result.skipped += 1;
          else result.errors.push("Impossibile salvare un movimento bancario.");
          continue;
        }
        if (inserted) {
          newlyInsertedIds.push(inserted.id);
          result.imported += 1;
          // Keep indexes fresh within the loop
          const stub = {
            id: inserted.id,
            provider: n.provider,
            provider_transaction_id: n.providerTransactionId,
            fingerprint: n.fingerprint,
            category_id: null,
            description: n.description,
            merchant: n.merchant,
            notes: n.notes,
            manual_override_fields: [],
          };
          if (n.providerTransactionId) {
            byProviderId.set(n.providerTransactionId, stub);
          }
          byFingerprint.set(n.fingerprint, stub);
        }
      }

      // Internal transfer suggestions across user's recent bank txs
      const { data: recent } = await supabase
        .from("transactions")
        .select("id, amount, date, type, account_id")
        .eq("user_id", userId)
        .eq("source", "bank")
        .gte(
          "date",
          new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10)
        );

      const suggestions = detectInternalTransfers(
        (recent ?? []).map((r) => ({
          id: r.id as string,
          amount: Number(r.amount),
          currency: ba.currency || "EUR",
          date: r.date as string,
          type: r.type as "income" | "expense" | "transfer",
          account_id: r.account_id as string,
        }))
      );

      for (const s of suggestions) {
        // Store as suggestion only — do not flip type to transfer
        await supabase
          .from("transactions")
          .update({ possible_transfer_match_id: s.matchedTransactionId })
          .eq("id", s.transactionId)
          .eq("user_id", userId);
        await supabase
          .from("transactions")
          .update({ possible_transfer_match_id: s.transactionId })
          .eq("id", s.matchedTransactionId)
          .eq("user_id", userId);
      }
      allSuggestions.push(...suggestions);
      void newlyInsertedIds;
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        ((err as { name: string }).name === "TimeoutError" ||
          (err as { name: string }).name === "AbortError")
      ) {
        result.errors.push("Timeout del provider bancario. Riprova più tardi.");
      } else if (
        err &&
        typeof err === "object" &&
        "name" in err &&
        ((err as { name: string }).name === "GoCardlessApiError" ||
          (err as { name: string }).name === "OpenBankingProviderError")
      ) {
        result.errors.push(
          (err as Error).message ||
            "Il provider bancario non è disponibile al momento."
        );
      } else if (err instanceof Error && err.message) {
        result.errors.push(err.message);
      } else {
        result.errors.push("Errore sincronizzando un conto. Riprova più tardi.");
      }
    }
  }

  const { error: syncMetaError } = await supabase
    .from("bank_connections")
    .update({
      // Persist progress even on soft/partial errors so the UI and incremental
      // window move forward; keep the first warning for the user.
      last_synced_at:
        result.imported > 0 || result.updated > 0 || result.errors.length === 0
          ? new Date().toISOString()
          : conn.last_synced_at,
      status: conn.status,
      error_message: result.errors.length ? result.errors[0] : null,
    })
    .eq("id", conn.id)
    .eq("user_id", userId);

  if (syncMetaError) {
    result.errors.push("Impossibile salvare lo stato di sincronizzazione.");
  }

  result.transferSuggestions = allSuggestions;
  return result;
}

/** Prefer incremental window after a clean sync; always overlap ~14 days. */
export function resolveSyncDateFrom(
  accountLastSyncedAt: string | null | undefined,
  connectionLastSyncedAt: string | null | undefined,
  options?: { forceFullWindow?: boolean }
): Date {
  const now = Date.now();
  const floor = new Date(now);
  floor.setDate(floor.getDate() - 90);

  if (options?.forceFullWindow) return floor;

  const anchorIso = accountLastSyncedAt || connectionLastSyncedAt;
  if (!anchorIso) return floor;

  const incremental = new Date(anchorIso);
  if (Number.isNaN(incremental.getTime())) return floor;
  incremental.setDate(incremental.getDate() - 14);
  return incremental.getTime() > floor.getTime() ? incremental : floor;
}

export async function listUserBankConnections(options: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<
  Array<
    BankConnectionRow & {
      bank_accounts: BankAccountRow[];
      consent_expired: boolean;
      consent_message: string | null;
    }
  >
> {
  const { data, error } = await options.supabase
    .from("bank_connections")
    .select("*, bank_accounts(*)")
    .eq("user_id", options.userId)
    .neq("status", "disconnected")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Impossibile caricare le connessioni bancarie.");
  }

  return ((data ?? []) as Array<BankConnectionRow & { bank_accounts: BankAccountRow[] }>).map(
    (c) => {
      const consent_expired =
        c.status === "expired" ||
        (!!c.consent_expires_at &&
          new Date(c.consent_expires_at).getTime() < Date.now());
      const consent_message = consent_expired
        ? /intesa/i.test(c.institution_name)
          ? "Il consenso Open Banking di Intesa Sanpaolo è scaduto. Ricollega il conto per continuare la sincronizzazione."
          : `Il consenso Open Banking di ${c.institution_name} è scaduto. Ricollega il conto.`
        : null;
      return { ...c, consent_expired, consent_message };
    }
  );
}

export async function disconnectConnection(options: {
  supabase: SupabaseClient;
  userId: string;
  connectionId: string;
}): Promise<void> {
  const { supabase, userId, connectionId } = options;

  const { data: connection, error } = await supabase
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .single();

  if (error || !connection) {
    throw new Error("Connessione non trovata o non autorizzata.");
  }

  const conn = connection as BankConnectionRow;
  const provider = getOpenBankingProvider(conn.provider);

  try {
    await provider.deleteConnection?.(conn.provider_connection_id);
  } catch {
    // Local disconnect still proceeds
  }

  const { error: disconnectError } = await supabase
    .from("bank_connections")
    .update({ status: "disconnected", error_message: null })
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (disconnectError) {
    throw new Error("Impossibile disconnettere la connessione bancaria.");
  }

  // Soft-archive MoneyFlow accounts that were only linked via this connection
  // (do not touch accounts still used by another active/pending connection).
  const { data: linked } = await supabase
    .from("bank_accounts")
    .select("account_id")
    .eq("connection_id", connectionId)
    .eq("user_id", userId)
    .not("account_id", "is", null);

  for (const row of linked ?? []) {
    const accountId = row.account_id as string;
    const { data: otherLinks } = await supabase
      .from("bank_accounts")
      .select("connection_id")
      .eq("user_id", userId)
      .eq("account_id", accountId)
      .neq("connection_id", connectionId);

    let hasOtherLive = false;
    for (const link of otherLinks ?? []) {
      const { data: otherConn } = await supabase
        .from("bank_connections")
        .select("status")
        .eq("id", link.connection_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (otherConn && otherConn.status !== "disconnected") {
        hasOtherLive = true;
        break;
      }
    }

    if (!hasOtherLive) {
      await supabase
        .from("accounts")
        .update({ is_archived: true })
        .eq("id", accountId)
        .eq("user_id", userId);
    }
  }
}

/**
 * Confirm a suggested internal transfer pair (user action).
 * Until confirmed, type stays income/expense.
 */
export async function confirmInternalTransfer(options: {
  supabase: SupabaseClient;
  userId: string;
  transactionId: string;
  matchedTransactionId: string;
}): Promise<void> {
  const { supabase, userId, transactionId, matchedTransactionId } = options;

  const { data: rows } = await supabase
    .from("transactions")
    .select("id, account_id, type, amount")
    .eq("user_id", userId)
    .in("id", [transactionId, matchedTransactionId]);

  if (!rows || rows.length !== 2) {
    throw new Error("Transazioni non trovate.");
  }

  const [a, b] = rows;
  const pairId = crypto.randomUUID();

  await supabase
    .from("transactions")
    .update({
      type: "transfer",
      transfer_pair_id: pairId,
      transfer_account_id: b.account_id,
      possible_transfer_match_id: null,
      excluded_from_budget: true,
    })
    .eq("id", a.id)
    .eq("user_id", userId);

  await supabase
    .from("transactions")
    .update({
      type: "transfer",
      transfer_pair_id: pairId,
      transfer_account_id: a.account_id,
      possible_transfer_match_id: null,
      excluded_from_budget: true,
    })
    .eq("id", b.id)
    .eq("user_id", userId);
}
