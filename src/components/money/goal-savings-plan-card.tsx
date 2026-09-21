"use client";

import Link from "next/link";
import { PiggyBank } from "lucide-react";
import type { GoalSavingsPlan } from "@/lib/finance/goal-savings-plan";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MoneyValue } from "./money-value";

export function GoalSavingsPlanCard({
  plan,
}: {
  plan: GoalSavingsPlan;
}) {
  return (
    <section className="mf-surface p-4 space-y-3" aria-label="Piano di risparmio">
      <div className="flex items-start gap-2">
        <PiggyBank className="size-4 mt-0.5 text-teal-700 shrink-0" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold tracking-tight">
            Piano: {plan.goalName}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {plan.statusMessage}
          </p>
        </div>
      </div>

      {plan.neededMonthly != null && plan.remaining > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Da mettere da parte</p>
            <MoneyValue amount={plan.neededMonthly} size="md" tone="success" />
            <p className="text-[11px] text-muted-foreground">al mese</p>
          </div>
          {plan.neededWeekly != null && (
            <div>
              <p className="text-xs text-muted-foreground">Oppure</p>
              <MoneyValue amount={plan.neededWeekly} size="md" />
              <p className="text-[11px] text-muted-foreground">a settimana</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Mancano</p>
            <MoneyValue amount={plan.remaining} size="md" />
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed">
        {plan.adviceMessage}
      </p>

      {plan.cutTips.length > 0 && (
        <ul className="space-y-2">
          {plan.cutTips.map((tip) => (
            <li
              key={tip.categoryId ?? tip.categoryName}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{tip.categoryName}</p>
                <p className="text-[11px] text-muted-foreground">
                  Spesi {formatCurrency(tip.spent)} · {tip.comparisonLabel}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="text-xs font-medium text-teal-800 dark:text-teal-200">
                  −{formatCurrency(tip.suggestedMonthlyCut)}/mese
                </p>
                <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                  <Link href={tip.transactionsHref}>Vedi spese</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
