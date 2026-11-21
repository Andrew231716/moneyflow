"use client";

import { format } from "date-fns";

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
import { SyncReviewQueue } from "@/features/transactions/sync-review-queue";
import { AutoCategorizeButton } from "@/features/transactions/auto-categorize-button";
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
  const [filter, setFilter] = useState<"all" | TransactionType | "pending">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<TransactionType>("expense");
  const [form, setForm] = useState({
    amount: "",
    description: "",
    account_id: accounts[0]?.id ?? "",
    transfer_account_id: accounts[1]?.id ?? "",
    category_id: "",
    date: format(new Date(), "yyyy-MM-dd"),
  });
  const [editForm, setEditForm] = useState({
    description: "",
    category_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [split, setSplit] = useState({ amount: "", category: "" });
  const [bulkCategory, setBulkCategory] = useState("");

  async function changeVisibleCategories() {
    const category = categories.find((item) => item.id === bulkCategory);
    const targets = filtered.filter((item) => item.type === category?.type && item.category_id !== category.id);
    if (!category || !targets.length || saving || !window.confirm(`Applico «${category.name}» a ${targets.length} movimenti visibili?`)) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.from("transactions")
        .update({ category_id: category.id, category_source: "manual", manual_category_override: true })
        .in("id", targets.map((item) => item.id));
      if (error) throw error;
      toast.success(`Aggiornati ${targets.length} movimenti`, {
        action: {
          label: "Annulla",
          onClick: async () => {
            const results = await Promise.all(targets.map((item) => supabase.from("transactions")
              .update({ category_id: item.category_id, category_source: item.category_source,
                manual_category_override: item.manual_category_override })
              .eq("id", item.id).eq("category_id", category.id)));
            if (results.some((result) => result.error)) toast.error("Alcune categorie non sono state ripristinate.");
            else toast.success("Categorie ripristinate");
            router.refresh();
          },
        },
      });
      router.refresh();
    } catch {
      toast.error("Impossibile aggiornare le categorie.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const lastAccount = localStorage.getItem("mf:last-movement-account");
    if (lastAccount && accounts.some((account) => account.id === lastAccount)) {
      setForm((current) => ({ ...current, account_id: lastAccount }));
    }
  }, [accounts]);

  useEffect(() => {
    const neu = searchParams.get("new");
    if (neu === "expense" || neu === "income" || neu === "transfer") {
      setTxType(neu);
      setOpen(true);
      router.replace("/transactions", { scroll: false });
      return;
    }
    const cat = searchParams.get("category");
    if (searchParams.get("pending") === "1") setFilter("pending");
    if (cat === "uncategorized") {
      setCategoryFilter("uncategorized");
      setFilter("all");
    } else if (cat) {
      setCategoryFilter(cat);
      setFilter("expense");
    }
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
  }, [searchParams, router]);

  const pendingCount = useMemo(
    () =>
      transactions.filter((t) => (t.booking_status ?? "booked") === "pending")
        .length,
    [transactions]
  );

  const filtered = useMemo(() => {
    let list = transactions;
    if (filter === "pending") {
      list = transactions.filter(
        (t) => (t.booking_status ?? "booked") === "pending"
      );
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
    const needle = searchQuery.trim().toLowerCase();
    if (needle) {
      list = list.filter((t) => {
        const hay = [
          t.description,
          t.merchant,
          t.original_description,
          t.original_merchant,
          t.notes,
          t.category?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(needle);
      });
    }
    const month = searchParams.get("month");
    return month ? list.filter((item) => item.date.startsWith(`${month}-`)) : list;
  }, [transactions, filter, categoryFilter, searchParams, searchQuery]);

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
      } else if (txType === "expense" && (split.amount || split.category)) {
        const second = Number(split.amount.replace(",", "."));
        const first = Math.round((amount - second) * 100) / 100;
        if (!form.category_id || !split.category || first <= 0 || second <= 0
          || !Number.isFinite(second) || !Number.isFinite(first)) {
          throw new Error("Scegli due categorie e una seconda quota inferiore al totale.");
        }
        const { error } = await supabase.rpc("create_expense_split", {
          p_account: form.account_id, p_date: form.date, p_description: form.description,
          p_parts: [{ amount: first, category_id: form.category_id }, { amount: second, category_id: split.category }],
        });
        if (error) throw new Error(error.message);
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
      setSplit({ amount: "", category: "" });
      setForm({ ...form, amount: "", description: "" });
      localStorage.setItem("mf:last-movement-account", form.account_id);
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
        description={
          pendingCount > 0
            ? `Tocca per modificare · ${pendingCount} non contabilizzat${pendingCount === 1 ? "o" : "i"}`
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

      <SyncReviewQueue transactions={transactions} />

      <TransferSuggestions transactions={transactions} />

      <div className="relative">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cerca merchant, descrizione, note…"
          className="min-h-touch"
          aria-label="Cerca movimenti"
        />
        {searchQuery && (
          <p className="mt-1 text-xs text-muted-foreground">
            {filtered.length} risultat{filtered.length === 1 ? "o" : "i"}
          </p>
        )}
      </div>

      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v as typeof filter);
          setCategoryFilter(null);
          if (searchParams.get("category")) {
            router.replace("/transactions", { scroll: false });
          }
        }}
      >
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="all" className="min-h-10">Tutti</TabsTrigger>
          <TabsTrigger value="expense" className="min-h-10">Uscite</TabsTrigger>
          <TabsTrigger value="income" className="min-h-10">Entrate</TabsTrigger>
          <TabsTrigger value="transfer" className="min-h-10">Trasferimenti</TabsTrigger>
          <TabsTrigger value="pending" className="min-h-10">
            In sospeso{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={categoryFilter === "uncategorized" ? "default" : "outline"}
          onClick={() => { setCategoryFilter("uncategorized"); setFilter("all"); }}>
          Senza categoria
        </Button>
        <AutoCategorizeButton
          transactions={transactions}
          categories={categories}
          rules={rules}
        />
        {(categoryFilter || filter !== "all" || searchQuery) && (
          <Button size="sm" variant="ghost" onClick={() => {
            setCategoryFilter(null);
            setFilter("all");
            setSearchQuery("");
            router.replace("/transactions", { scroll: false });
          }}>Azzera filtri</Button>
        )}
      </div>

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
      {(categoryFilter || filter === "expense" || filter === "income") && filtered.length > 1 && (
        <details className="mf-surface p-3">
          <summary className="text-sm font-medium">Cambia categoria ai risultati filtrati</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <select aria-label="Categoria da applicare" className="rounded border bg-background p-2"
              value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)}>
              <option value="">Scegli categoria</option>
              {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <Button disabled={!bulkCategory || saving} onClick={() => void changeVisibleCategories()}>Applica</Button>
          </div>
        </details>
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
                className={tx.type !== "transfer" ? "cursor-pointer" : undefined}
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
                    {(tx.booking_status ?? "booked") === "pending" && (
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
                ? "Dopo una sync, qui compaiono i movimenti che la banca non ha ancora contabilizzato. Se la lista è vuota, Intesa non ha inviato pending in questo momento."
                : "Prova a cambiare filtro, sincronizza la banca da Conti, oppure aggiungi un movimento."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/accounts">Vai ai Conti / Sync</Link>
                </Button>
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
                ? "Nessun pending dalla banca in questo momento. Riprova dopo una sync."
                : "Sincronizza la banca o aggiungi la prima spesa."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/accounts">Sync banca</Link>
                </Button>
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
          autoFocus
          value={form.amount}
          onChange={(amount) => setForm({ ...form, amount })}
        />
        {txType === "expense" && (
          <details className="rounded-lg border p-3">
            <summary>Dividi tra due categorie</summary>
            <div className="mt-3 space-y-2">
              <p className="text-sm text-muted-foreground">La parte restante va alla categoria principale.</p>
              <Input aria-label="Importo seconda quota" inputMode="decimal" placeholder="Seconda quota" value={split.amount}
                onChange={(e) => setSplit({ ...split, amount: e.target.value })} />
              <select className="w-full rounded-md border bg-background p-2" aria-label="Seconda categoria" value={split.category}
                onChange={(e) => setSplit({ ...split, category: e.target.value })}>
                <option value="">Seconda categoria</option>
                {categories.filter((category) => category.type === "expense").map((category) =>
                  <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </div>
          </details>
        )}

        <details className="rounded-lg border p-3">
          <summary>Altre opzioni</summary>
          <Label htmlFor="movement-description">Descrizione</Label>
          <Input
            id="movement-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-h-touch"
          />
        </details>
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
