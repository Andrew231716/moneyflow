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

export async function adjustAccountBalance(
  accountId: string,
  delta: number
) {
  const supabase = createClient();
  const { data } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();
  if (!data) return;
  await supabase
    .from("accounts")
    .update({ balance: Number(data.balance) + delta })
    .eq("id", accountId);
}

export function balanceDeltaForTx(
  type: Transaction["type"],
  amount: number,
  side: "from" | "to" = "from"
): number {
  if (type === "income") return amount;
  if (type === "expense") return -amount;
  // transfer: from account decreases, to increases
  return side === "from" ? -amount : amount;
}
