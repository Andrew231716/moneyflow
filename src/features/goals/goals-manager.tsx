"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Goal } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { calcGoalProgress } from "@/lib/finance/engine";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Nuovo obiettivo</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {goals.map((g) => {
          const p = calcGoalProgress(g);
          return (
            <Card key={g.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{g.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={p.percent} />
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(Number(g.current_amount))} /{" "}
                  {formatCurrency(Number(g.target_amount))}
                </p>
                {g.status === "active" && (
                  <Button size="sm" variant="secondary" onClick={() => addProgress(g, 50)}>
                    +50 €
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
        {goals.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessun obiettivo.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo obiettivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Target</Label>
              <Input
                value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Già risparmiato</Label>
              <Input
                value={form.current_amount}
                onChange={(e) => setForm({ ...form, current_amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Scadenza</Label>
              <Input
                type="date"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving || !form.name || !form.target_amount}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
