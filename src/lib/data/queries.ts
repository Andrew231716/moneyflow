import { createClient } from "@/lib/supabase/server";
import type {
  Account,
  Budget,
  Category,
  ClassificationRule,
  Debt,
  Goal,
  RecurringTransaction,
  Transaction,
} from "@/types/database";
import { startOfMonth, subMonths, format } from "date-fns";

export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function fetchAccounts(includeArchived = false): Promise<Account[]> {
  const supabase = await createClient();
  let q = supabase.from("accounts").select("*").order("name");
  if (!includeArchived) q = q.eq("is_archived", false);
  const { data } = await q;
  return (data as Account[]) ?? [];
}

export async function fetchCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("type")
    .order("name");
  return (data as Category[]) ?? [];
}

/**
 * Load transactions for Home / Movimenti / stats.
 *
 * Important: do NOT embed `account:accounts(*)` here. `transactions` has two FKs
 * to `accounts` (`account_id` and `transfer_account_id`). PostgREST returns
 * PGRST201 (ambiguous relationship) and supabase-js yields `data: null` — which
 * previously rendered Home + Movimenti as all zeros even after a successful bank sync.
 * We load accounts in a second query and attach them in memory instead.
 */
export async function fetchTransactions(monthsBack = 12): Promise<Transaction[]> {
  const supabase = await createClient();
  const from = format(startOfMonth(subMonths(new Date(), monthsBack)), "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("transactions")
    .select("*, category:categories(*)")
    .gte("date", from)
    .order("date", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("fetchTransactions", error.message);
    throw new Error("Impossibile caricare i movimenti.");
  }

  const rows = (data as Transaction[]) ?? [];
  if (rows.length === 0) return rows;

  const accountIds = Array.from(
    new Set(rows.map((t) => t.account_id).filter((id): id is string => Boolean(id)))
  );
  if (accountIds.length === 0) return rows;

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("*")
    .in("id", accountIds);

  if (accountsError) {
    // Rows still render without account names — better than empty Home/Movimenti.
    console.error("fetchTransactions accounts", accountsError.message);
    return rows;
  }

  const byId = new Map(
    ((accounts as Account[]) ?? []).map((a) => [a.id, a] as const)
  );
  return rows.map((t) => ({
    ...t,
    account: byId.get(t.account_id) ?? t.account ?? null,
  }));
}

export async function fetchBudgets(month?: Date): Promise<Budget[]> {
  const supabase = await createClient();
  const m = format(startOfMonth(month ?? new Date()), "yyyy-MM-dd");
  const { data } = await supabase
    .from("budgets")
    .select("*, category:categories(*)")
    .eq("month", m);
  return (data as Budget[]) ?? [];
}

export async function fetchGoals(): Promise<Goal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Goal[]) ?? [];
}

export async function fetchDebts(): Promise<Debt[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("debts")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Debt[]) ?? [];
}

export async function fetchRecurring(): Promise<RecurringTransaction[]> {
  const supabase = await createClient();
  // Avoid ambiguous accounts(*) embed — attach account names via second query.
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*, category:categories(*)")
    .order("next_due_date");
  if (error) {
    console.error("fetchRecurring", error.message);
    return [];
  }
  const rows = (data as RecurringTransaction[]) ?? [];
  if (rows.length === 0) return rows;

  const accountIds = Array.from(
    new Set(rows.map((r) => r.account_id).filter((id): id is string => Boolean(id)))
  );
  if (accountIds.length === 0) return rows;

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .in("id", accountIds);
  const byId = new Map(
    ((accounts as Account[]) ?? []).map((a) => [a.id, a] as const)
  );
  return rows.map((r) => ({
    ...r,
    account: byId.get(r.account_id) ?? r.account ?? null,
  }));
}

export async function fetchRules(): Promise<ClassificationRule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classification_rules")
    .select("*, category:categories(*)")
    .order("priority", { ascending: false });
  return (data as ClassificationRule[]) ?? [];
}
