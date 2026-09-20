"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Send, Sparkles } from "lucide-react";
import type {
  Account,
  Budget,
  Category,
  ClassificationRule,
  Goal,
  RecurringTransaction,
  Transaction,
} from "@/types/database";
import {
  ASSISTANT_EXAMPLES,
  HELP_MESSAGE,
  findAccount,
  findGoal,
  findSavingsAccount,
  parseAssistantCommand,
  runInsightsText,
  runQueryBalance,
  runQueryBudget,
  runQueryTransactions,
} from "@/features/assistant/parser";
import { ASSISTANT_LLM_ENABLED } from "@/features/assistant/llm";
import { classifyDescription } from "@/lib/finance/classification";
import {
  calcMonthSummary,
  forecastMonthEnd,
} from "@/lib/finance/engine";
import { createClient } from "@/lib/supabase/client";
import {
  adjustAccountBalance,
  balanceDeltaForTx,
  writeAudit,
} from "@/lib/data/mutations";
import { formatCurrency, toMonthStart } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type ChatRole = "user" | "assistant";

interface MoneyLine {
  label: string;
  amount: number;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  money?: MoneyLine[];
  pendingId?: string;
}

interface PendingAction {
  id: string;
  title: string;
  description: string;
  money?: MoneyLine[];
  execute: () => Promise<string>;
}

function nid() {
  return crypto.randomUUID();
}

export function AssistantPanel({
  accounts,
  categories,
  transactions,
  rules,
  recurring,
  goals,
  budgets,
}: {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  rules: ClassificationRule[];
  recurring: RecurringTransaction[];
  goals: Goal[];
  budgets: Budget[];
}) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nid(),
      role: "assistant",
      text: "Ciao — sono il Gestore finanziario locale di MoneyFlow. Scrivi in italiano: creo movimenti, gestisco salvadanaio e obiettivi, sincronizzo banche e rispondo su saldi/budget. Nessuna API a pagamento.",
    },
  ]);
  const [pending, setPending] = useState<PendingAction | null>(null);

  function pushAssistant(text: string, money?: MoneyLine[], pendingId?: string) {
    setMessages((m) => [
      ...m,
      { id: nid(), role: "assistant", text, money, pendingId },
    ]);
    requestAnimationFrame(() =>
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    );
  }

  function askConfirm(action: PendingAction) {
    setPending(action);
    pushAssistant(
      `Confermi?\n${action.title}: ${action.description}`,
      action.money,
      action.id
    );
  }

  async function handle(command: string) {
    const text = command.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { id: nid(), role: "user", text }]);
    setInput("");
    setPending(null);

    const intent = parseAssistantCommand(text);

    if (intent.type === "unknown" || intent.type === "help") {
      pushAssistant(intent.type === "help" ? HELP_MESSAGE : intent.payload.message);
      return;
    }

    if (intent.type === "query_transactions") {
      const result = runQueryTransactions(transactions, intent.payload);
      pushAssistant(result.summaryText, [
        { label: "Totale filtrato", amount: result.total },
      ]);
      return;
    }

    if (intent.type === "query_balance") {
      const result = runQueryBalance(accounts, intent.payload.accountHint);
      pushAssistant(result.summaryText, [
        { label: "Totale", amount: result.total },
        ...result.lines.slice(0, 6).map((l) => ({
          label: l.name,
          amount: l.amount,
        })),
      ]);
      return;
    }

    if (intent.type === "query_budget") {
      const result = runQueryBudget(
        budgets,
        transactions,
        categories,
        intent.payload.categoryHint
      );
      pushAssistant(result.summaryText);
      return;
    }

    if (intent.type === "query_insights") {
      pushAssistant(
        runInsightsText(transactions, recurring, budgets, goals)
      );
      return;
    }

    if (intent.type === "financial_projection") {
      const forecast = forecastMonthEnd(transactions, recurring);
      const summary = calcMonthSummary(transactions);
      pushAssistant(
        `Previsione fine mese: entrate ${formatCurrency(forecast.projectedIncome)}, uscite ${formatCurrency(forecast.projectedExpense)}, saldo ${formatCurrency(forecast.projectedSavings)}. Ora: risparmio mese ${formatCurrency(summary.savings)} (${summary.savingsRate.toFixed(0)}%).`,
        [
          { label: "Entrate previste", amount: forecast.projectedIncome },
          { label: "Uscite previste", amount: forecast.projectedExpense },
          { label: "Saldo previsto", amount: forecast.projectedSavings },
        ]
      );
      return;
    }

    if (intent.type === "sync_bank") {
      const hint = intent.payload.institutionHint.toLowerCase();
      askConfirm({
        id: nid(),
        title: "Sincronizza banca",
        description: hint && hint !== "banca"
          ? `Cerco connessione "${intent.payload.institutionHint}" e avvio sync.`
          : "Sincronizzo la prima connessione banca attiva.",
        execute: async () => {
          const listRes = await fetch("/api/open-banking/accounts");
          const listData = await listRes.json().catch(() => ({}));
          if (!listRes.ok) {
            throw new Error(listData.error ?? "Impossibile leggere le connessioni.");
          }
          const connections = (listData.connections ?? []) as {
            id: string;
            institution_name: string;
            status: string;
          }[];
          if (!connections.length) {
            throw new Error("Nessuna banca collegata. Vai su Conti per collegarne una.");
          }
          const match =
            connections.find((c) =>
              c.institution_name.toLowerCase().includes(hint)
            ) ||
            connections.find((c) => c.status === "active") ||
            connections[0];
          const res = await fetch("/api/open-banking/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ connection_id: match.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error ?? data.message ?? "Sync non riuscita.");
          }
          await writeAudit({
            entity_type: "bank_connection",
            entity_id: match.id,
            action: "assistant_sync",
            after_data: data,
          });
          return data.message ?? `Sync ${match.institution_name} completata.`;
        },
      });
      return;
    }

    if (intent.type === "create_transaction") {
      const p = intent.payload;
      if (!p.amount) {
        pushAssistant('Specifica un importo, es. "spesa 25 esselunga"');
        return;
      }
      const account =
        findAccount(accounts, p.accountHint) || accounts.find((a) => !a.is_archived);
      if (!account) {
        pushAssistant("Crea prima un conto.");
        return;
      }
      const cat =
        (p.categoryHint &&
          categories.find(
            (c) =>
              c.type === p.txType &&
              c.name.toLowerCase().includes(p.categoryHint!.toLowerCase())
          )) ||
        classifyDescription(p.description, rules, categories);
      const date = p.date || new Date().toISOString().slice(0, 10);
      askConfirm({
        id: nid(),
        title: "Crea movimento",
        description: `${p.txType === "expense" ? "Uscita" : "Entrata"} — ${p.description} (${date})`,
        money: [{ label: "Importo", amount: p.amount }],
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          const row = {
            user_id: user.id,
            account_id: account.id,
            category_id: cat && cat.type === p.txType ? cat.id : null,
            type: p.txType,
            amount: p.amount,
            description: p.description,
            date,
            source: "assistant" as const,
            category_source: cat ? ("assistant" as const) : ("system" as const),
          };
          const { data, error } = await supabase
            .from("transactions")
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          await adjustAccountBalance(
            account.id,
            balanceDeltaForTx(p.txType, p.amount)
          );
          await supabase.from("assistant_actions").insert({
            user_id: user.id,
            action_type: "create_transaction",
            payload: { transaction_id: data.id, ...row },
            status: "confirmed",
          });
          await writeAudit({
            entity_type: "transaction",
            entity_id: data.id,
            action: "assistant_create",
            after_data: data,
          });
          return `Movimento creato: ${formatCurrency(p.amount)} su ${account.name}.`;
        },
      });
      return;
    }

    if (intent.type === "deposit_savings" || intent.type === "withdraw_savings") {
      const amount = intent.payload.amount;
      if (!amount) {
        pushAssistant("Specifica l'importo per il salvadanaio.");
        return;
      }
      const isDeposit = intent.type === "deposit_savings";
      askConfirm({
        id: nid(),
        title: isDeposit ? "Versa nel salvadanaio" : "Preleva dal salvadanaio",
        description: isDeposit
          ? "Trasferisco dal conto principale al salvadanaio (o lo creo se manca)."
          : "Trasferisco dal salvadanaio al conto principale.",
        money: [{ label: "Importo", amount }],
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");

          let savings = findSavingsAccount(accounts);
          if (!savings && isDeposit) {
            const { data: created, error } = await supabase
              .from("accounts")
              .insert({
                user_id: user.id,
                name: "Salvadanaio",
                type: "savings",
                balance: 0,
                color: "#0d9488",
                icon: "piggy-bank",
              })
              .select()
              .single();
            if (error) throw error;
            savings = created as Account;
            await writeAudit({
              entity_type: "account",
              entity_id: savings.id,
              action: "assistant_create_savings",
              after_data: savings as unknown as Record<string, unknown>,
            });
          }
          if (!savings) throw new Error("Nessun salvadanaio trovato.");

          const main =
            findAccount(accounts, intent.payload.fromAccountHint) ||
            accounts.find((a) => !a.is_archived && a.type !== "savings" && a.id !== savings!.id);
          if (!main) throw new Error("Serve un conto principale per il trasferimento.");

          const from = isDeposit ? main : savings;
          const to = isDeposit ? savings : main;
          const pairId = crypto.randomUUID();
          const date = new Date().toISOString().slice(0, 10);
          const base = {
            user_id: user.id,
            type: "transfer" as const,
            amount,
            description: isDeposit
              ? "Versamento salvadanaio"
              : "Prelievo salvadanaio",
            date,
            source: "assistant" as const,
            category_source: "assistant" as const,
            transfer_pair_id: pairId,
            category_id: null,
          };
          const { data: outTx, error: e1 } = await supabase
            .from("transactions")
            .insert({
              ...base,
              account_id: from.id,
              transfer_account_id: to.id,
            })
            .select()
            .single();
          if (e1) throw e1;
          const { error: e2 } = await supabase.from("transactions").insert({
            ...base,
            account_id: to.id,
            transfer_account_id: from.id,
          });
          if (e2) throw e2;
          await adjustAccountBalance(from.id, -amount);
          await adjustAccountBalance(to.id, amount);
          await supabase.from("assistant_actions").insert({
            user_id: user.id,
            action_type: isDeposit ? "deposit_savings" : "withdraw_savings",
            payload: {
              amount,
              from: from.id,
              to: to.id,
              transaction_id: outTx.id,
            },
            status: "confirmed",
          });
          await writeAudit({
            entity_type: "transaction",
            entity_id: outTx.id,
            action: isDeposit ? "assistant_deposit_savings" : "assistant_withdraw_savings",
            after_data: { amount, from: from.id, to: to.id },
          });
          return `${isDeposit ? "Versati" : "Prelevati"} ${formatCurrency(amount)} ${isDeposit ? "nel" : "dal"} salvadanaio.`;
        },
      });
      return;
    }

    if (intent.type === "create_goal") {
      const p = intent.payload;
      askConfirm({
        id: nid(),
        title: "Crea obiettivo",
        description: `${p.name}${p.completed ? " (già raggiunto)" : ""}`,
        money: [
          { label: "Target", amount: p.targetAmount },
          { label: "Attuale", amount: p.currentAmount },
        ],
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          const savings = findSavingsAccount(accounts);
          const row = {
            user_id: user.id,
            name: p.name,
            target_amount: p.targetAmount,
            current_amount: p.currentAmount,
            status: p.completed ? ("completed" as const) : ("active" as const),
            account_id: savings?.id ?? null,
            color: "#0d9488",
            icon: "target",
          };
          const { data, error } = await supabase
            .from("goals")
            .insert(row)
            .select()
            .single();
          if (error) throw error;
          await supabase.from("assistant_actions").insert({
            user_id: user.id,
            action_type: "create_goal",
            payload: { goal_id: data.id, ...row },
            status: "confirmed",
          });
          await writeAudit({
            entity_type: "goal",
            entity_id: data.id,
            action: "assistant_create_goal",
            after_data: data,
          });
          return `Obiettivo "${p.name}" creato (${formatCurrency(p.currentAmount)} / ${formatCurrency(p.targetAmount)}).`;
        },
      });
      return;
    }

    if (intent.type === "update_goal") {
      const goal = findGoal(goals, intent.payload.nameHint);
      if (!goal) {
        pushAssistant(`Obiettivo "${intent.payload.nameHint}" non trovato.`);
        return;
      }
      const add = intent.payload.addAmount ?? 0;
      const next = Math.min(
        Number(goal.target_amount),
        (intent.payload.setCurrent ?? Number(goal.current_amount)) + add
      );
      const status = next >= Number(goal.target_amount) ? "completed" : goal.status;
      askConfirm({
        id: nid(),
        title: "Aggiorna obiettivo",
        description: `${goal.name}: ${formatCurrency(Number(goal.current_amount))} → ${formatCurrency(next)}`,
        money: [{ label: "Nuovo progresso", amount: next }],
        execute: async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("goals")
            .update({ current_amount: next, status })
            .eq("id", goal.id);
          if (error) throw error;
          await writeAudit({
            entity_type: "goal",
            entity_id: goal.id,
            action: "assistant_update_goal",
            before_data: goal as unknown as Record<string, unknown>,
            after_data: { current_amount: next, status },
          });
          return `Obiettivo "${goal.name}" aggiornato a ${formatCurrency(next)}.`;
        },
      });
      return;
    }

    if (intent.type === "complete_goal") {
      const goal = findGoal(goals, intent.payload.nameHint);
      if (!goal) {
        pushAssistant(`Obiettivo "${intent.payload.nameHint}" non trovato.`);
        return;
      }
      askConfirm({
        id: nid(),
        title: "Completa obiettivo",
        description: `Segna "${goal.name}" come raggiunto.`,
        money: [{ label: "Target", amount: Number(goal.target_amount) }],
        execute: async () => {
          const supabase = createClient();
          const { error } = await supabase
            .from("goals")
            .update({
              status: "completed",
              current_amount: Number(goal.target_amount),
            })
            .eq("id", goal.id);
          if (error) throw error;
          await writeAudit({
            entity_type: "goal",
            entity_id: goal.id,
            action: "assistant_complete_goal",
            after_data: { status: "completed" },
          });
          return `Obiettivo "${goal.name}" completato.`;
        },
      });
      return;
    }

    if (intent.type === "create_transfer") {
      const p = intent.payload;
      const from =
        findAccount(accounts, p.fromHint) ||
        accounts.find((a) => !a.is_archived && a.type !== "savings");
      const to =
        findAccount(accounts, p.toHint, p.toHint?.match(/salvadan|risparm/i) ? "savings" : undefined) ||
        accounts.find((a) => !a.is_archived && a.id !== from?.id);
      if (!from || !to || from.id === to.id) {
        pushAssistant("Indica conti validi, es. trasferisci 100 da Intesa a Salvadanaio.");
        return;
      }
      askConfirm({
        id: nid(),
        title: "Trasferimento",
        description: `${from.name} → ${to.name}`,
        money: [{ label: "Importo", amount: p.amount }],
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          const pairId = crypto.randomUUID();
          const date = new Date().toISOString().slice(0, 10);
          const base = {
            user_id: user.id,
            type: "transfer" as const,
            amount: p.amount,
            description: `Trasferimento ${from.name} → ${to.name}`,
            date,
            source: "assistant" as const,
            category_source: "assistant" as const,
            transfer_pair_id: pairId,
            category_id: null,
          };
          await supabase.from("transactions").insert([
            { ...base, account_id: from.id, transfer_account_id: to.id },
            { ...base, account_id: to.id, transfer_account_id: from.id },
          ]);
          await adjustAccountBalance(from.id, -p.amount);
          await adjustAccountBalance(to.id, p.amount);
          await writeAudit({
            entity_type: "transaction",
            action: "assistant_transfer",
            after_data: { amount: p.amount, from: from.id, to: to.id },
          });
          return `Trasferiti ${formatCurrency(p.amount)} da ${from.name} a ${to.name}.`;
        },
      });
      return;
    }

    if (intent.type === "create_budget") {
      const p = intent.payload;
      const cat = categories.find(
        (c) =>
          c.type === "expense" &&
          c.name.toLowerCase().includes(p.categoryHint.toLowerCase())
      );
      if (!cat) {
        pushAssistant(`Categoria "${p.categoryHint}" non trovata.`);
        return;
      }
      askConfirm({
        id: nid(),
        title: "Imposta budget",
        description: `${cat.name} per questo mese`,
        money: [{ label: "Budget", amount: p.amount }],
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          const month = toMonthStart(new Date());
          const { data, error } = await supabase
            .from("budgets")
            .upsert(
              {
                user_id: user.id,
                category_id: cat.id,
                amount: p.amount,
                month,
              },
              { onConflict: "user_id,category_id,month" }
            )
            .select()
            .single();
          if (error) throw error;
          await writeAudit({
            entity_type: "budget",
            entity_id: data.id,
            action: "assistant_upsert_budget",
            after_data: data,
          });
          return `Budget ${cat.name}: ${formatCurrency(p.amount)}/mese.`;
        },
      });
      return;
    }

    if (intent.type === "create_category") {
      const p = intent.payload;
      askConfirm({
        id: nid(),
        title: "Crea categoria",
        description: `${p.name} (${p.categoryType === "income" ? "entrata" : "uscita"})`,
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          const { data, error } = await supabase
            .from("categories")
            .insert({
              user_id: user.id,
              name: p.name,
              type: p.categoryType,
              icon: "tag",
              color: "#64748b",
            })
            .select()
            .single();
          if (error) throw error;
          await writeAudit({
            entity_type: "category",
            entity_id: data.id,
            action: "assistant_create_category",
            after_data: data,
          });
          return `Categoria "${p.name}" creata.`;
        },
      });
      return;
    }

    if (intent.type === "create_recurring") {
      const p = intent.payload;
      const account = accounts.find((a) => !a.is_archived);
      if (!account) {
        pushAssistant("Crea prima un conto.");
        return;
      }
      const cat =
        (p.categoryHint &&
          categories.find(
            (c) =>
              c.type === p.txType &&
              c.name.toLowerCase().includes(p.categoryHint!.toLowerCase())
          )) ||
        null;
      askConfirm({
        id: nid(),
        title: "Crea ricorrente",
        description: `${p.description} · ${p.frequency}`,
        money: [{ label: "Importo", amount: p.amount }],
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          const { data, error } = await supabase
            .from("recurring_transactions")
            .insert({
              user_id: user.id,
              account_id: account.id,
              category_id: cat?.id ?? null,
              type: p.txType,
              amount: p.amount,
              description: p.description,
              frequency: p.frequency,
              next_due_date: new Date().toISOString().slice(0, 10),
              is_active: true,
            })
            .select()
            .single();
          if (error) throw error;
          await writeAudit({
            entity_type: "recurring",
            entity_id: data.id,
            action: "assistant_create_recurring",
            after_data: data,
          });
          return `Ricorrente "${p.description}" creato.`;
        },
      });
      return;
    }

    if (intent.type === "bulk_categorize") {
      const { pattern, categoryName } = intent.payload;
      const cat = categories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (!cat) {
        pushAssistant(`Categoria "${categoryName}" non trovata.`);
        return;
      }
      const targets = transactions.filter(
        (t) =>
          t.type !== "transfer" &&
          !t.manual_category_override &&
          t.category_source !== "manual" &&
          (t.description || "").toLowerCase().includes(pattern.toLowerCase())
      );
      askConfirm({
        id: nid(),
        title: "Categorizzazione massiva",
        description: `${targets.length} movimenti con "${pattern}" → ${cat.name}`,
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          const ids = targets.map((t) => t.id);
          if (ids.length) {
            const { error } = await supabase
              .from("transactions")
              .update({
                category_id: cat.id,
                category_source: "assistant",
              })
              .in("id", ids);
            if (error) throw error;
          }
          await supabase.from("assistant_actions").insert({
            user_id: user.id,
            action_type: "bulk_categorize",
            payload: {
              ids,
              category_id: cat.id,
              before: targets.map((t) => ({
                id: t.id,
                category_id: t.category_id,
              })),
            },
            status: "confirmed",
          });
          await writeAudit({
            entity_type: "transaction",
            action: "bulk_categorize",
            after_data: { count: ids.length, category_id: cat.id },
          });
          return `Categorizzati ${ids.length} movimenti.`;
        },
      });
      return;
    }

    if (intent.type === "bulk_rename") {
      const { from, to } = intent.payload;
      const targets = transactions.filter((t) =>
        (t.description || "").toLowerCase().includes(from.toLowerCase())
      );
      askConfirm({
        id: nid(),
        title: "Rinomina massiva",
        description: `${targets.length} descrizioni: "${from}" → "${to}"`,
        execute: async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("Non autenticato");
          for (const t of targets) {
            if (t.manual_description_override) continue;
            await supabase
              .from("transactions")
              .update({
                description: to,
                original_description: t.original_description || t.description,
                manual_description_override: false,
              })
              .eq("id", t.id);
          }
          await supabase.from("assistant_actions").insert({
            user_id: user.id,
            action_type: "bulk_rename",
            payload: {
              before: targets.map((t) => ({
                id: t.id,
                description: t.description,
              })),
              to,
            },
            status: "confirmed",
          });
          await writeAudit({
            entity_type: "transaction",
            action: "bulk_rename",
            after_data: { count: targets.length, to },
          });
          return `Rinominati ${targets.length} movimenti.`;
        },
      });
    }
  }

  async function confirmPending() {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const summary = await pending.execute();
      toast.success("Azione completata");
      pushAssistant(
        `${summary}\nPuoi annullare l'ultima azione da Impostazioni → Undo.`
      );
      setPending(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
      pushAssistant(e instanceof Error ? e.message : "Errore durante l'azione.");
    } finally {
      setBusy(false);
    }
  }

  function cancelPending() {
    setPending(null);
    pushAssistant("Ok, annullato.");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="mf-surface flex flex-col overflow-hidden min-h-[28rem]">
        <div className="flex items-start gap-3 border-b px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight">
              Gestore finanziario
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Parser deterministico + motore finanziario
              {ASSISTANT_LLM_ENABLED ? " · LLM attivo" : " · nessuna API a pagamento"}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 gap-1">
            <Sparkles className="h-3 w-3" />
            Locale
          </Badge>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-muted/20">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-card border shadow-soft"
              }`}
            >
              {m.text}
              {m.money && m.money.length > 0 && m.role === "assistant" && (
                <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                  {m.money.map((line) => (
                    <div
                      key={`${m.id}-${line.label}`}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <span className="text-muted-foreground truncate">
                        {line.label}
                      </span>
                      <span className="font-medium tabular-nums shrink-0">
                        {formatCurrency(line.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {pending && m.pendingId === pending.id && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="min-h-9"
                    disabled={busy}
                    onClick={() => void confirmPending()}
                  >
                    Conferma
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-9"
                    disabled={busy}
                    onClick={cancelPending}
                  >
                    Annulla
                  </Button>
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handle(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Es. "Metti 300 euro nel salvadanaio"'
            className="min-h-touch"
            disabled={busy}
          />
          <Button type="submit" className="min-h-touch shrink-0 px-4" disabled={busy}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Invia</span>
          </Button>
        </form>
      </div>

      <div className="mf-surface p-5 space-y-3 h-fit">
        <h2 className="text-base font-semibold tracking-tight">Suggerimenti</h2>
        <p className="text-xs text-muted-foreground">
          Tocca un chip per provare. Le scritture chiedono sempre conferma.
        </p>
        <div className="flex flex-wrap gap-2">
          {ASSISTANT_EXAMPLES.map((ex) => (
            <Badge
              key={ex}
              variant="secondary"
              className="cursor-pointer min-h-10 px-3 py-2 font-normal text-left whitespace-normal"
              onClick={() => void handle(ex)}
            >
              {ex}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
