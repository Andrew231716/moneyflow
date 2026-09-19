"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Landmark, Plus, Pencil, Archive } from "lucide-react";
import { toast } from "sonner";
import type { Account, AccountType } from "@/types/database";
import { formatCurrency } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/data/mutations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const typeLabels: Record<AccountType, string> = {
  bank: "Banca",
  card: "Carta",
  cash: "Contanti",
  savings: "Risparmi",
};

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Totale:{" "}
          <span className="font-semibold text-foreground">
            {formatCurrency(
              accounts.reduce((s, a) => s + Number(a.balance), 0)
            )}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/accounts/connect-bank">
              <Landmark className="h-4 w-4" />
              Collega banca
            </Link>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Nuovo conto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Modifica conto" : "Nuovo conto"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Conto corrente"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: v as AccountType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(typeLabels) as AccountType[]).map((t) => (
                        <SelectItem key={t} value={t}>
                          {typeLabels[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Saldo</Label>
                  <Input
                    value={form.balance}
                    onChange={(e) => setForm({ ...form, balance: e.target.value })}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Colore</Label>
                  <Input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-10 w-20 p-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={save} disabled={saving || !form.name.trim()}>
                  {saving ? "Salvataggio…" : "Salva"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className="overflow-hidden">
            <div className="h-1.5" style={{ background: a.color }} />
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">{a.name}</CardTitle>
                <Badge variant="secondary" className="mt-1">
                  {typeLabels[a.type]}
                </Badge>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => archive(a)}>
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tracking-tight">
                {formatCurrency(Number(a.balance))}
              </p>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3 border-dashed">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Nessun conto. Creane uno o collega una banca.
            </CardContent>
          </Card>
        )}
      </div>

      <BankConnectionsPanel />
    </div>
  );
}
