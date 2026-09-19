/**
 * Open Banking domain types — provider-agnostic.
 * READ-ONLY AIS only (no PISP / payments).
 */

export type OpenBankingProviderId =
  | "gocardless"
  | "tink"
  | "truelayer"
  | "yapily"
  | "saltedge";

export type BankConnectionStatus =
  | "pending"
  | "active"
  | "expired"
  | "rejected"
  | "suspended"
  | "error"
  | "disconnected";

export type ManualOverrideField =
  | "category_id"
  | "description"
  | "merchant"
  | "notes";

export interface Institution {
  id: string;
  name: string;
  bic?: string | null;
  logo?: string | null;
  countries: string[];
  transactionTotalDays?: number | null;
  /** True when name matches Intesa Sanpaolo aliases (dynamic, no hardcoded id). */
  isSuggested?: boolean;
}

export interface ProviderConnection {
  id: string;
  status: string;
  institutionId: string;
  link?: string | null;
  accounts: string[];
  reference?: string | null;
  agreement?: string | null;
  rawStatus?: string | null;
}

/** End-user agreement / consent metadata from the AIS provider when available. */
export interface ProviderAgreement {
  id: string;
  acceptedAt: string | null;
  accessValidForDays: number | null;
  createdAt: string | null;
}

export interface ProviderAccount {
  id: string;
  iban?: string | null;
  name?: string | null;
  currency?: string | null;
  ownerName?: string | null;
  product?: string | null;
}

export interface ProviderBalance {
  amount: number;
  currency: string;
  type?: string | null;
  referenceDate?: string | null;
}

export interface ProviderTransaction {
  /** Provider-native transaction id when available. */
  id?: string | null;
  bookingDate?: string | null;
  valueDate?: string | null;
  amount: number;
  currency: string;
  description?: string | null;
  merchantName?: string | null;
  remittanceInformation?: string | null;
  debtorName?: string | null;
  creditorName?: string | null;
  raw?: Record<string, unknown>;
}

export interface CreateConnectionParams {
  institutionId: string;
  redirectUrl: string;
  reference: string;
  userLanguage?: string;
}

export interface GetTransactionsParams {
  accountId: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Normalized MoneyFlow-ready transaction before persistence. */
export interface NormalizedBankTransaction {
  provider: OpenBankingProviderId;
  providerTransactionId: string | null;
  fingerprint: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
  date: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  raw: Record<string, unknown>;
}

export interface BankConnectionRow {
  id: string;
  user_id: string;
  provider: OpenBankingProviderId;
  provider_connection_id: string;
  institution_id: string;
  institution_name: string;
  institution_logo: string | null;
  status: BankConnectionStatus;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BankAccountRow {
  id: string;
  user_id: string;
  connection_id: string;
  account_id: string | null;
  provider_account_id: string;
  iban_masked: string | null;
  name: string | null;
  currency: string;
  balance: number | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InternalTransferSuggestion {
  transactionId: string;
  matchedTransactionId: string;
  amount: number;
  currency: string;
  dateA: string;
  dateB: string;
}

export interface SyncResult {
  connectionId: string;
  imported: number;
  skipped: number;
  updated: number;
  transferSuggestions: InternalTransferSuggestion[];
  errors: string[];
}
