"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import type { Transaction } from "@/types/database";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Shows OB-detected internal transfer pairs and confirms via
 * POST /api/open-banking/confirm-transfer (marks both as type=transfer).
 */
export function TransferSuggestions({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pairs = useMemo(() => {
    const byId = new Map(transactions.map((t) => [t.id, t]));
    const seen = new Set<string>();
    const result: { a: Transaction; b: Transaction }[] = [];

    for (const tx of transactions) {
      if (!tx.possible_transfer_match_id) continue;
      if (tx.type === "transfer") continue;
      const other = byId.get(tx.possible_transfer_match_id);
      if (!other || other.type === "transfer") continue;
      const key = [tx.id, other.id].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ a: tx, b: other });
    }
    return result;
  }, [transactions]);

  if (pairs.length === 0) return null;

  async function confirm(a: Transaction, b: Transaction) {
    setBusyId(a.id);
    try {
      const res = await fetch("/api/open-banking/confirm-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: a.id,
          matched_transaction_id: b.id,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };
      if (!res.ok) {
        throw new Error(json.error || "Conferma non riuscita");
      }
      toast.success("Trasferimento confermato — escluso da entrate/uscite");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowLeftRight className="h-4 w-4" />
          Possibili trasferimenti interni
        </CardTitle>
        <CardDescription>
          Rilevati dalla sync bancaria. Conferma solo se sono movimenti tra i tuoi conti —
          non conteranno come entrate/uscite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {pairs.map(({ a, b }) => (
          <div
            key={`${a.id}-${b.id}`}
            className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{a.date}</Badge>
                <span className="truncate font-medium">
                  {a.description || a.merchant || "Movimento A"}
                </span>
                <span className="text-muted-foreground">↔</span>
                <span className="truncate font-medium">
                  {b.description || b.merchant || "Movimento B"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(Number(a.amount))} · conti{" "}
                {a.account?.name ?? "—"} / {b.account?.name ?? "—"}
              </p>
            </div>
            <Button
              size="sm"
              disabled={busyId === a.id}
              onClick={() => void confirm(a, b)}
            >
              {busyId === a.id ? "Conferma…" : "Conferma trasferimento"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
