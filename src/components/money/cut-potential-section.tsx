"use client";

import Link from "next/link";
import { Scissors } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { CutPotentialResult, CutPotentialTip } from "@/lib/finance/cut-potential";
import { EmptyState } from "./empty-state";
import { SectionHeader } from "./section-header";
import { MoneyValue } from "./money-value";
import { StatusBadge } from "./status-badge";

function TipRow({ tip }: { tip: CutPotentialTip }) {
  return (
    <article className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ background: tip.color }}
            aria-hidden
          />
          <h3 className="font-medium text-sm truncate">{tip.categoryName}</h3>
        </div>
        <MoneyValue amount={tip.spent} size="sm" tone="danger" />
      </div>

      <p className="text-xs text-muted-foreground">{tip.comparisonLabel}</p>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">
          −{formatCurrency(tip.suggestedMonthlyCut)}/mese
        </StatusBadge>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          ≈ {formatCurrency(tip.suggestedWeeklyCut)}/sett.
        </span>
        {tip.savingsRateImpactPp > 0 && (
          <span className="text-[11px] text-success tabular-nums">
            +{tip.savingsRateImpactPp.toFixed(1)} pp risparmio
          </span>
        )}
      </div>

      {tip.goalImpact && (
        <p className="text-xs text-foreground/90 leading-relaxed">
          {tip.goalImpact.message}
        </p>
      )}

      <div className="flex flex-wrap gap-3 pt-0.5">
        <Link
          href={tip.transactionsHref}
          className="text-xs font-medium text-primary hover:underline min-h-touch inline-flex items-center"
        >
          Vedi movimenti
        </Link>
        <Link
          href={tip.budgetHref}
          className="text-xs font-medium text-muted-foreground hover:text-primary hover:underline min-h-touch inline-flex items-center"
        >
          Budget
        </Link>
      </div>
    </article>
  );
}

export function CutPotentialSection({
  result,
  className,
  compact,
}: {
  result: CutPotentialResult;
  className?: string;
  compact?: boolean;
}) {
  const tips = compact ? result.tips.slice(0, 3) : result.tips;

  return (
    <section className={cn("mf-surface p-5 space-y-4", className)}>
      <SectionHeader
        title="Dove puoi risparmiare"
        description="Tagli prioritari basati su spese, budget e andamento"
        href="/statistics"
        linkLabel="Statistiche"
      />

      {result.empty ? (
        <EmptyState
          className="border-0 shadow-none py-8"
          icon={<Scissors className="h-5 w-5" />}
          title="Dati insufficienti"
          description={
            result.emptyReason ??
            "Registra più spese categorizzate per vedere dove tagliare."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {tips.map((tip) => (
            <TipRow key={tip.categoryId ?? tip.categoryName} tip={tip} />
          ))}
        </div>
      )}
    </section>
  );
}
