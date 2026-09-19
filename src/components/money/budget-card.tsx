import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { BudgetProgress } from "@/types/database";
import { MoneyValue } from "./money-value";
import { StatusBadge } from "./status-badge";

const barColor = {
  ok: "bg-success",
  warn: "bg-warning",
  critical: "bg-orange-500",
  over: "bg-destructive",
} as const;

const stateLabel = {
  ok: "In linea",
  warn: "Attenzione",
  critical: "Critico",
  over: "Superato",
} as const;

export function BudgetCard({
  progress,
  className,
  compact,
}: {
  progress: BudgetProgress;
  className?: string;
  compact?: boolean;
}) {
  const { budget, spent, percent, state } = progress;
  const name = budget.category?.name ?? "Categoria";

  return (
    <div className={cn("mf-surface p-4 space-y-2.5", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{name}</p>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {percent.toFixed(0)}% utilizzato
            </p>
          )}
        </div>
        <StatusBadge
          tone={
            state === "ok"
              ? "success"
              : state === "over"
                ? "danger"
                : "warning"
          }
        >
          {stateLabel[state]}
        </StatusBadge>
      </div>
      <Progress
        value={Math.min(100, percent)}
        indicatorClassName={barColor[state]}
        className="h-2.5"
      />
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <MoneyValue amount={spent} size="sm" tone="danger" />
        <span className="text-muted-foreground text-xs">
          su <MoneyValue amount={Number(budget.amount)} size="sm" className="text-xs" />
        </span>
      </div>
    </div>
  );
}
