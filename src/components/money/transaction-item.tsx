import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types/database";
import { MoneyValue } from "./money-value";
import { StatusBadge } from "./status-badge";

export function TransactionItem({
  transaction: tx,
  className,
  showAccount = true,
  onClick,
}: {
  transaction: Transaction;
  className?: string;
  showAccount?: boolean;
  onClick?: () => void;
}) {
  const pending = (tx.booking_status ?? "booked") === "pending";
  const meta = [
    tx.date,
    showAccount ? tx.account?.name : null,
    tx.type === "transfer"
      ? "Trasferimento"
      : tx.category?.name ?? "Senza categoria",
  ]
    .filter(Boolean)
    .join(" · ");

  const content = (
    <>
      <div className="min-w-0 flex items-start gap-2.5">
        {tx.type === "transfer" && (
          <ArrowLeftRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-medium">{tx.description || "—"}</p>
            {pending && (
              <StatusBadge tone="warning">Non contabilizzato</StatusBadge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{meta}</p>
        </div>
      </div>
      <MoneyValue
        amount={Number(tx.amount)}
        type={tx.type === "transfer" ? undefined : tx.type}
        size="sm"
        className={cn("shrink-0", pending && "opacity-80")}
      />
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 min-h-touch text-left",
          "hover:bg-muted/50 transition-colors",
          pending && "bg-amber-50/60 dark:bg-amber-950/20",
          className
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-3 min-h-touch",
        "hover:bg-muted/50 transition-colors",
        pending && "bg-amber-50/60 dark:bg-amber-950/20",
        className
      )}
    >
      {content}
    </div>
  );
}
