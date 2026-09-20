"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { toast } from "sonner";
import type { Account, Goal } from "@/types/database";
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
} from "@/components/money";

export function GoalsManager({
  goals,
  savingsAccounts = [],
}: {
  goals: Goal[];
  savingsAccounts?: Account[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    current_amount: "0",
    deadline: "",
  });
  const [saving, setSaving] = useState(false);
  const [settleGoal, setSettleGoal] = useState<Goal | null>(null);
  const [deductFromSavings, setDeductFromSavings] = useState(true);
  const [settling, setSettling] = useState(false);

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
        current_amount:
          Number.parseFloat(form.current_amount.replace(",", ".")) || 0,
        deadline: form.deadline || null,
        settled: false,
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
        description="Raggiunto = fondi ancora disponibili · Saldato = già spesi"
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
                  <GoalCard key={g.id} goal={g} showTrajectory={false} />
                ))}
              </div>
            </div>
          )}
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
