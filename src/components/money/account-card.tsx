import Link from "next/link";
import { Pencil, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeCurrency } from "@/lib/finance/currency";
import type { Account, AccountType } from "@/types/database";
import { MoneyValue } from "./money-value";
import { StatusBadge } from "./status-badge";

const typeLabels: Record<AccountType, string> = {
  bank: "Banca",
  card: "Carta",
  cash: "Contanti",
  savings: "Salvadanaio",
};

export function AccountCard({
  account,
  onEdit,
  onArchive,
  href,
  className,
}: {
  account: Account;
  onEdit?: () => void;
  onArchive?: () => void;
  href?: string;
  className?: string;
}) {
  const currency = normalizeCurrency(account.currency);
  const body = (
    <>
      <div className="h-1.5" style={{ background: account.color }} aria-hidden />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{account.name}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge tone="neutral">{typeLabels[account.type]}</StatusBadge>
              {currency !== "EUR" && (
                <StatusBadge tone="neutral">{currency}</StatusBadge>
              )}
            </div>
          </div>
          {(onEdit || onArchive) && (
            <div className="flex gap-0.5" onClick={(e) => e.preventDefault()}>
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-touch min-w-touch"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEdit();
                  }}
                  aria-label={`Modifica ${account.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {onArchive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-touch min-w-touch"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onArchive();
                  }}
                  aria-label={`Archivia ${account.name}`}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        <MoneyValue
          amount={Number(account.balance)}
          currency={currency}
          size="lg"
        />
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "mf-surface overflow-hidden block transition-colors hover:bg-muted/30",
          className
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className={cn("mf-surface overflow-hidden", className)}>{body}</div>
  );
}

export { typeLabels as accountTypeLabels };
