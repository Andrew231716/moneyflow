"use client";

import Link from "next/link";
import { Check, Circle, PiggyBank } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import type { GoalTrajectory } from "@/lib/finance/goal-trajectory";
import { StatusBadge } from "./status-badge";
import { MoneyValue } from "./money-value";
import { Progress } from "@/components/ui/progress";

const statusTone: Record<
  GoalTrajectory["status"],
  "success" | "warning" | "danger" | "info" | "neutral"
> = {
  reached: "success",
  on_track: "success",
  behind: "warning",
  no_deadline: "neutral",
  no_progress: "warning",
};

export function GoalMilestones({
  trajectory,
  compact,
  className,
}: {
  trajectory: GoalTrajectory;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Tappe</p>
        <StatusBadge tone={statusTone[trajectory.status]}>
          {trajectory.statusLabel}
        </StatusBadge>
      </div>
      <ol className="flex items-center gap-1.5">
        {trajectory.milestones.map((m) => (
          <li
            key={m.percent}
            className="flex-1 flex flex-col items-center gap-1 min-w-0"
            title={`${m.percent}% · ${formatCurrency(m.amount)}`}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border text-[10px]",
                m.reached
                  ? "border-success/40 bg-success/15 text-success"
                  : "border-border bg-muted/40 text-muted-foreground"
              )}
              aria-label={`${m.percent}% ${m.reached ? "raggiunta" : "da raggiungere"}`}
            >
              {m.reached ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Circle className="h-2.5 w-2.5 opacity-50" aria-hidden />
              )}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {m.percent}%
            </span>
          </li>
        ))}
      </ol>
      {!compact && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {trajectory.forecastMessage}
        </p>
      )}
      {!compact && trajectory.neededMonthlyPace != null && trajectory.remaining > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {trajectory.avgMonthlyPace != null && trajectory.avgMonthlyPace > 0 && (
            <span>
              Ritmo:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(trajectory.avgMonthlyPace)}/mese
              </span>
            </span>
          )}
          {trajectory.deadline && trajectory.neededMonthlyPace > 0 && (
            <span>
              Serve:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCurrency(trajectory.neededMonthlyPace)}/mese
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function GoalTrajectoryCard({
  trajectory,
  className,
}: {
  trajectory: GoalTrajectory;
  className?: string;
}) {
  return (
    <div className={cn("mf-surface p-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="font-medium truncate flex items-center gap-1.5">
            <PiggyBank className="h-4 w-4 text-primary shrink-0" aria-hidden />
            {trajectory.goalName}
          </p>
          <p className="text-xs text-muted-foreground">
            Mancano <MoneyValue amount={trajectory.remaining} size="sm" className="text-xs inline" />
            {trajectory.deadline
              ? ` · scadenza ${trajectory.deadline.slice(0, 10).split("-").reverse().join("/")}`
              : ""}
          </p>
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
          {trajectory.percent.toFixed(0)}%
        </span>
      </div>
      <Progress
        value={trajectory.percent}
        className="h-2.5"
        indicatorClassName="bg-success"
      />
      <GoalMilestones trajectory={trajectory} />
      <Link
        href="/goals"
        className="text-sm font-medium text-primary hover:underline inline-flex min-h-touch items-center"
      >
        Vedi obiettivi
      </Link>
    </div>
  );
}
