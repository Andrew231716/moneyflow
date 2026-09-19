import { ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/types/database";
import { MoneyValue } from "./money-value";

export function TransactionItem({
  transaction: tx,
  className,
  showAccount = true,
}: {
  transaction: Transaction;
  className?: string;
  showAccount?: boolean;
}) {
  const meta = [
    tx.date,
    showAccount ? tx.account?.name : null,
    tx.type === "transfer"
      ? "Trasferimento"
      : tx.category?.name ?? "Senza categoria",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-3 min-h-touch",
        "hover:bg-muted/50 transition-colors",
        className
      )}
    >
      <div className="min-w-0 flex items-start gap-2.5">
        {tx.type === "transfer" && (
          <ArrowLeftRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{tx.description || "—"}</p>
          <p className="text-xs text-muted-foreground truncate">{meta}</p>
        </div>
      </div>
      <MoneyValue
        amount={Number(tx.amount)}
        type={tx.type === "transfer" ? undefined : tx.type}
        size="sm"
        className="shrink-0"
      />
    </div>
  );
}
