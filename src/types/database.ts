export type AccountType = "bank" | "card" | "cash" | "savings";
export type CategoryType = "income" | "expense";
export type TransactionType = "income" | "expense" | "transfer";
export type TransactionSource = "manual" | "csv" | "bank" | "assistant";
export type CategorySource =
  | "manual"
  | "rule"
  | "csv"
  | "bank"
  | "assistant"
  | "system";
export type GoalStatus = "active" | "completed" | "cancelled";
export type RecurringFrequency =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "yearly";
export type MatchType = "contains" | "starts_with" | "exact" | "regex";
export type AssistantActionStatus =
  | "pending"
  | "confirmed"
  | "undone"
  | "cancelled";
export type BudgetProgressState = "ok" | "warn" | "critical" | "over";

/** Fields protected from Open Banking sync overwrites (migration 002). */
export type ManualOverrideField =
  | "category_id"
  | "description"
  | "merchant"
  | "notes";

export type BankConnectionStatus =
  | "pending"
  | "active"
  | "expired"
  | "rejected"
  | "suspended"
  | "error"
  | "disconnected";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  currency: string;
  locale: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  color: string;
  icon: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parent_id: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  type: TransactionType;
  amount: number;
  description: string;
  notes: string | null;
  date: string;
  source: TransactionSource;
  transfer_pair_id: string | null;
  transfer_account_id: string | null;
  excluded_from_budget: boolean;
  /** AIS: pending = non contabilizzato; booked / null = contabilizzato */
  booking_status?: "booked" | "pending" | null;
  original_description: string | null;
  original_merchant: string | null;
  category_source: CategorySource;
  provider: string | null;
  provider_transaction_id: string | null;
  bank_account_id: string | null;
  raw_data: Record<string, unknown> | null;
  manual_description_override: boolean;
  manual_category_override: boolean;
  /** OB: SHA-256 dedup fingerprint */
  fingerprint: string | null;
  /** OB: merchant name from bank feed */
  merchant: string | null;
  /** OB: suggested counterpart for internal transfer (confirm via API) */
  possible_transfer_match_id: string | null;
  /** OB: fields the user edited — sync must not overwrite these */
  manual_override_fields: ManualOverrideField[] | string[];
  created_at: string;
  updated_at: string;
  category?: Category | null;
  account?: Account | null;
}

export interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
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

export interface BankAccount {
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

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  month: string;
  created_at: string;
  updated_at: string;
  category?: Category | null;
}

export interface Goal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  account_id: string | null;
  color: string;
  icon: string;
  status: GoalStatus;
  /** True when earmarked funds were spent/used (saldato) — no longer in available pool. */
  settled: boolean;
  settled_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Manual liability — not part of disponibilità; shown separately as Debiti da saldare. */
export interface Debt {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  notes: string | null;
  /** null = ancora da saldare */
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  type: Exclude<TransactionType, "transfer">;
  amount: number;
  description: string;
  frequency: RecurringFrequency;
  next_due_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: Category | null;
  account?: Account | null;
}

export interface ClassificationRule {
  id: string;
  user_id: string;
  pattern: string;
  match_type: MatchType;
  category_id: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  category?: Category | null;
}

export interface AssistantAction {
  id: string;
  user_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  status: AssistantActionStatus;
  created_at: string;
  undone_at: string | null;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
}

export interface MonthSummary {
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
}

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  remaining: number;
  percent: number;
  state: BudgetProgressState;
}

export interface Insight {
  id: string;
  type: "info" | "warning" | "success";
  title: string;
  message: string;
}
