"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type {
  Account,
  Category,
  RecurringFrequency,
  RecurringTransaction,
} from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { calcRecurringTotals } from "@/lib/finance/engine";
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
import {
  PageHeader,
  EmptyState,
  MoneyValue,
  AmountInput,
  ResponsiveFormShell,
} from "@/components/money";
import { Repeat } from "lucide-react";

const freqLabels: Record<RecurringFrequency, string> = {
  weekly: "Settimanale",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  semiannual: "Semestrale",
  yearly: "Annuale",
};

const RECURRING_EXAMPLES: {
  label: string;
  description: string;
  amount: string;
  type: "income" | "expense";
  frequency: RecurringFrequency;
  categoryName?: string;
}[] = [
  {
    label: "Affitto",
    description: "Affitto",
    amount: "800",
    type: "expense",
    frequency: "monthly",
    categoryName: "Casa",
  },
  {
    label: "Stipendio",
    description: "Stipendio",
    amount: "2000",
    type: "income",
    frequency: "monthly",
    categoryName: "Stipendio",
  },
  {
    label: "Netflix",
    description: "Netflix",
    amount: "13,99",
    type: "expense",
    frequency: "monthly",
    categoryName: "Abbonamenti",
  },
  {
    label: "Auto",
    description: "Auto (rate / bollo / assicurazione)",
    amount: "150",
    type: "expense",
    frequency: "monthly",
    categoryName: "Auto",
  },
  {
    label: "Palestra",
    description: "Abbonamento palestra",
    amount: "40",
    type: "expense",
    frequency: "monthly",
    categoryName: "Salute",
  },
];

export function RecurringManager({
  items,
  accounts,
  categories: initialCategories,
}: {
  items: RecurringTransaction[];
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const totals = calcRecurringTotals(items);
  const [categories, setCategories] = useState(initialCategories);

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    description: "",
    amount: "",
    type: "expense" as "income" | "expense",
    frequency: "monthly" as RecurringFrequency,
    account_id: accounts[0]?.id ?? "",
    category_id: "",
    next_due_date: new Date().toISOString().slice(0, 10),
  });
  const [newCategoryName, setNewCategoryName] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);

  const typeCategories = useMemo(
    () => categories.filter((c) => c.type === form.type),
    [categories, form.type]
  );

  async function ensureCategory(
    name: string,
    type: "income" | "expense"
  ): Promise<string | null> {
    const existing = categories.find(
      (c) =>
        c.type === type && c.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (existing) return existing.id;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Non autenticato");
    const { data, error } = await supabase
      .from("categories")
      .insert({
        user_id: user.id,
        name: name.trim(),
        type,
        icon: type === "expense" ? "tag" : "plus-circle",
        color: type === "expense" ? "#64748b" : "#16a34a",
        is_system: false,
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("Impossibile creare la categoria");
    setCategories((prev) => [...prev, data as Category]);
    return data.id as string;
  }

  async function createCategoryInline() {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error("Scrivi il nome della nuova categoria");
      return;
    }
    setCreatingCategory(true);
    try {
      const id = await ensureCategory(name, form.type);
      if (id) {
        setForm((f) => ({ ...f, category_id: id }));
        setNewCategoryName("");
        toast.success(`Categoria «${name}» aggiunta`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setCreatingCategory(false);
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
      const { error } = await supabase.from("recurring_transactions").insert({
        user_id: user.id,
        description: form.description,
        amount: Number.parseFloat(form.amount.replace(",", ".")),
        type: form.type,
        frequency: form.frequency,
        account_id: form.account_id,
        category_id: form.category_id || null,
        next_due_date: form.next_due_date,
      });
      if (error) throw error;
      toast.success("Ricorrente creato");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  function applyExample(ex: (typeof RECURRING_EXAMPLES)[number]) {
    void (async () => {
      let categoryId = "";
      if (ex.categoryName) {
        const hit = categories.find(
          (c) =>
            c.type === ex.type &&
            c.name.toLowerCase() === ex.categoryName!.toLowerCase()
        );
        if (hit) categoryId = hit.id;
        else {
          try {
            categoryId = (await ensureCategory(ex.categoryName, ex.type)) ?? "";
          } catch {
            categoryId = "";
          }
        }
      }
      setForm({
        description: ex.description,
        amount: ex.amount,
        type: ex.type,
        frequency: ex.frequency,
        account_id: accounts[0]?.id ?? "",
        category_id: categoryId,
        next_due_date: new Date().toISOString().slice(0, 10),
      });
      setOpen(true);
    })();
  }

  const exampleButtons = (
    <div className="flex flex-wrap justify-center gap-2">
      {RECURRING_EXAMPLES.map((ex) => (
        <Button
          key={ex.label}
          type="button"
          size="sm"
          variant="outline"
          className="min-h-touch"
          onClick={() => applyExample(ex)}
        >
          {ex.label}
        </Button>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ricorrenti"
        description="Solo pianificazione e stime — non spostano soldi dal conto in automatico"
        actions={
          <Button onClick={() => setOpen(true)} className="min-h-touch">
            Nuovo ricorrente
          </Button>
        }
      />

      <div className="mf-surface p-4 space-y-2 text-sm">
        <div className="flex flex-wrap gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Mensile netto</p>
            <MoneyValue
              amount={totals.monthly}
              size="md"
              tone={totals.monthly >= 0 ? "success" : "danger"}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Annuo</p>
            <MoneyValue amount={totals.yearly} size="md" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Alla data di scadenza MoneyFlow <strong>non</strong> accredita né
          addebita il conto indicato: i ricorrenti servono per previsioni a fine
          mese e per ricordarti le uscite/entrate fisse. I movimenti reali restano
          quelli della banca o quelli che inserisci tu.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-6 w-6" />}
          title="Nessuna ricorrenza"
          description="Aggiungi affitto, stipendio, auto o abbonamenti. Tocca un esempio per partire."
          action={
            <div className="flex flex-col items-center gap-3">
              {exampleButtons}
              <Button onClick={() => setOpen(true)}>Nuovo ricorrente</Button>
            </div>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">{exampleButtons}</div>
          <div className="space-y-2">
            {items.map((r) => (
              <div
                key={r.id}
                className="mf-surface flex items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Prossimo: {r.next_due_date} · {r.account?.name}
                    {r.category?.name ? ` · ${r.category.name}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <MoneyValue
                    amount={Number(r.amount)}
                    size="sm"
                    type={r.type}
                  />
                  <Badge variant="secondary">{freqLabels[r.frequency]}</Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ResponsiveFormShell
        open={open}
        onOpenChange={setOpen}
        title="Movimento ricorrente"
        footer={
          <Button
            onClick={save}
            disabled={saving || !form.description || !form.amount}
            className="w-full sm:w-auto min-h-touch"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        }
      >
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
          <Label>Tipo</Label>
          <Select
            value={form.type}
            onValueChange={(v) =>
              setForm({
                ...form,
                type: v as "income" | "expense",
                category_id: "",
              })
            }
          >
            <SelectTrigger className="min-h-touch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Uscita</SelectItem>
              <SelectItem value="income">Entrata</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Frequenza</Label>
          <Select
            value={form.frequency}
            onValueChange={(v) =>
              setForm({ ...form, frequency: v as RecurringFrequency })
            }
          >
            <SelectTrigger className="min-h-touch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(freqLabels) as RecurringFrequency[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {freqLabels[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Conto (solo riferimento)</Label>
          <Select
            value={form.account_id}
            onValueChange={(v) => setForm({ ...form, account_id: v })}
          >
            <SelectTrigger className="min-h-touch">
              <SelectValue />
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
        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select
            value={form.category_id || "__none__"}
            onValueChange={(v) =>
              setForm({ ...form, category_id: v === "__none__" ? "" : v })
            }
          >
            <SelectTrigger className="min-h-touch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nessuna</SelectItem>
              {typeCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nuova categoria…"
              className="min-h-touch"
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-touch shrink-0"
              disabled={creatingCategory || !newCategoryName.trim()}
              onClick={() => void createCategoryInline()}
            >
              {creatingCategory ? "…" : "Aggiungi"}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Prossima scadenza</Label>
          <Input
            type="date"
            value={form.next_due_date}
            onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
            className="min-h-touch"
          />
        </div>
      </ResponsiveFormShell>
    </div>
  );
}
