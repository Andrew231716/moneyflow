"use client";

import Link from "next/link";
import { AlertTriangle, BellRing, Target } from "lucide-react";
import type { BudgetProgress, Goal } from "@/types/database";
import { calcGoalTrajectory } from "@/lib/finance/goal-trajectory";
import { isGoalSettled } from "@/lib/finance/engine";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BankConsentAlert } from "@/features/alerts/build-consent-alerts";

export type { BankConsentAlert };

export function AppAlerts({
  consentAlerts,
  budgetProgress,
  goals,
}: {
  consentAlerts: BankConsentAlert[];
  budgetProgress: BudgetProgress[];
  goals: Goal[];
}) {
  const overBudgets = budgetProgress.filter(
    (b) => b.state === "over" || b.state === "critical"
  );
  const behindGoals = goals
    .filter((g) => !isGoalSettled(g) && g.status === "active")
    .map((g) => ({ goal: g, trajectory: calcGoalTrajectory(g) }))
    .filter(
      (x) =>
        x.trajectory.status === "behind" ||
        x.trajectory.status === "no_progress"
    );

  if (
    consentAlerts.length === 0 &&
    overBudgets.length === 0 &&
    behindGoals.length === 0
  ) {
    return null;
  }

  return (
    <section className="space-y-2" aria-label="Avvisi">
      {consentAlerts.map((c) => (
        <div
          key={c.id}
          className="mf-surface flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between border border-warning/30 bg-warning/5"
        >
          <div className="flex gap-2 min-w-0">
            <BellRing className="size-4 shrink-0 text-warning mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {c.consent_expired
                  ? `Consenso scaduto · ${c.institution_name}`
                  : `Consenso in scadenza · ${c.institution_name}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.consent_message ||
                  (c.consent_expired
                    ? "Ricollega la banca per continuare la sync."
                    : `Scade tra ${c.daysLeft} giorni.`)}
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="min-h-touch shrink-0">
            <Link href="/accounts/connect-bank">Ricollega</Link>
          </Button>
        </div>
      ))}

      {overBudgets.slice(0, 3).map((b) => {
        const name = b.budget.category?.name ?? "Budget";
        return (
          <div
            key={b.budget.id}
            className="mf-surface flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between border border-destructive/20 bg-destructive/5"
          >
            <div className="flex gap-2 min-w-0">
              <AlertTriangle className="size-4 shrink-0 text-destructive mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {b.state === "over" ? "Budget superato" : "Budget critico"} ·{" "}
                  {name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(b.spent)} su {formatCurrency(Number(b.budget.amount))} (
                  {b.percent.toFixed(0)}%)
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" className="min-h-touch shrink-0">
              <Link href="/budgets">Apri budget</Link>
            </Button>
          </div>
        );
      })}

      {behindGoals.slice(0, 3).map(({ goal, trajectory }) => (
        <div
          key={goal.id}
          className="mf-surface flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between border border-warning/30 bg-warning/5"
        >
          <div className="flex gap-2 min-w-0">
            <Target className="size-4 shrink-0 text-warning mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                Obiettivo in ritardo · {goal.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {trajectory.statusLabel}
                {trajectory.neededMonthlyPace != null
                  ? ` · serve circa ${formatCurrency(trajectory.neededMonthlyPace)}/mese`
                  : ""}
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="min-h-touch shrink-0">
            <Link href="/goals">Apri obiettivi</Link>
          </Button>
        </div>
      ))}
    </section>
  );
}
