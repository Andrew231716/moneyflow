"use client";

import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calcGoalTrajectory } from "@/lib/finance/goal-trajectory";
import { isGoalReached, isGoalSettled } from "@/lib/finance/engine";
import type { Goal } from "@/types/database";
import { MoneyValue } from "./money-value";
import { StatusBadge } from "./status-badge";
import { GoalMilestones } from "./goal-milestones";

export function GoalCard({
  goal,
  onAdd,
  onSettle,
  className,
  compact,
  showTrajectory = true,
}: {
  goal: Goal;
  onAdd?: (delta: number) => void;
  onSettle?: (goal: Goal) => void;
  className?: string;
  compact?: boolean;
  showTrajectory?: boolean;
}) {
  const trajectory = calcGoalTrajectory(goal);
  const reached = isGoalReached(goal);
  const settled = isGoalSettled(goal);

  return (
    <div className={cn("mf-surface p-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <p className="font-medium truncate">{goal.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {settled ? (
              <StatusBadge tone="neutral">Saldato</StatusBadge>
            ) : reached ? (
              <StatusBadge tone="success">Raggiunto</StatusBadge>
            ) : showTrajectory ? (
              <StatusBadge
                tone={
                  trajectory.status === "on_track"
                    ? "success"
                    : trajectory.status === "behind" ||
                        trajectory.status === "no_progress"
                      ? "warning"
                      : "neutral"
                }
              >
                {trajectory.statusLabel}
              </StatusBadge>
            ) : null}
          </div>
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
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <MoneyValue amount={Number(goal.current_amount)} size="sm" tone="success" />
        <span className="text-xs text-muted-foreground">
          di <MoneyValue amount={Number(goal.target_amount)} size="sm" className="text-xs" />
        </span>
      </div>
      {showTrajectory && !settled && (
        <GoalMilestones trajectory={trajectory} compact={compact} />
      )}
      {!compact && (
        <div className="flex flex-wrap gap-2">
          {goal.status === "active" && !reached && onAdd && (
            <Button
              size="sm"
              variant="secondary"
              className="min-h-touch"
              onClick={() => onAdd(50)}
            >
              +50 €
            </Button>
          )}
          {reached && !settled && onSettle && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-touch"
              onClick={() => onSettle(goal)}
            >
              Saldato
            </Button>
          )}
        </div>
      )}
      {compact && reached && !settled && (
        <p className="text-[11px] text-muted-foreground">
          Raggiunto · ancora disponibile fino a Saldato
        </p>
      )}
    </div>
  );
}
