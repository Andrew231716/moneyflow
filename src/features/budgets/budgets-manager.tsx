"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { BudgetProgress, Category } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, toMonthStart } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

const stateBadge = {
  ok: "success" as const,
  warn: "warning" as const,
  critical: "warning" as const,
  over: "destructive" as const,
};

const stateLabel = {
  ok: "<70%",
  warn: "70–89%",
  critical: "90–99%",
  over: "≥100%",
};

export function BudgetsManager({
  progress,
  categories,
}: {
  progress: BudgetProgress[];
  categories: Category[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const { error } = await supabase.from("budgets").upsert(
        {
          user_id: user.id,
          category_id: categoryId,
          amount: Number.parseFloat(amount.replace(",", ".")),
          month: toMonthStart(new Date()),
        },
        { onConflict: "user_id,category_id,month" }
      );
      if (error) throw error;
      toast.success("Budget salvato");
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
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>Nuovo budget</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {progress.map((b) => (
          <Card key={b.budget.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">
                {b.budget.category?.name ?? "Categoria"}
              </CardTitle>
              <Badge variant={stateBadge[b.state]}>{stateLabel[b.state]}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress
                value={Math.min(100, b.percent)}
                indicatorClassName={
                  b.state === "over"
                    ? "bg-destructive"
                    : b.state === "critical"
                      ? "bg-orange-500"
                      : b.state === "warn"
                        ? "bg-warning"
                        : "bg-success"
                }
              />
              <p className="text-sm text-muted-foreground">
                {formatCurrency(b.spent)} / {formatCurrency(Number(b.budget.amount))}
              </p>
            </CardContent>
          </Card>
        ))}
        {progress.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-full">
            Nessun budget per questo mese.
          </p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Budget mensile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Categoria spesa</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
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
            <div className="space-y-2">
              <Label>Importo</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving || !categoryId || !amount}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
