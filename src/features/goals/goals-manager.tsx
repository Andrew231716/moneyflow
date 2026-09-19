"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { toast } from "sonner";
import type { Goal } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PageHeader,
  GoalCard,
  EmptyState,
  AmountInput,
  ResponsiveFormShell,
} from "@/components/money";

export function GoalsManager({ goals }: { goals: Goal[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "0",
    deadline: "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase.from("goals").insert({
        user_id: user.id,
        name: form.name,
        target_amount: Number.parseFloat(form.target_amount.replace(",", ".")),
        current_amount: Number.parseFloat(form.current_amount.replace(",", ".")) || 0,
        deadline: form.deadline || null,
      });
      if (error) throw error;
      toast.success("Obiettivo creato");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function addProgress(goal: Goal, delta: number) {
    const supabase = createClient();
    const next = Math.min(
      Number(goal.target_amount),
      Number(goal.current_amount) + delta
    );
    const status = next >= Number(goal.target_amount) ? "completed" : goal.status;
    const { error } = await supabase
      .from("goals")
      .update({ current_amount: next, status })
      .eq("id", goal.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Progresso aggiornato");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Obiettivi"
        description="Risparmi e traguardi"
        actions={
          <Button onClick={() => setOpen(true)} className="min-h-touch">
            Nuovo obiettivo
          </Button>
        }
      />

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target className="h-6 w-6" />}
          title="Nessun obiettivo"
          description="Crea un obiettivo di risparmio con target e scadenza."
          action={<Button onClick={() => setOpen(true)}>Nuovo obiettivo</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onAdd={(d) => addProgress(g, d)} />
          ))}
        </div>
      )}

      <ResponsiveFormShell
        open={open}
        onOpenChange={setOpen}
        title="Nuovo obiettivo"
        footer={
          <Button
            onClick={save}
            disabled={saving || !form.name || !form.target_amount}
            className="w-full sm:w-auto min-h-touch"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        }
      >
        <AmountInput
          label="Target"
          value={form.target_amount}
          onChange={(target_amount) => setForm({ ...form, target_amount })}
        />
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="min-h-touch"
          />
        </div>
        <AmountInput
          label="Già risparmiato"
          value={form.current_amount}
          onChange={(current_amount) => setForm({ ...form, current_amount })}
        />
        <div className="space-y-2">
          <Label>Scadenza</Label>
          <Input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            className="min-h-touch"
          />
        </div>
      </ResponsiveFormShell>
    </div>
  );
}
