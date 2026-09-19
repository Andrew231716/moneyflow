"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart } from "lucide-react";
import { toast } from "sonner";
import type { BudgetProgress, Category } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { toMonthStart } from "@/lib/utils";
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

export function BudgetsManager({
  progress,
  categories,
}: {
  progress: BudgetProgress[];
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase.from("budgets").upsert(
        {
          user_id: user.id,
          category_id: categoryId,
          amount: Number.parseFloat(amount.replace(",", ".")),
          month: toMonthStart(new Date()),
        },
        { onConflict: "user_id,category_id,month" }
      );
      if (error) throw error;
      toast.success("Budget salvato");
      setOpen(false);
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
        title="Budget"
        description="Limiti di spesa per categoria"
        actions={
          <Button onClick={() => setOpen(true)} className="min-h-touch">
            Nuovo budget
          </Button>
        }
      />

      {progress.length === 0 ? (
        <EmptyState
          icon={<PieChart className="h-6 w-6" />}
          title="Nessun budget"
          description="Imposta un limite mensile per una categoria di spesa."
          action={
            <Button onClick={() => setOpen(true)}>Nuovo budget</Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {progress.map((b) => (
            <BudgetCard key={b.budget.id} progress={b} />
          ))}
        </div>
      )}

      <ResponsiveFormShell
        open={open}
        onOpenChange={setOpen}
        title="Budget mensile"
        footer={
          <Button
            onClick={save}
            disabled={saving || !categoryId || !amount}
            className="w-full sm:w-auto min-h-touch"
          >
            {saving ? "Salvataggio…" : "Salva"}
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
