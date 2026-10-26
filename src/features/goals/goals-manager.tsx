"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { toast } from "sonner";
import type { Account, Goal } from "@/types/database";
import type { GoalSavingsPlan } from "@/lib/finance/goal-savings-plan";
import { createClient } from "@/lib/supabase/client";
import {
  adjustAccountBalance,
  writeAudit,
} from "@/lib/data/mutations";
import { formatCurrency } from "@/lib/utils";
import { isGoalReached, isGoalSettled } from "@/lib/finance/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PageHeader,
  GoalCard,
  EmptyState,
  AmountInput,
  ResponsiveFormShell,
  GoalSavingsPlanCard,
} from "@/components/money";

const emptyForm = {
  name: "",
  target_amount: "",
  current_amount: "0",
  deadline: "",
};

export function GoalsManager({
  goals,
  savingsAccounts = [],
  savingsPlans = [],
}: {
  goals: Goal[];
  savingsAccounts?: Account[];
  savingsPlans?: GoalSavingsPlan[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settleGoal, setSettleGoal] = useState<Goal | null>(null);
  const [deductFromSavings, setDeductFromSavings] = useState(true);
  const [settling, setSettling] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(goal: Goal) {
    setEditing(goal);
    setForm({
      name: goal.name,
      target_amount: String(Number(goal.target_amount)),
      current_amount: String(Number(goal.current_amount)),
      deadline: goal.deadline ? goal.deadline.slice(0, 10) : "",
    });
    setOpen(true);
  }

  function handleFormOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setEditing(null);
  }

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const name = form.name.trim();
      const target = Number.parseFloat(form.target_amount.replace(",", "."));
      const current =
        Number.parseFloat(form.current_amount.replace(",", ".")) || 0;
      if (!name) throw new Error("Indica un nome");
      if (!Number.isFinite(target) || target <= 0) {
        throw new Error("Target non valido");
      }
      if (!Number.isFinite(current) || current < 0) {
        throw new Error("Importo già risparmiato non valido");
      }

      const deadline = form.deadline || null;
      const status =
        current >= target
          ? ("completed" as const)
          : editing?.status === "completed"
            ? ("active" as const)
            : (editing?.status ?? "active");

      if (editing) {
        const { data, error } = await supabase
          .from("goals")
          .update({
            name,
            target_amount: target,
            current_amount: current,
            deadline,
            status,
          })
          .eq("id", editing.id)
          .eq("user_id", user.id)
          .select()
          .single();
        if (error) throw error;

        await writeAudit({
          entity_type: "goal",
          entity_id: editing.id,
          action: "update",
          before_data: editing as unknown as Record<string, unknown>,
          after_data: data as unknown as Record<string, unknown>,
        });

        toast.success("Obiettivo aggiornato");
      } else {
        const { data, error } = await supabase
          .from("goals")
          .insert({
            user_id: user.id,
            name,
            target_amount: target,
            current_amount: current,
            deadline,
            settled: false,
            status,
          })
          .select()
          .single();
        if (error) throw error;

        await writeAudit({
          entity_type: "goal",
          entity_id: data.id,
          action: "create",
          after_data: data as unknown as Record<string, unknown>,
        });

        toast.success("Obiettivo creato");
      }
      setOpen(false);
      setEditing(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function removeGoal(goal: Goal) {
    if (!window.confirm(`Eliminare l’obiettivo «${goal.name}»?`)) return;
    setDeletingId(goal.id);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", goal.id)
        .eq("user_id", user.id);
      if (error) throw error;

      await writeAudit({
        entity_type: "goal",
        entity_id: goal.id,
        action: "delete",
        before_data: goal as unknown as Record<string, unknown>,
      });

      toast.success("Obiettivo eliminato");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setDeletingId(null);
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

  function pickSavingsAccount(goal: Goal): Account | undefined {
    if (goal.account_id) {
      const linked = savingsAccounts.find((a) => a.id === goal.account_id);
      if (linked) return linked;
    }
    return (
      savingsAccounts.find((a) => /salvadan/i.test(a.name)) ||
      savingsAccounts[0]
    );
  }

  async function confirmSettle() {
    if (!settleGoal) return;
    setSettling(true);
    try {
      const supabase = createClient();
      const amount = Number(settleGoal.current_amount);
      const savings = pickSavingsAccount(settleGoal);
      const shouldDeduct = deductFromSavings && !!savings && amount > 0;

      if (shouldDeduct && savings) {
        if (Number(savings.balance) < amount) {
          throw new Error(
            `Saldo insufficiente su ${savings.name} (${formatCurrency(Number(savings.balance))}).`
          );
        }
        await adjustAccountBalance(savings.id, -amount);
      }

      const settledAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("goals")
        .update({
          settled: true,
          settled_at: settledAt,
          status: "completed",
        })
        .eq("id", settleGoal.id)
        .select()
        .single();
      if (error) throw error;

      await writeAudit({
        entity_type: "goal",
        entity_id: settleGoal.id,
        action: "settle",
        before_data: settleGoal as unknown as Record<string, unknown>,
        after_data: {
          ...(data as Record<string, unknown>),
          deducted_account_id: shouldDeduct ? savings?.id ?? null : null,
          deducted_amount: shouldDeduct ? amount : 0,
        },
      });

      toast.success(
        shouldDeduct && savings
          ? `Saldato: −${formatCurrency(amount)} da ${savings.name}`
          : "Obiettivo segnato come saldato"
      );
      setSettleGoal(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSettling(false);
    }
  }

  const openGoals = goals.filter((g) => !isGoalSettled(g));
  const settledGoals = goals.filter((g) => isGoalSettled(g));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Obiettivi"
        description="Es. viaggio in Islanda: target + scadenza → piano di quanto mettere da parte e dove tagliare"
        actions={
          <Button onClick={openCreate} className="min-h-touch">
            Nuovo obiettivo
          </Button>
        }
      />

      {savingsPlans.length > 0 && (
        <div className="space-y-3">
          {savingsPlans.slice(0, 3).map((plan) => (
            <GoalSavingsPlanCard key={plan.goalId} plan={plan} />
          ))}
        </div>
      )}

      {goals.length === 0 ? (
        <EmptyState
          icon={<Target className="h-6 w-6" />}
          title="Nessun obiettivo"
          description="Crea un obiettivo con importo e data (es. Islanda 1.200 € tra 4 mesi) per ricevere il piano di risparmio."
          action={<Button onClick={openCreate}>Nuovo obiettivo</Button>}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {openGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onAdd={(d) => addProgress(g, d)}
                onSettle={(goal) => {
                  setDeductFromSavings(savingsAccounts.length > 0);
                  setSettleGoal(goal);
                }}
                onEdit={() => openEdit(g)}
                onDelete={
                  deletingId === g.id ? undefined : () => void removeGoal(g)
                }
              />
            ))}
          </div>
          {settledGoals.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Saldati
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {settledGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    showTrajectory={false}
                    onEdit={() => openEdit(g)}
                    onDelete={
                      deletingId === g.id
                        ? undefined
                        : () => void removeGoal(g)
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ResponsiveFormShell
        open={open}
        onOpenChange={handleFormOpenChange}
        title={editing ? "Modifica obiettivo" : "Nuovo obiettivo"}
        footer={
          <Button
            onClick={save}
            disabled={saving || !form.name || !form.target_amount}
            className="w-full sm:w-auto min-h-touch"
          >
            {saving
              ? "Salvataggio…"
              : editing
                ? "Aggiorna"
                : "Salva"}
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
          <Label>Scadenza (consigliata per il piano)</Label>
          <Input
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            className="min-h-touch"
          />
          <p className="text-xs text-muted-foreground">
            Con scadenza calcoliamo quanto mettere da parte al mese e suggeriamo
            da quali categorie tagliare (es. ristoranti/abbonamenti).
          </p>
        </div>
      </ResponsiveFormShell>

      <Dialog
        open={!!settleGoal}
        onOpenChange={(v) => {
          if (!v) setSettleGoal(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Segna come Saldato</DialogTitle>
          </DialogHeader>
          {settleGoal && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  {settleGoal.name}
                </span>{" "}
                è raggiunto (
                {formatCurrency(Number(settleGoal.current_amount))}). Saldato
                significa che questi euro sono stati spesi e non sono più
                disponibili.
              </p>
              {savingsAccounts.length > 0 ? (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={deductFromSavings}
                    onChange={(e) => setDeductFromSavings(e.target.checked)}
                  />
                  <span>
                    Sottrai{" "}
                    {formatCurrency(Number(settleGoal.current_amount))} da{" "}
                    <span className="font-medium text-foreground">
                      {pickSavingsAccount(settleGoal)?.name ?? "Salvadanaio"}
                    </span>{" "}
                    (consigliato: così la disponibilità totale scende)
                  </span>
                </label>
              ) : (
                <p>
                  Nessun conto risparmio trovato: verrà solo segnato come
                  saldato, senza movimentare i conti.
                </p>
              )}
              {isGoalReached(settleGoal) && (
                <p className="text-xs">
                  Finché non è saldato, l&apos;importo resta nel totale
                  Obiettivi in Home (riservato ma ancora disponibile).
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setSettleGoal(null)}
              disabled={settling}
            >
              Annulla
            </Button>
            <Button onClick={confirmSettle} disabled={settling}>
              {settling ? "Salvataggio…" : "Conferma Saldato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
