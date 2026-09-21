"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
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
  onEdit,
  onDelete,
}: {
  progress: BudgetProgress;
  className?: string;
  compact?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
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
        <div className="flex items-center gap-1 shrink-0">
          {(onEdit || onDelete) && (
            <>
              {onEdit && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 min-h-touch min-w-touch"
                  aria-label={`Modifica budget ${name}`}
                  onClick={onEdit}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
              {onDelete && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-9 min-h-touch min-w-touch text-destructive"
                  aria-label={`Elimina budget ${name}`}
                  onClick={onDelete}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </>
          )}
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
