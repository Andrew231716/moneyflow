"use client";

import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/types/database";

export async function writeAudit(params: {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  before_data?: Record<string, unknown> | null;
  after_data?: Record<string, unknown> | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("audit_log").insert({
    user_id: user.id,
    entity_type: params.entity_type,
    entity_id: params.entity_id ?? null,
    action: params.action,
    before_data: params.before_data ?? null,
    after_data: params.after_data ?? null,
  });
}

/**
 * Prefer the atomic Postgres RPC (migration 007). Falls back to a guarded
 * read-modify-write if the function is not deployed yet.
 */
export async function adjustAccountBalance(
  accountId: string,
  delta: number
) {
  const supabase = createClient();
  const { error: rpcError } = await supabase.rpc("adjust_account_balance", {
    p_account_id: accountId,
    p_delta: delta,
  });

  if (!rpcError) return;

  const missingFn =
    rpcError.code === "PGRST202" ||
    /adjust_account_balance|Could not find the function/i.test(rpcError.message);

  if (!missingFn) {
    throw new Error(rpcError.message || "Impossibile aggiornare il saldo del conto.");
  }

  const { data, error } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();
  if (error) throw new Error(error.message || "Impossibile leggere il saldo del conto.");
  if (!data) throw new Error("Conto non trovato.");

  const { error: updateError } = await supabase
    .from("accounts")
    .update({ balance: Number(data.balance) + delta })
    .eq("id", accountId);
  if (updateError) {
    throw new Error(updateError.message || "Impossibile aggiornare il saldo del conto.");
  }
}

export function balanceDeltaForTx(
  type: Transaction["type"],
  amount: number,
  side: "from" | "to" = "from"
): number {
  if (type === "income") return amount;
  if (type === "expense") return -amount;
  return side === "from" ? -amount : amount;
}
