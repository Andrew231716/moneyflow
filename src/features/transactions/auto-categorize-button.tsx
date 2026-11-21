"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import { toast } from "sonner";
import type {
  Category,
  ClassificationRule,
  Transaction,
} from "@/types/database";
import { planAutoCategorize } from "@/lib/finance/classification";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AutoCategorizeButton({
  transactions,
  categories,
  rules,
  className,
  variant = "outline",
  size = "sm",
  label,
}: {
  transactions: Transaction[];
  categories: Category[];
  rules: ClassificationRule[];
  className?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  size?: "sm" | "default";
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const plan = planAutoCategorize(transactions, rules, categories);
  if (plan.length === 0) return null;

  async function apply() {
    setBusy(true);
    try {
      const supabase = createClient();
      let ok = 0;
      // Batch in chunks to avoid payload limits
      const chunkSize = 40;
      for (let i = 0; i < plan.length; i += chunkSize) {
        const chunk = plan.slice(i, i + chunkSize);
        const results = await Promise.all(
          chunk.map((item) =>
            supabase
              .from("transactions")
              .update({
                category_id: item.categoryId,
                category_source: "rule",
              })
              .eq("id", item.transactionId)
              .is("category_id", null)
          )
        );
        for (const r of results) {
          if (!r.error) ok += 1;
        }
      }
      if (ok === 0) throw new Error("Nessuna categoria applicata");
      toast.success(
        `Categorizzati ${ok} moviment${ok === 1 ? "o" : "i"} in automatico`
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className ?? "min-h-touch"}
      disabled={busy}
      onClick={() => void apply()}
    >
      <Tags className="h-3.5 w-3.5" />
      {busy
        ? "Applico…"
        : label ?? `Auto-categorie (${plan.length})`}
    </Button>
  );
}
