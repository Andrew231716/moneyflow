"use client";

import { useState } from "react";
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
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const freqLabels: Record<RecurringFrequency, string> = {
  weekly: "Settimanale",
  monthly: "Mensile",
  quarterly: "Trimestrale",
  semiannual: "Semestrale",
  yearly: "Annuale",
};

export function RecurringManager({
  items,
  accounts,
  categories,
}: {
  items: RecurringTransaction[];
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const totals = calcRecurringTotals(items);
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
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-3 text-sm">
          <span>
            Mensile netto:{" "}
            <strong className={totals.monthly >= 0 ? "text-success" : "text-destructive"}>
              {formatCurrency(totals.monthly)}
            </strong>
          </span>
          <span className="text-muted-foreground">
            Annuo: {formatCurrency(totals.yearly)}
          </span>
        </div>
        <Button onClick={() => setOpen(true)}>Nuovo ricorrente</Button>
      </div>

      <div className="space-y-2">
        {items.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
              <div>
                <CardTitle className="text-base">{r.description}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Prossimo: {r.next_due_date} · {r.account?.name}
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-semibold ${
                    r.type === "income" ? "text-success" : "text-destructive"
                  }`}
                >
                  {formatCurrency(Number(r.amount))}
                </p>
                <Badge variant="secondary">{freqLabels[r.frequency]}</Badge>
              </div>
            </CardHeader>
          </Card>
        ))}
        {items.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nessuna ricorrenza.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimento ricorrente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Importo</Label>
              <Input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as "income" | "expense" })}
              >
                <SelectTrigger>
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
                <SelectTrigger>
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
              <Label>Conto</Label>
              <Select
                value={form.account_id}
                onValueChange={(v) => setForm({ ...form, account_id: v })}
              >
                <SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nessuna</SelectItem>
                  {categories
                    .filter((c) => c.type === form.type)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Prossima scadenza</Label>
              <Input
                type="date"
                value={form.next_due_date}
                onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving || !form.description || !form.amount}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
