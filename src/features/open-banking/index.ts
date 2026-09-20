export type {
  Institution,
  BankConnectionRow,
  BankAccountRow,
  SyncResult,
  InternalTransferSuggestion,
  NormalizedBankTransaction,
  OpenBankingProviderId,
  BankConnectionStatus,
  ManualOverrideField,
} from "./types";

export type { OpenBankingProvider } from "./provider";
export {
  getOpenBankingProvider,
  resolveDefaultProviderId,
} from "./factory";
export {
  listInstitutions,
  startBankConnection,
  handleConnectionCallback,
  syncConnection,
  listUserBankConnections,
  disconnectConnection,
  confirmInternalTransfer,
} from "./service";
export {
  normalizeInstitutionName,
  isIntesaSanpaolo,
  prioritizeInstitutions,
  findIntesaSanpaolo,
} from "./institutions";
export {
  computeTransactionFingerprint,
  normalizeProviderTransaction,
  normalizeProviderTransactions,
} from "./normalizer";
export {
  decideDedup,
  mergeWithManualOverrides,
  buildDedupIndexes,
  addManualOverrides,
} from "./deduplication";
export { detectInternalTransfers } from "./internal-transfer-detector";
export { consentExpiredMessage, maskIban } from "./auth";
export {
  BankConnectionsPanel,
  ConnectBankLink,
} from "./components/bank-connections-panel";