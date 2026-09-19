import { cn } from "@/lib/utils";
import type { Insight } from "@/types/database";
import { StatusBadge } from "./status-badge";

export function InsightCard({
  insight,
  className,
}: {
  insight: Insight;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card/80 p-3.5 space-y-1.5",
        insight.type === "warning" && "border-warning/30 bg-warning/5",
        insight.type === "success" && "border-success/30 bg-success/5",
        className
      )}
    >
      <StatusBadge
        tone={
          insight.type === "success"
            ? "success"
            : insight.type === "warning"
              ? "warning"
              : "neutral"
        }
      >
        {insight.title}
      </StatusBadge>
      <p className="text-sm text-muted-foreground leading-relaxed">{insight.message}</p>
    </div>
  );
}
