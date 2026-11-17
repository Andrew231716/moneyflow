"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Debt } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import {
  calcOpenDebtsTotal,
  isDebtOpen,
} from "@/lib/finance/engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PageHeader,
  EmptyState,
  AmountInput,
  MoneyValue,
  ResponsiveFormShell,
} from "@/components/money";

export function DebtsManager({ debts }: { debts: Debt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", notes: "", due_date: "" });
  const [saving, setSaving] = useState(false);

  const openDebts = debts.filter(isDebtOpen);
  const paidDebts = debts.filter((d) => !isDebtOpen(d));
  const openTotal = calcOpenDebtsTotal(debts);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", amount: "", notes: "", due_date: "" });
    setOpen(true);
  }

  function openEdit(d: Debt) {
    setEditing(d);
    setForm({
      name: d.name,
      amount: String(d.amount),
      notes: d.notes ?? "",
      due_date: d.due_date ?? "",
    });
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

      const amount = Number.parseFloat(form.amount.replace(",", "."));
      if (!form.name.trim()) throw new Error("Indica un nome");
      if (!Number.isFinite(amount) || amount < 0) {
        throw new Error("Importo non valido");
      }

      if (editing) {
        const { error } = await supabase
          .from("debts")
          .update({
            name: form.name.trim(),
            amount,
            notes: form.notes.trim() || null,
            due_date: form.due_date || null,
          })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Debito aggiornato");
      } else {
        const { error } = await supabase.from("debts").insert({
          user_id: user.id,
          name: form.name.trim(),
          amount,
          notes: form.notes.trim() || null,
          due_date: form.due_date || null,
        });
        if (error) throw error;
        toast.success("Debito aggiunto");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(d: Debt) {
    const supabase = createClient();
    const { error } = await supabase
      .from("debts")
      .update({ paid_at: new Date().toISOString() })
      .eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Debito segnato come saldato");
      router.refresh();
    }
  }

  async function payPartial(d: Debt) {
    const raw = window.prompt(
      `Quanto hai pagato di «${d.name}»? (resto ${formatCurrency(Number(d.amount))})`,
      ""
    );
    if (raw == null) return;
    const paid = Number.parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(paid) || paid <= 0) {
      toast.error("Importo non valido");
      return;
    }
    const remaining = Math.round((Number(d.amount) - paid) * 100) / 100;
    const supabase = createClient();
    if (remaining <= 0) {
      const note = [d.notes, `Saldato con ultimo pagamento ${formatCurrency(paid)}`]
        .filter(Boolean)
        .join(" · ");
      const { error } = await supabase
        .from("debts")
        .update({
          amount: 0,
          paid_at: new Date().toISOString(),
          notes: note || null,
        })
        .eq("id", d.id);
      if (error) toast.error(error.message);
      else {
        toast.success("Debito saldato");
        router.refresh();
      }
      return;
    }
    const note = [
      d.notes,
      `Pagato ${formatCurrency(paid)} il ${new Date().toLocaleDateString("it-IT")}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const { error } = await supabase
      .from("debts")
      .update({ amount: remaining, notes: note })
      .eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Resta ${formatCurrency(remaining)}`);
      router.refresh();
    }
  }

  async function remove(d: Debt) {
    if (!confirm(`Eliminare «${d.name}»?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("debts").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Debito eliminato");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Debiti da saldare"
        description="Passività manuali · non riducono la disponibilità"
        actions={
          <Button onClick={openCreate} className="min-h-touch">
            <Plus className="h-4 w-4" />
            Nuovo debito
          </Button>
        }
      />

      <div className="mf-surface p-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Totale aperti</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Soldi da restituire / pagare
          </p>
        </div>
        <MoneyValue amount={openTotal} size="lg" tone="danger" />
      </div>

      {debts.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-6 w-6" />}
          title="Nessun debito"
          description="Aggiungi un importo da saldare (prestito, rata, amico…)."
          action={<Button onClick={openCreate}>Aggiungi debito</Button>}
        />
      ) : (
        <>
          {openDebts.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight">Aperti</h2>
              <ul className="space-y-2">
                {openDebts.map((d) => (
                  <DebtRow
                    key={d.id}
                    debt={d}
                    onEdit={() => openEdit(d)}
                    onPaid={() => void markPaid(d)}
                    onPartial={() => void payPartial(d)}
                    onDelete={() => void remove(d)}
                  />
                ))}
              </ul>
            </section>
          )}
          {paidDebts.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
                Saldati
              </h2>
              <ul className="space-y-2 opacity-70">
                {paidDebts.map((d) => (
                  <DebtRow
                    key={d.id}
                    debt={d}
                    onEdit={() => openEdit(d)}
                    onDelete={() => void remove(d)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ResponsiveFormShell
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Modifica debito" : "Nuovo debito"}
        footer={
          <Button
            className="w-full sm:w-auto min-h-touch"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Salvataggio…" : editing ? "Salva" : "Aggiungi"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="debt-name">Nome</Label>
          <Input
            id="debt-name"
            name="mf-debt-label"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Es. Prestito mamma"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            enterKeyHint="next"
          />
        </div>
        <AmountInput
          id="debt-amount"
          label="Importo"
          name="mf-debt-amount"
          value={form.amount}
          onChange={(amount) => setForm({ ...form, amount })}
        />
        <div className="space-y-2">
          <Label htmlFor="debt-due-date">Scadenza (opzionale)</Label>
          <Input id="debt-due-date" type="date" value={form.due_date}
            onChange={(event) => setForm({ ...form, due_date: event.target.value })} />
          <Label htmlFor="debt-notes">Note (opzionale)</Label>
          <Input
            id="debt-notes"
            name="mf-debt-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Scadenza, dettaglio…"
            autoComplete="off"
          />
        </div>
      </ResponsiveFormShell>
    </div>
  );
}

function DebtRow({
  debt,
  onEdit,
  onPaid,
  onPartial,
  onDelete,
}: {
  debt: Debt;
  onEdit: () => void;
  onPaid?: () => void;
  onPartial?: () => void;
  onDelete: () => void;
}) {
  const open = isDebtOpen(debt);
  return (
    <li className="mf-surface space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium truncate">{debt.name}</p>
          {debt.due_date && open && (
            <p className="text-xs text-muted-foreground">
              Scadenza {debt.due_date.split("-").reverse().join("/")}
            </p>
          )}
          {debt.notes && (
            <p className="text-xs text-muted-foreground line-clamp-2">{debt.notes}</p>
          )}
          {!open && debt.paid_at && (
            <p className="text-[11px] text-muted-foreground">Saldato</p>
          )}
        </div>
        <MoneyValue
          amount={Number(debt.amount)}
          size="sm"
          tone={open ? "danger" : "default"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {open && onPartial && (
          <Button size="sm" variant="outline" className="min-h-touch" onClick={onPartial}>
            Paga parziale
          </Button>
        )}
        {open && onPaid && (
          <Button size="sm" variant="secondary" className="min-h-touch" onClick={onPaid}>
            Saldato
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="min-h-touch min-w-touch ml-auto"
          aria-label="Modifica"
          onClick={onEdit}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="min-h-touch min-w-touch text-destructive"
          aria-label="Elimina"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}
