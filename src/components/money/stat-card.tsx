import { cn } from "@/lib/utils";
import { MoneyValue } from "./money-value";

export function StatCard({
  title,
  value,
  hint,
  tone,
  trend,
  className,
  hero,
}: {
  title: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "success" | "danger" | "warning";
  trend?: { label: string; positive?: boolean };
  className?: string;
  hero?: boolean;
}) {
  return (
    <div
      className={cn(
        hero ? "mf-surface-lift" : "mf-surface",
        "p-5 transition-shadow",
        hero && "sm:p-6",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">{title}</p>
      <div className="mt-2">
        {typeof value === "number" ? (
          <MoneyValue
            amount={value}
            size={hero ? "hero" : "lg"}
            tone={tone === "danger" ? "danger" : tone === "success" ? "success" : tone === "warning" ? "warning" : "default"}
          />
        ) : (
          <p
            className={cn(
              "mf-value",
              hero ? "text-value-hero" : "text-value-lg",
              tone === "success" && "text-income",
              tone === "danger" && "text-expense",
              tone === "warning" && "text-warning"
            )}
          >
            {value}
          </p>
        )}
      </div>
      {(hint || trend) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trend ? (
            <span
              className={cn(
                "text-xs font-medium",
                trend.positive === true && "text-income",
                trend.positive === false && "text-expense",
                trend.positive == null && "text-muted-foreground"
              )}
            >
              {trend.label}
            </span>
          ) : null}
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      )}
    </div>
  );
}
