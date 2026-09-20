import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calcGoalProgress } from "@/lib/finance/engine";
import type { Goal } from "@/types/database";
import { MoneyValue } from "./money-value";
import { StatusBadge } from "./status-badge";

export function GoalCard({
  goal,
  onAdd,
  className,
  compact,
}: {
  goal: Goal;
  onAdd?: (delta: number) => void;
  className?: string;
  compact?: boolean;
}) {
  const p = calcGoalProgress(goal);
  const reached = goal.status === "completed" || p.percent >= 100;

  return (
    <div className={cn("mf-surface p-4 space-y-3", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1.5">
          <p className="font-medium truncate">{goal.name}</p>
          {reached && <StatusBadge tone="success">Raggiunto</StatusBadge>}
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
          {p.percent.toFixed(0)}%
        </span>
      </div>
      <Progress value={p.percent} className="h-2.5" indicatorClassName="bg-success" />
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <MoneyValue amount={Number(goal.current_amount)} size="sm" tone="success" />
        <span className="text-xs text-muted-foreground">
          di <MoneyValue amount={Number(goal.target_amount)} size="sm" className="text-xs" />
        </span>
      </div>
      {!compact && goal.status === "active" && onAdd && (
        <Button
          size="sm"
          variant="secondary"
          className="min-h-touch"
          onClick={() => onAdd(50)}
        >
          +50 €
        </Button>
      )}
    </div>
  );
}
