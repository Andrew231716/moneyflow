"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Upload, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import type { Account, Category, Transaction, TransactionType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import {
  adjustAccountBalance,
  balanceDeltaForTx,
  writeAudit,
} from "@/lib/data/mutations";
import { classifyDescription } from "@/lib/finance/classification";
import type { ClassificationRule } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TransferSuggestions } from "@/features/transactions/transfer-suggestions";
import {
  PageHeader,
  TransactionItem,
  EmptyState,
  AmountInput,
  ResponsiveFormShell,
  MoneyValue,
} from "@/components/money";

export function TransactionsManager({
  transactions,
  accounts,
  categories,
  rules,
}: {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  rules: ClassificationRule[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<"all" | TransactionType>("all");
  const [open, setOpen] = useState(false);
  const [txType, setTxType] = useState<TransactionType>("expense");
  const [form, setForm] = useState({
    amount: "",
    description: "",
    account_id: accounts[0]?.id ?? "",
    transfer_account_id: accounts[1]?.id ?? "",
    category_id: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const neu = searchParams.get("new");
    if (neu === "expense" || neu === "income" || neu === "transfer") {
      setTxType(neu);
      setOpen(true);
      router.replace("/transactions", { scroll: false });
    }
  }, [searchParams, router]);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? transactions
        : transactions.filter((t) => t.type === filter),
    [transactions, filter]
  );

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const amount = Number.parseFloat(form.amount.replace(",", "."));
      if (!amount || amount <= 0) throw new Error("Importo non valido");
      if (!form.account_id) throw new Error("Seleziona un conto");

      if (txType === "transfer") {
        if (!form.transfer_account_id || form.transfer_account_id === form.account_id) {
          throw new Error("Seleziona un conto di destinazione diverso");
        }
        const pairId = crypto.randomUUID();
        const outRow = {
          user_id: user.id,
          account_id: form.account_id,
          transfer_account_id: form.transfer_account_id,
          transfer_pair_id: pairId,
          type: "transfer" as const,
          amount,
          description: form.description || "Trasferimento",
          date: form.date,
          source: "manual" as const,
          category_source: "manual" as const,
        };
        const inRow = {
          ...outRow,
          account_id: form.transfer_account_id,
          transfer_account_id: form.account_id,
        };
        const { error } = await supabase.from("transactions").insert([outRow, inRow]);
        if (error) throw error;
        await adjustAccountBalance(form.account_id, -amount);
        await adjustAccountBalance(form.transfer_account_id, amount);
        await writeAudit({
          entity_type: "transaction",
          action: "transfer",
          after_data: { amount, from: form.account_id, to: form.transfer_account_id },
        });
      } else {
        let categoryId = form.category_id || null;
        let categorySource: "manual" | "rule" = form.category_id ? "manual" : "rule";
        if (!categoryId) {
          const matched = classifyDescription(form.description, rules, categories);
          if (matched && matched.type === txType) {
            categoryId = matched.id;
            categorySource = "rule";
          }
        }
        const row = {
          user_id: user.id,
          account_id: form.account_id,
          category_id: categoryId,
          type: txType,
          amount,
          description: form.description,
          date: form.date,
          source: "manual" as const,
          category_source: categorySource,
          manual_category_override: Boolean(form.category_id),
        };
        const { data, error } = await supabase
          .from("transactions")
          .insert(row)
          .select()
          .single();
        if (error) throw error;
        await adjustAccountBalance(
          form.account_id,
          balanceDeltaForTx(txType, amount)
        );
        await writeAudit({
          entity_type: "transaction",
          entity_id: data.id,
          action: "create",
          after_data: data,
        });
      }

      toast.success("Movimento salvato");
      setOpen(false);
      setForm({ ...form, amount: "", description: "" });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movimenti"
        description="Entrate, uscite e trasferimenti"
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="min-h-touch">
              <Link href="/transactions/import">
                <Upload className="h-4 w-4" />
                CSV
              </Link>
            </Button>
            <Button size="sm" className="min-h-touch" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Nuovo
            </Button>
          </>
        }
      />

      <TransferSuggestions transactions={transactions} />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="all" className="min-h-10">Tutti</TabsTrigger>
          <TabsTrigger value="expense" className="min-h-10">Uscite</TabsTrigger>
          <TabsTrigger value="income" className="min-h-10">Entrate</TabsTrigger>
          <TabsTrigger value="transfer" className="min-h-10">Trasferimenti</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="hidden md:block mf-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Conto</TableHead>
              <TableHead className="text-right">Importo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="whitespace-nowrap">{tx.date}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {tx.type === "transfer" && (
                      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {tx.description || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  {tx.type === "transfer" ? (
                    <Badge variant="outline">Trasferimento</Badge>
                  ) : (
                    tx.category?.name ?? "—"
                  )}
                </TableCell>
                <TableCell>{tx.account?.name ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <MoneyValue
                    amount={Number(tx.amount)}
                    type={tx.type === "transfer" ? undefined : tx.type}
                    size="sm"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <EmptyState
            className="border-0 shadow-none rounded-none"
            title="Nessun movimento"
            description="Prova a cambiare filtro o aggiungi un movimento."
          />
        )}
      </div>

      <div className="md:hidden mf-surface divide-y divide-border/60 py-1">
        {filtered.map((tx) => (
          <TransactionItem key={tx.id} transaction={tx} />
        ))}
        {filtered.length === 0 && (
          <EmptyState
            className="border-0 shadow-none"
            title="Nessun movimento"
            description="Aggiungi la prima spesa o entrata."
          />
        )}
      </div>

      <ResponsiveFormShell
        open={open}
        onOpenChange={setOpen}
        title="Nuovo movimento"
        footer={
          <Button onClick={save} disabled={saving} className="w-full sm:w-auto min-h-touch">
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        }
      >
        <Tabs value={txType} onValueChange={(v) => setTxType(v as TransactionType)}>
          <TabsList className="w-full">
            <TabsTrigger value="expense" className="flex-1 min-h-10">Uscita</TabsTrigger>
            <TabsTrigger value="income" className="flex-1 min-h-10">Entrata</TabsTrigger>
            <TabsTrigger value="transfer" className="flex-1 min-h-10">Trasf.</TabsTrigger>
          </TabsList>
        </Tabs>

        <AmountInput
          value={form.amount}
          onChange={(amount) => setForm({ ...form, amount })}
        />

        <div className="space-y-2">
          <Label>Descrizione</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-h-touch"
          />
        </div>
        <div className="space-y-2">
          <Label>{txType === "transfer" ? "Da" : "Conto"}</Label>
          <Select
            value={form.account_id}
            onValueChange={(v) => setForm({ ...form, account_id: v })}
          >
            <SelectTrigger className="min-h-touch">
              <SelectValue placeholder="Seleziona" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {txType === "transfer" ? (
          <div className="space-y-2">
            <Label>A</Label>
            <Select
              value={form.transfer_account_id}
              onValueChange={(v) => setForm({ ...form, transfer_account_id: v })}
            >
              <SelectTrigger className="min-h-touch">
                <SelectValue placeholder="Seleziona" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select
              value={form.category_id || "__auto__"}
              onValueChange={(v) =>
                setForm({ ...form, category_id: v === "__auto__" ? "" : v })
              }
            >
              <SelectTrigger className="min-h-touch">
                <SelectValue placeholder="Auto / seleziona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">Auto (regole)</SelectItem>
                {categories
                  .filter((c) => c.type === txType)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label>Data</Label>
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="min-h-touch"
          />
        </div>
      </ResponsiveFormShell>
    </div>
  );
}
