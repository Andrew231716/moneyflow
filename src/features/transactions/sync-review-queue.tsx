"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import type { Transaction } from "@/types/database";
import { countSyncReviewItems } from "@/lib/finance/sync-review";
import { SectionHeader } from "@/components/money";
import { Button } from "@/components/ui/button";

/** Compact post-sync triage block for Home / Movimenti. */
export function SyncReviewQueue({
  transactions,
  compact = false,
}: {
  transactions: Transaction[];
  compact?: boolean;
}) {
  const stats = useMemo(
    () => countSyncReviewItems(transactions),
    [transactions]
  );

  if (stats.total === 0) return null;

  if (compact) {
    return (
      <section className="mf-surface p-4 space-y-3">
        <SectionHeader
          title="Dopo la sync"
          description="Controlla pending, categorie e trasferimenti"
          href="/transactions?review=1"
          linkLabel="Apri coda"
        />
        <ul className="grid grid-cols-3 gap-2 text-center text-sm">
          <li className="rounded-xl bg-muted/40 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </li>
          <li className="rounded-xl bg-muted/40 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">
              {stats.uncategorized}
            </p>
            <p className="text-[10px] text-muted-foreground">Senza cat.</p>
          </li>
          <li className="rounded-xl bg-muted/40 px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">
              {stats.transfers}
            </p>
            <p className="text-[10px] text-muted-foreground">Trasf.</p>
          </li>
        </ul>
        {stats.pending > 0 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            I pending non entrano in budget né nel riepilogo del mese finché la
            banca non li contabilizza.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="mf-surface-lift space-y-3 p-4 border border-primary/15">
      <div className="flex items-start gap-2">
        <ClipboardList className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold tracking-tight">
            Coda post-sync · {stats.total} da rivedere
          </h2>
          <p className="text-xs text-muted-foreground">
            Pending · senza categoria · possibili trasferimenti interni
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {stats.pending > 0 && (
          <Button asChild size="sm" variant="outline" className="min-h-touch">
            <Link href="/transactions?pending=1">
              In sospeso ({stats.pending})
            </Link>
          </Button>
        )}
        {stats.uncategorized > 0 && (
          <Button asChild size="sm" variant="outline" className="min-h-touch">
            <Link href="/transactions?category=uncategorized">
              Senza categoria ({stats.uncategorized})
            </Link>
          </Button>
        )}
        {stats.transfers > 0 && (
          <Button asChild size="sm" variant="outline" className="min-h-touch">
            <Link href="/transactions?review=transfers">
              Trasferimenti ({stats.transfers})
            </Link>
          </Button>
        )}
      </div>
      {stats.pending > 0 && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          I pending non entrano in budget né nel riepilogo del mese finché la
          banca non li contabilizza.
        </p>
      )}
    </section>
  );
}
