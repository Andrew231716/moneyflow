"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { BudgetProgress, Category } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, toMonthStart } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  BudgetCard,
  EmptyState,
  AmountInput,
  ResponsiveFormShell,
} from "@/components/money";

type TopExpense = {
  categoryId: string | null;
  name: string;
  total: number;
};

export function BudgetsManager({
  progress,
  categories,
  topExpenses = [],
}: {
  progress: BudgetProgress[];
  categories: Category[];
  topExpenses?: TopExpense[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const existingCategoryIds = new Set(progress.map((p) => p.budget.category_id));
  const suggestions = topExpenses
    .filter((e) => e.categoryId && !existingCategoryIds.has(e.categoryId))
    .slice(0, 5);

  function openCreate() {
    setEditingId(null);
    setCategoryId("");
    setAmount("");
    setOpen(true);
  }

  function openEdit(p: BudgetProgress) {
    setEditingId(p.budget.id);
    setCategoryId(p.budget.category_id);
    setAmount(String(Number(p.budget.amount)));
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const parsed = Number.parseFloat(amount.replace(",", "."));
      if (!categoryId || !parsed || parsed <= 0) {
        throw new Error("Categoria e importo obbligatori");
      }

      if (editingId) {
        const { error } = await supabase
          .from("budgets")
          .update({
            category_id: categoryId,
            amount: parsed,
          })
          .eq("id", editingId)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Budget aggiornato");
      } else {
        const { error } = await supabase.from("budgets").upsert(
          {
            user_id: user.id,
            category_id: categoryId,
            amount: parsed,
            month: toMonthStart(new Date()),
          },
          { onConflict: "user_id,category_id,month" }
        );
        if (error) throw error;
        toast.success("Budget salvato");
      }
      setOpen(false);
      setEditingId(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function removeBudget(p: BudgetProgress) {
    const name = p.budget.category?.name ?? "questo budget";
    if (!window.confirm(`Eliminare il budget «${name}»?`)) return;
    setDeletingId(p.budget.id);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase
        .from("budgets")
        .delete()
        .eq("id", p.budget.id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Budget eliminato");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setDeletingId(null);
    }
  }

  async function quickSetupFromTop() {
    if (!suggestions.length) {
      toast.message("Nessuna categoria di spesa da cui partire questo mese.");
      return;
    }
    setQuickSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const month = toMonthStart(new Date());
      const rows = suggestions.map((s) => ({
        user_id: user.id,
        category_id: s.categoryId as string,
        amount: Math.max(10, Math.ceil((s.total * 1.1) / 10) * 10),
        month,
      }));
      const { error } = await supabase
        .from("budgets")
        .upsert(rows, { onConflict: "user_id,category_id,month" });
      if (error) throw error;
      toast.success(`Creati ${rows.length} budget dalle top spese`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setQuickSaving(false);
    }
  }

  function openFromSuggestion(s: TopExpense) {
    if (!s.categoryId) return;
    setEditingId(null);
    setCategoryId(s.categoryId);
    setAmount(String(Math.max(10, Math.ceil((s.total * 1.1) / 10) * 10)));
    setOpen(true);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Budget"
        description="Limiti di spesa per categoria — puoi modificarli o eliminarli"
        actions={
          <div className="flex flex-wrap gap-2">
            {suggestions.length > 0 && (
              <Button
                variant="outline"
                onClick={() => void quickSetupFromTop()}
                disabled={quickSaving}
                className="min-h-touch"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {quickSaving ? "Creazione…" : "Setup da top spese"}
              </Button>
            )}
            <Button onClick={openCreate} className="min-h-touch">
              Nuovo budget
            </Button>
          </div>
        }
      />

      {suggestions.length > 0 && progress.length === 0 && (
        <div className="mf-surface p-4 space-y-3">
          <div>
            <p className="text-sm font-medium">Suggeriti dal mese corrente</p>
            <p className="text-xs text-muted-foreground">
              Limite ≈ spesa attuale + 10%. Puoi modificarli dopo.
            </p>
          </div>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li
                key={s.categoryId ?? s.name}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {s.name}{" "}
                  <span className="text-muted-foreground">
                    (spesi {formatCurrency(s.total)})
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-touch"
                  onClick={() => openFromSuggestion(s)}
                >
                  Imposta
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {progress.length === 0 ? (
        <EmptyState
          icon={<PieChart className="h-6 w-6" />}
          title="Nessun budget"
          description="Imposta un limite mensile per una categoria, oppure crea i budget dalle tue top spese."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => void quickSetupFromTop()}
                  disabled={quickSaving}
                >
                  Setup da top spese
                </Button>
              )}
              <Button onClick={openCreate}>Nuovo budget</Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {progress.map((b) => (
            <BudgetCard
              key={b.budget.id}
              progress={b}
              onEdit={() => openEdit(b)}
              onDelete={
                deletingId === b.budget.id ? undefined : () => void removeBudget(b)
              }
            />
          ))}
        </div>
      )}

      <ResponsiveFormShell
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditingId(null);
        }}
        title={editingId ? "Modifica budget" : "Budget mensile"}
        footer={
          <Button
            onClick={save}
            disabled={saving || !categoryId || !amount}
            className="w-full sm:w-auto min-h-touch"
          >
            {saving ? "Salvataggio…" : editingId ? "Aggiorna" : "Salva"}
          </Button>
        }
      >
        <AmountInput value={amount} onChange={setAmount} />
        <div className="space-y-2">
          <Label>Categoria spesa</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="min-h-touch">
              <SelectValue placeholder="Seleziona" />
            </SelectTrigger>
            <SelectContent>
              {categories
                .filter((c) => c.type === "expense")
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </ResponsiveFormShell>
    </div>
  );
}
