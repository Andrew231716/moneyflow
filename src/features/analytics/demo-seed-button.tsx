"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { format, subDays } from "date-fns";

export function DemoSeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED !== "true") return null;

  async function seed() {
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const { data: accounts, error: aErr } = await supabase
        .from("accounts")
        .insert([
          {
            user_id: user.id,
            name: "Conto Corrente",
            type: "bank",
            balance: 2450.5,
            color: "#0d9488",
          },
          {
            user_id: user.id,
            name: "Carta",
            type: "card",
            balance: 320.0,
            color: "#6366f1",
          },
          {
            user_id: user.id,
            name: "Risparmi",
            type: "savings",
            balance: 5000,
            color: "#16a34a",
          },
        ])
        .select();
      if (aErr) throw aErr;

      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .eq("user_id", user.id);

      const findCat = (name: string) => cats?.find((c) => c.name === name)?.id ?? null;
      const bank = accounts![0].id;
      const card = accounts![1].id;
      const today = new Date();

      const txs = [
        {
          type: "income",
          amount: 2200,
          description: "Stipendio",
          category_id: findCat("Stipendio"),
          account_id: bank,
          daysAgo: 5,
        },
        {
          type: "expense",
          amount: 87.4,
          description: "Esselunga spesa",
          category_id: findCat("Alimentari"),
          account_id: card,
          daysAgo: 2,
        },
        {
          type: "expense",
          amount: 45,
          description: "Eni stazione",
          category_id: findCat("Trasporti"),
          account_id: card,
          daysAgo: 4,
        },
        {
          type: "expense",
          amount: 12.99,
          description: "Netflix",
          category_id: findCat("Abbonamenti"),
          account_id: bank,
          daysAgo: 8,
        },
        {
          type: "expense",
          amount: 32.5,
          description: "Ristorante Centro",
          category_id: findCat("Ristoranti"),
          account_id: card,
          daysAgo: 1,
        },
        {
          type: "expense",
          amount: 120,
          description: "ENEL bolletta",
          category_id: findCat("Bollette"),
          account_id: bank,
          daysAgo: 10,
        },
      ];

      await supabase.from("transactions").insert(
        txs.map((t) => ({
          user_id: user.id,
          account_id: t.account_id,
          category_id: t.category_id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          date: format(subDays(today, t.daysAgo), "yyyy-MM-dd"),
          source: "manual",
          category_source: "manual",
        }))
      );

      const alimentari = findCat("Alimentari");
      if (alimentari) {
        await supabase.from("budgets").insert({
          user_id: user.id,
          category_id: alimentari,
          amount: 300,
          month: format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd"),
        });
      }

      await supabase.from("goals").insert({
        user_id: user.id,
        name: "Fondo emergenza",
        target_amount: 10000,
        current_amount: 5000,
        color: "#0d9488",
      });

      toast.success("Dati demo creati");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore seed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" onClick={seed} disabled={loading}>
      {loading ? "Creazione…" : "Carica dati demo"}
    </Button>
  );
}
