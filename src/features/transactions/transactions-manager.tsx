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
import { addManualOverrides } from "@/features/open-banking/deduplication";
import { SyncBankButton } from "@/features/open-banking/components/sync-bank-button";
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
import { cn } from "@/lib/utils";

function isPendingTx(tx: Transaction): boolean {
  return (tx.booking_status ?? "booked") === "pending";
}

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
  const [filter, setFilter] = useState<"all" | TransactionType | "pending">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<TransactionType>("expense");
  const [form, setForm] = useState({
    amount: "",
    description: "",
    account_id: accounts[0]?.id ?? "",
    transfer_account_id: accounts[1]?.id ?? "",
    category_id: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [editForm, setEditForm] = useState({
    description: "",
    category_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const neu = searchParams.get("new");
    if (neu === "expense" || neu === "income" || neu === "transfer") {
      setTxType(neu);
      setOpen(true);
      router.replace("/transactions", { scroll: false });
      return;
    }
    const cat = searchParams.get("category");
    if (cat) {
      setCategoryFilter(cat);
      setFilter("expense");
    }
    if (searchParams.get("filter") === "pending") {
      setFilter("pending");
    }
  }, [searchParams, router]);

  const pendingCount = useMemo(
    () => transactions.filter(isPendingTx).length,
    [transactions]
  );

  const filtered = useMemo(() => {
    let list = transactions;
    if (filter === "pending") {
      list = transactions.filter(isPendingTx);
    } else if (filter !== "all") {
      list = transactions.filter((t) => t.type === filter);
    }
    if (categoryFilter) {
      list = list.filter((t) =>
        categoryFilter === "uncategorized"
          ? !t.category_id
          : t.category_id === categoryFilter
      );
    }
    // In Tutti / type filters, surface non contabilizzati first so they are findable.
    if (filter !== "pending") {
      list = [...list].sort((a, b) => {
        const ap = isPendingTx(a) ? 0 : 1;
        const bp = isPendingTx(b) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return b.date.localeCompare(a.date);
      });
    }
    return list;
  }, [transactions, filter, categoryFilter]);

  function openEdit(tx: Transaction) {
    if (tx.type === "transfer") {
      toast.message("I trasferimenti non si modificano da qui.");
      return;
    }
    setEditing(tx);
    setEditForm({
      description: tx.description ?? "",
      category_id: tx.category_id ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const description = editForm.description.trim();
      if (!description) throw new Error("Inserisci un nome per il movimento");

      const categoryId = editForm.category_id || null;
      const overrides = addManualOverrides(editing.manual_override_fields, [
        "description",
        "category_id",
      ]);

      const { data, error } = await supabase
        .from("transactions")
        .update({
          description,
          category_id: categoryId,
          category_source: "manual",
          manual_category_override: true,
          manual_description_override: true,
          manual_override_fields: overrides,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editing.id)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;

      await writeAudit({
        entity_type: "transaction",
        entity_id: editing.id,
        action: "update",
        before_data: editing as unknown as Record<string, unknown>,
        after_data: data as unknown as Record<string, unknown>,
      });

      toast.success("Movimento aggiornato");
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

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

  const pendingEmptyCopy =
    "Qui compaiono i movimenti che Intesa non ha ancora contabilizzato (badge arancione). Se la lista è vuota, sincronizza ora — resti su Movimenti.";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Movimenti"
        description={
          pendingCount > 0
            ? `Tocca per modificare · ${pendingCount} non contabilizzat${pendingCount === 1 ? "o" : "i"} in cima alla lista`
            : "Tocca un movimento per cambiare nome o categoria"
        }
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

      <div className="space-y-2">
        <Tabs
          value={filter === "pending" ? "__none__" : filter}
          onValueChange={(v) => {
            setFilter(v as typeof filter);
            setCategoryFilter(null);
            if (searchParams.get("category") || searchParams.get("filter")) {
              router.replace("/transactions", { scroll: false });
            }
          }}
        >
          <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex h-auto">
            <TabsTrigger value="all" className="min-h-10">
              Tutti
            </TabsTrigger>
            <TabsTrigger value="expense" className="min-h-10">
              Uscite
            </TabsTrigger>
            <TabsTrigger value="income" className="min-h-10">
              Entrate
            </TabsTrigger>
            <TabsTrigger value="transfer" className="min-h-10">
              Trasferimenti
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={filter === "pending" ? "default" : "outline"}
            className={cn(
              "min-h-10 rounded-md",
              filter === "pending" &&
                "bg-amber-600 hover:bg-amber-600/90 text-white",
              filter !== "pending" &&
                pendingCount > 0 &&
                "border-amber-500/50 text-amber-800 dark:text-amber-200"
            )}
            onClick={() => {
              setFilter("pending");
              setCategoryFilter(null);
              if (searchParams.get("category")) {
                router.replace("/transactions", { scroll: false });
              }
            }}
          >
            Non contabilizzati
            {pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Button>
          {filter === "pending" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="min-h-10"
              onClick={() => setFilter("all")}
            >
              Mostra tutti
            </Button>
          )}
        </div>
      </div>

      {filter !== "pending" && pendingCount > 0 && (
        <button
          type="button"
          onClick={() => setFilter("pending")}
          className="w-full text-left rounded-xl border border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2.5 text-sm"
        >
          <span className="font-medium text-amber-900 dark:text-amber-100">
            {pendingCount} non contabilizzat{pendingCount === 1 ? "o" : "i"}
          </span>
          <span className="text-muted-foreground">
            {" "}
            · in cima alla lista oppure tocca per filtrarli
          </span>
        </button>
      )}

      {categoryFilter && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">
            Categoria:{" "}
            {categoryFilter === "uncategorized"
              ? "Senza categoria"
              : categories.find((c) => c.id === categoryFilter)?.name ?? "Filtro"}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-touch"
            onClick={() => {
              setCategoryFilter(null);
              router.replace("/transactions", { scroll: false });
            }}
          >
            Rimuovi filtro
          </Button>
        </div>
      )}

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
              <TableRow
                key={tx.id}
                className={cn(
                  tx.type !== "transfer" ? "cursor-pointer" : undefined,
                  isPendingTx(tx) && "bg-amber-50/60 dark:bg-amber-950/20"
                )}
                onClick={() => {
                  if (tx.type !== "transfer") openEdit(tx);
                }}
              >
                <TableCell className="whitespace-nowrap">{tx.date}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {tx.type === "transfer" && (
                      <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span>{tx.description || "—"}</span>
                    {isPendingTx(tx) && (
                      <Badge variant="secondary">Non contabilizzato</Badge>
                    )}
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
            description={
              filter === "pending"
                ? pendingEmptyCopy
                : "Prova a cambiare filtro, sincronizza la banca, oppure aggiungi un movimento."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <SyncBankButton
                  onSynced={() => {
                    if (filter === "pending") setFilter("pending");
                  }}
                />
                <Button size="sm" onClick={() => setOpen(true)}>
                  Nuovo movimento
                </Button>
              </div>
            }
          />
        )}
      </div>

      <div className="md:hidden mf-surface divide-y divide-border/60 py-1">
        {filtered.map((tx) => (
          <TransactionItem
            key={tx.id}
            transaction={tx}
            onClick={tx.type === "transfer" ? undefined : () => openEdit(tx)}
          />
        ))}
        {filtered.length === 0 && (
          <EmptyState
            className="border-0 shadow-none"
            title="Nessun movimento"
            description={
              filter === "pending"
                ? pendingEmptyCopy
                : "Sincronizza la banca o aggiungi la prima spesa."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <SyncBankButton
                  onSynced={() => {
                    setFilter("pending");
                  }}
                />
                <Button size="sm" onClick={() => setOpen(true)}>
                  Nuovo
                </Button>
              </div>
            }
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

      <ResponsiveFormShell
        open={Boolean(editing)}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        title="Modifica movimento"
        footer={
          <Button
            onClick={() => void saveEdit()}
            disabled={saving || !editForm.description.trim()}
            className="w-full sm:w-auto min-h-touch"
          >
            {saving ? "Salvataggio…" : "Aggiorna"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label>Nome movimento</Label>
          <Input
            value={editForm.description}
            onChange={(e) =>
              setEditForm({ ...editForm, description: e.target.value })
            }
            className="min-h-touch"
          />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select
            value={editForm.category_id || "__none__"}
            onValueChange={(v) =>
              setEditForm({
                ...editForm,
                category_id: v === "__none__" ? "" : v,
              })
            }
          >
            <SelectTrigger className="min-h-touch">
              <SelectValue placeholder="Seleziona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Senza categoria</SelectItem>
              {categories
                .filter((c) => c.type === (editing?.type ?? "expense"))
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {editing && (
          <p className="text-xs text-muted-foreground">
            {editing.date} · {formatAmountHint(editing)}
            {isPendingTx(editing) ? " · Non contabilizzato" : null}
            {editing.source === "bank"
              ? " · Le modifiche restano anche dopo la sync banca"
              : null}
          </p>
        )}
      </ResponsiveFormShell>
    </div>
  );
}

function formatAmountHint(tx: Transaction): string {
  const n = Number(tx.amount);
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}
