"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type {
  Account,
  Category,
  RecurringTransaction,
  Transaction,
} from "@/types/database";
import {
  detectRecurringFromHistory,
  type DetectedRecurring,
} from "@/lib/finance/detect-recurring";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DISMISS_KEY = "mf-dismissed-recurring-suggestions";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
}

function confidenceLabel(c: number): string {
  if (c >= 0.75) return "Molto probabile";
  if (c >= 0.55) return "Probabile";
  return "Da verificare";
}

export function RecurringSuggestions({
  transactions,
  existing,
  accounts,
  categories: initialCategories,
}: {
  transactions: Transaction[];
  existing: RecurringTransaction[];
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  const [categoryById, setCategoryById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    setCategories(initialCategories);
  }, [initialCategories]);

  useEffect(() => {
    setDismissed(readDismissed());
    setReady(true);
  }, []);

  const suggestions = useMemo(() => {
    const found = detectRecurringFromHistory(transactions, existing, {
      types: ["expense", "income"],
      minOccurrences: 3,
    });
    if (!ready) return found;
    return found.filter((s) => !dismissed.has(s.id));
  }, [transactions, existing, dismissed, ready]);

  useEffect(() => {
    setCategoryById((prev) => {
      const next = { ...prev };
      for (const s of suggestions) {
        if (next[s.id] === undefined) {
          next[s.id] = s.suggested_category_id ?? "";
        }
      }
      return next;
    });
  }, [suggestions]);

  if (suggestions.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  }

  async function ensureCategory(
    name: string,
    type: "income" | "expense"
  ): Promise<string | null> {
    const existingCat = categories.find(
      (c) =>
        c.type === type && c.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (existingCat) return existingCat.id;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Non autenticato");
    const { data, error } = await supabase
      .from("categories")
      .insert({
        user_id: user.id,
        name: name.trim(),
        type,
        icon: type === "expense" ? "tag" : "plus-circle",
        color: type === "expense" ? "#64748b" : "#16a34a",
        is_system: false,
      })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("Impossibile creare la categoria");
    setCategories((prev) => [...prev, data as Category]);
    return data.id as string;
  }

  async function confirm(s: DetectedRecurring) {
    setBusyId(s.id);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      let categoryId = categoryById[s.id] || "";
      const pendingName = (newCategoryName[s.id] ?? "").trim();
      if (!categoryId && pendingName) {
        categoryId = (await ensureCategory(pendingName, s.type)) ?? "";
      }

      const accountId =
        accounts.find((a) => a.id === s.account_id)?.id ?? accounts[0]?.id;
      if (!accountId) throw new Error("Nessun conto disponibile");

      const { error } = await supabase.from("recurring_transactions").insert({
        user_id: user.id,
        description: s.description,
        amount: s.amount,
        type: s.type,
        frequency: s.frequency,
        account_id: accountId,
        category_id: categoryId || null,
        next_due_date: s.next_due_date,
      });
      if (error) throw error;

      dismiss(s.id);
      toast.success(`«${s.description}» aggiunto ai ricorrenti`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mf-surface space-y-3 border border-primary/15 bg-primary/[0.04] p-4">
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Rilevati dai tuoi movimenti
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Sembra che queste uscite/entrate si ripetano ogni mese. Confermale e
          scegli la categoria — oppure ignora.
        </p>
      </div>

      <div className="space-y-3">
        {suggestions.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border bg-card p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium truncate">{s.description}</p>
                    <Badge variant="secondary">
                      {s.type === "expense" ? "Uscita" : "Entrata"}
                    </Badge>
                    <Badge variant="outline">{confidenceLabel(s.confidence)}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(s.amount)} / mese · vista {s.occurrence_count}{" "}
                    volte (giorno ~{s.day_of_month}) · prossimo {s.next_due_date}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  aria-label={`Ignora ${s.description}`}
                  onClick={() => dismiss(s.id)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={categoryById[s.id] || "__none__"}
                  onValueChange={(v) =>
                    setCategoryById((prev) => ({
                      ...prev,
                      [s.id]: v === "__none__" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="min-h-touch">
                    <SelectValue placeholder="Scegli categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuna</SelectItem>
                    {categories
                      .filter((c) => c.type === s.type)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  value={newCategoryName[s.id] ?? ""}
                  onChange={(e) =>
                    setNewCategoryName((prev) => ({
                      ...prev,
                      [s.id]: e.target.value,
                    }))
                  }
                  placeholder="O crea nuova categoria…"
                  className="min-h-touch"
                />
              </div>

              <Button
                className="w-full min-h-touch"
                disabled={busyId === s.id}
                onClick={() => void confirm(s)}
              >
                {busyId === s.id ? "Aggiunta…" : "Aggiungi ai ricorrenti"}
              </Button>
            </div>
        ))}
      </div>
    </section>
  );
}
