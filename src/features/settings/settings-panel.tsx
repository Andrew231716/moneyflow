"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Category, ClassificationRule } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { writeAudit } from "@/lib/data/mutations";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SettingsPanel({
  categories,
  rules,
}: {
  categories: Category[];
  rules: ClassificationRule[];
}) {
  const router = useRouter();
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<"income" | "expense">("expense");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function addCategory() {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase.from("categories").insert({
        user_id: user.id,
        name: catName.trim(),
        type: catType,
      });
      if (error) throw error;
      toast.success("Categoria aggiunta");
      setCatName("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  async function addRule() {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase.from("classification_rules").insert({
        user_id: user.id,
        pattern: rulePattern.trim(),
        category_id: ruleCategory,
        match_type: "contains",
        priority: 5,
      });
      if (error) throw error;
      toast.success("Regola creata");
      setRulePattern("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    }
  }

  async function undoLast() {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const { data: action } = await supabase
        .from("assistant_actions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!action) {
        toast.message("Nessuna azione da annullare");
        return;
      }

      const payload = action.payload as Record<string, unknown>;

      if (action.action_type === "create_transaction") {
        const id = payload.transaction_id as string;
        if (id) {
          const { data: tx } = await supabase
            .from("transactions")
            .select("*")
            .eq("id", id)
            .maybeSingle();
          if (tx) {
            const delta =
              tx.type === "income"
                ? -Number(tx.amount)
                : tx.type === "expense"
                  ? Number(tx.amount)
                  : 0;
            await supabase.from("transactions").delete().eq("id", id);
            if (delta !== 0) {
              const { data: acc } = await supabase
                .from("accounts")
                .select("balance")
                .eq("id", tx.account_id)
                .single();
              if (acc) {
                await supabase
                  .from("accounts")
                  .update({ balance: Number(acc.balance) + delta })
                  .eq("id", tx.account_id);
              }
            }
          }
        }
      } else if (action.action_type === "bulk_categorize") {
        const before =
          (payload.before as { id: string; category_id: string | null }[]) ?? [];
        for (const b of before) {
          await supabase
            .from("transactions")
            .update({ category_id: b.category_id, category_source: "system" })
            .eq("id", b.id);
        }
      } else if (action.action_type === "bulk_rename") {
        const before =
          (payload.before as { id: string; description: string }[]) ?? [];
        for (const b of before) {
          await supabase
            .from("transactions")
            .update({ description: b.description })
            .eq("id", b.id);
        }
      }

      await supabase
        .from("assistant_actions")
        .update({ status: "undone", undone_at: new Date().toISOString() })
        .eq("id", action.id);

      await writeAudit({
        entity_type: "assistant_action",
        entity_id: action.id,
        action: "undo",
        before_data: action.payload as Record<string, unknown>,
      });

      toast.success("Ultima azione annullata");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore undo");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Sessione e sicurezza</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void logout()}>
            Esci
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Undo</CardTitle>
          <CardDescription>
            Annulla l&apos;ultima azione dell&apos;assistente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="secondary" onClick={() => void undoLast()}>
            Annulla ultima modifica
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categorie</TabsTrigger>
          <TabsTrigger value="rules">Regole</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Nuova categoria"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={catType}
              onValueChange={(v) => setCatType(v as "income" | "expense")}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expense">Uscita</SelectItem>
                <SelectItem value="income">Entrata</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => void addCategory()} disabled={!catName.trim()}>
              Aggiungi
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Badge key={c.id} variant="secondary">
                {c.name} · {c.type}
              </Badge>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="rules" className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Pattern</Label>
              <Input
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
                placeholder="Esselunga"
              />
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={ruleCategory} onValueChange={setRuleCategory}>
                <SelectTrigger>
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
            <div className="flex items-end">
              <Button
                onClick={() => void addRule()}
                disabled={!rulePattern.trim() || !ruleCategory}
              >
                Aggiungi regola
              </Button>
            </div>
          </div>
          <ul className="space-y-1 text-sm">
            {rules.map((r) => (
              <li key={r.id} className="rounded-md border px-3 py-2">
                <code>{r.pattern}</code> → {r.category?.name ?? r.category_id}{" "}
                <span className="text-muted-foreground">(prio {r.priority})</span>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>
    </div>
  );
}
