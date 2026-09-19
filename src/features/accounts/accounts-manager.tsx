"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Account, AccountType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/data/mutations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BankConnectionsPanel } from "@/features/open-banking/components/bank-connections-panel";
import {
  PageHeader,
  AccountCard,
  accountTypeLabels,
  EmptyState,
  MoneyValue,
  AmountInput,
  ResponsiveFormShell,
} from "@/components/money";

const emptyForm = {
  name: "",
  type: "bank" as AccountType,
  balance: "0",
  color: "#0d9488",
};

export function AccountsManager({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const total = accounts.reduce((s, a) => s + Number(a.balance), 0);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(a: Account) {
    setEditing(a);
    setForm({
      name: a.name,
      type: a.type,
      balance: String(a.balance),
      color: a.color,
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

      const payload = {
        name: form.name.trim(),
        type: form.type,
        balance: Number.parseFloat(form.balance.replace(",", ".")) || 0,
        color: form.color,
        user_id: user.id,
      };

      if (editing) {
        const { error } = await supabase
          .from("accounts")
          .update({
            name: payload.name,
            type: payload.type,
            balance: payload.balance,
            color: payload.color,
          })
          .eq("id", editing.id);
        if (error) throw error;
        await writeAudit({
          entity_type: "account",
          entity_id: editing.id,
          action: "update",
          before_data: editing as unknown as Record<string, unknown>,
          after_data: payload,
        });
        toast.success("Conto aggiornato");
      } else {
        const { data, error } = await supabase
          .from("accounts")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        await writeAudit({
          entity_type: "account",
          entity_id: data.id,
          action: "create",
          after_data: data,
        });
        toast.success("Conto creato");
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setSaving(false);
    }
  }

  async function archive(a: Account) {
    const supabase = createClient();
    const { error } = await supabase
      .from("accounts")
      .update({ is_archived: true })
      .eq("id", a.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Conto archiviato");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Conti"
        description="Saldi e collegamenti bancari"
        actions={
          <>
            <Button asChild variant="outline" className="min-h-touch">
              <Link href="/accounts/connect-bank">
                <Landmark className="h-4 w-4" />
                Collega banca
              </Link>
            </Button>
            <Button onClick={openCreate} className="min-h-touch">
              <Plus className="h-4 w-4" />
              Nuovo conto
            </Button>
          </>
        }
      />

      <div className="mf-surface p-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Totale disponibilità</p>
        <MoneyValue amount={total} size="lg" />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="Nessun conto"
          description="Creane uno manualmente o collega una banca con Open Banking."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={openCreate}>Nuovo conto</Button>
              <Button asChild variant="outline">
                <Link href="/accounts/connect-bank">Collega banca</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              onEdit={() => openEdit(a)}
              onArchive={() => archive(a)}
            />
          ))}
        </div>
      )}

      <BankConnectionsPanel />

      <ResponsiveFormShell
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Modifica conto" : "Nuovo conto"}
        footer={
          <Button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="w-full sm:w-auto min-h-touch"
          >
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        }
      >
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Conto corrente"
            className="min-h-touch"
          />
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select
            value={form.type}
            onValueChange={(v) => setForm({ ...form, type: v as AccountType })}
          >
            <SelectTrigger className="min-h-touch">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(accountTypeLabels) as AccountType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {accountTypeLabels[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <AmountInput
          label="Saldo"
          value={form.balance}
          onChange={(balance) => setForm({ ...form, balance })}
        />
        <div className="space-y-2">
          <Label>Colore</Label>
          <Input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-11 w-20 p-1"
          />
        </div>
      </ResponsiveFormShell>
    </div>
  );
}
