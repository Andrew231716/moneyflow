import type {
  CreateConnectionParams,
  GetTransactionsParams,
  Institution,
  ProviderAccount,
  ProviderBalance,
  ProviderConnection,
  ProviderTransaction,
} from "./types";

/**
 * Provider-agnostic Open Banking interface (AIS / read-only).
 * App code must depend ONLY on this — never on GoCardless types directly.
 */
export interface OpenBankingProvider {
  readonly id: string;

  getInstitutions(country: string): Promise<Institution[]>;

  createConnection(params: CreateConnectionParams): Promise<ProviderConnection>;

  getConnection(connectionId: string): Promise<ProviderConnection>;

  getAccounts(connectionId: string): Promise<ProviderAccount[]>;

  getAccountDetails(accountId: string): Promise<ProviderAccount>;

  getBalances(accountId: string): Promise<ProviderBalance[]>;

  getTransactions(params: GetTransactionsParams): Promise<ProviderTransaction[]>;

  /** Optional: revoke / delete connection at provider. */
  deleteConnection?(connectionId: string): Promise<void>;
}
