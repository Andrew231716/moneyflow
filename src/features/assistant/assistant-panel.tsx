"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  Account,
  Category,
  ClassificationRule,
  RecurringTransaction,
  Transaction,
} from "@/types/database";
import {
  ASSISTANT_EXAMPLES,
  parseAssistantCommand,
  runQueryTransactions,
} from "@/features/assistant/parser";
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
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PendingAction {
  id: string;
  title: string;
  description: string;
  execute: () => Promise<void>;
}

export function AssistantPanel({
  accounts,
  categories,
  transactions,
  rules,
  recurring,
}: {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  rules: ClassificationRule[];
  recurring: RecurringTransaction[];
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([
    {
      role: "assistant",
      text: "Ciao! Sono l'assistente locale di MoneyFlow (senza AI cloud). Scrivi un comando in italiano.",
    },
  ]);
  const [pending, setPending] = useState<PendingAction | null>(null);

  async function handle(command: string) {
    const text = command.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");

    const intent = parseAssistantCommand(text);

    if (intent.type === "unknown") {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: intent.payload.message },
      ]);
      return;
    }

    if (intent.type === "query_transactions") {
      const result = runQueryTransactions(transactions, intent.payload);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: result.summaryText },
      ]);
      return;
    }

    if (intent.type === "financial_projection") {
      const forecast = forecastMonthEnd(transactions, recurring);
      const summary = calcMonthSummary(transactions);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Previsione fine mese: entrate ${formatCurrency(forecast.projectedIncome)}, uscite ${formatCurrency(forecast.projectedExpense)}, saldo ${formatCurrency(forecast.projectedSavings)}. Ora: risparmio mese ${formatCurrency(summary.savings)} (${summary.savingsRate.toFixed(0)}%).`,
        },
      ]);
      return;
    }

    if (intent.type === "create_transaction") {
      const p = intent.payload;
      if (!p.amount) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Specifica un importo, es. spesa 25 esselunga" },
        ]);
        return;
      }
      const account = accounts[0];
      if (!account) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Crea prima un conto." },
        ]);
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

      setPending({
        id: crypto.randomUUID(),
        title: "Crea movimento",
        description: `${p.txType === "expense" ? "Uscita" : "Entrata"} ${formatCurrency(p.amount)} — ${p.description}`,
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
            date: new Date().toISOString().slice(0, 10),
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
        },
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Confermi la creazione del movimento? (le azioni bulk richiedono sempre conferma)",
        },
      ]);
      return;
    }

    if (intent.type === "bulk_categorize") {
      const { pattern, categoryName } = intent.payload;
      const cat = categories.find(
        (c) => c.name.toLowerCase() === categoryName.toLowerCase()
      );
      if (!cat) {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: `Categoria "${categoryName}" non trovata.` },
        ]);
        return;
      }
      const targets = transactions.filter(
        (t) =>
          t.type !== "transfer" &&
          !t.manual_category_override &&
          t.category_source !== "manual" &&
          (t.description || "").toLowerCase().includes(pattern.toLowerCase())
      );
      setPending({
        id: crypto.randomUUID(),
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
        },
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Trovati ${targets.length} movimenti. Confermi la categorizzazione?`,
        },
      ]);
      return;
    }

    if (intent.type === "bulk_rename") {
      const { from, to } = intent.payload;
      const targets = transactions.filter((t) =>
        (t.description || "").toLowerCase().includes(from.toLowerCase())
      );
      setPending({
        id: crypto.randomUUID(),
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
        },
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: `Trovati ${targets.length} movimenti. Confermi la rinomina?`,
        },
      ]);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    try {
      await pending.execute();
      toast.success("Azione completata");
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "Fatto. Puoi annullare l'ultima azione da Impostazioni → Undo." },
      ]);
      setPending(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Assistente locale</CardTitle>
          <CardDescription>
            Parser + regole — nessuna API a pagamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-72 overflow-y-auto space-y-2 rounded-lg border bg-muted/30 p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-card border"
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handle(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Es. "spesa 25 esselunga"'
            />
            <Button type="submit">Invia</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Esempi</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {ASSISTANT_EXAMPLES.map((ex) => (
            <Badge
              key={ex}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => void handle(ex)}
            >
              {ex}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{pending?.description}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Annulla
            </Button>
            <Button onClick={() => void confirmPending()}>Conferma</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
