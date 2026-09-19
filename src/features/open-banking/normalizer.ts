import { createHash } from "node:crypto";
import type {
  NormalizedBankTransaction,
  OpenBankingProviderId,
  ProviderTransaction,
} from "./types";

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function pickDescription(tx: ProviderTransaction): string {
  const parts = [
    tx.description,
    tx.remittanceInformation,
    tx.merchantName,
    tx.creditorName,
    tx.debtorName,
  ]
    .map(cleanText)
    .filter(Boolean);
  return parts[0] || "Movimento bancario";
}

function pickMerchant(tx: ProviderTransaction): string | null {
  const merchant = cleanText(tx.merchantName ?? tx.creditorName ?? tx.debtorName);
  return merchant || null;
}

function pickDate(tx: ProviderTransaction): string {
  const raw = tx.bookingDate || tx.valueDate;
  if (!raw) {
    return new Date().toISOString().slice(0, 10);
  }
  return raw.slice(0, 10);
}

/**
 * SHA-256 fingerprint for dedup when provider_transaction_id is missing.
 * Stable across syncs for the same economic event.
 */
export function computeTransactionFingerprint(input: {
  accountKey: string;
  date: string;
  amount: number;
  currency: string;
  description: string;
  merchant?: string | null;
}): string {
  const payload = [
    input.accountKey,
    input.date,
    Math.abs(input.amount).toFixed(2),
    input.currency.toUpperCase(),
    cleanText(input.description).toLowerCase(),
    cleanText(input.merchant).toLowerCase(),
  ].join("|");

  return createHash("sha256").update(payload).digest("hex");
}

export function normalizeProviderTransaction(
  tx: ProviderTransaction,
  options: {
    provider: OpenBankingProviderId;
    accountKey: string;
  }
): NormalizedBankTransaction {
  const amount = Number(tx.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Importo transazione non valido");
  }

  const absAmount = Math.abs(amount);
  const type = amount < 0 ? "expense" : "income";
  const date = pickDate(tx);
  const description = pickDescription(tx);
  const merchant = pickMerchant(tx);
  const currency = (tx.currency || "EUR").toUpperCase();

  const providerTransactionId = cleanText(tx.id) || null;
  const fingerprint = computeTransactionFingerprint({
    accountKey: options.accountKey,
    date,
    amount: absAmount,
    currency,
    description,
    merchant,
  });

  return {
    provider: options.provider,
    providerTransactionId,
    fingerprint,
    amount: absAmount,
    currency,
    type,
    date,
    description,
    merchant,
    notes: null,
    raw: tx.raw ?? {},
  };
}

export function normalizeProviderTransactions(
  txs: ProviderTransaction[],
  options: {
    provider: OpenBankingProviderId;
    accountKey: string;
  }
): NormalizedBankTransaction[] {
  const out: NormalizedBankTransaction[] = [];
  for (const tx of txs) {
    try {
      out.push(normalizeProviderTransaction(tx, options));
    } catch {
      // Skip malformed rows; sync continues
    }
  }
  return out;
}
