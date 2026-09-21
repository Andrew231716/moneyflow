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

export async function fetchTransactions(monthsBack = 12): Promise<Transaction[]> {
  const supabase = await createClient();
  const from = format(startOfMonth(subMonths(new Date(), monthsBack)), "yyyy-MM-dd");
  // Disambiguate accounts embed: transactions has both account_id and transfer_account_id FKs.
  // Prefer column hint (`accounts!account_id`) — more stable than constraint name across envs.
  const selectWithAccount =
    "*, category:categories(*), account:accounts!account_id(*)";
  const selectPlain = "*, category:categories(*)";

  const primary = await supabase
    .from("transactions")
    .select(selectWithAccount)
    .gte("date", from)
    .order("date", { ascending: false })
    .limit(2000);

  if (!primary.error) {
    return (primary.data as Transaction[]) ?? [];
  }

  console.error("fetchTransactions embed failed:", primary.error.message);

  const fallback = await supabase
    .from("transactions")
    .select(selectPlain)
    .gte("date", from)
    .order("date", { ascending: false })
    .limit(2000);

  if (fallback.error) {
    console.error("fetchTransactions", fallback.error.message);
    throw new Error("Impossibile caricare i movimenti.");
  }

  return (fallback.data as Transaction[]) ?? [];
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
  const { data, error } = await supabase
    .from("recurring_transactions")
    .select("*, category:categories(*), account:accounts!recurring_transactions_account_id_fkey(*)")
    .order("next_due_date");
  if (error) {
    // Fallback without embed if FK name differs across environments
    const { data: plain } = await supabase
      .from("recurring_transactions")
      .select("*, category:categories(*)")
      .order("next_due_date");
    if (!plain) {
      console.error("fetchRecurring", error.message);
      return [];
    }
    return (plain as RecurringTransaction[]) ?? [];
  }
  return (data as RecurringTransaction[]) ?? [];
}

export async function fetchRules(): Promise<ClassificationRule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("classification_rules")
    .select("*, category:categories(*)")
    .order("priority", { ascending: false });
  return (data as ClassificationRule[]) ?? [];
}
