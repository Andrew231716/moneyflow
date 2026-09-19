import { Pencil, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Account, AccountType } from "@/types/database";
import { MoneyValue } from "./money-value";
import { StatusBadge } from "./status-badge";

const typeLabels: Record<AccountType, string> = {
  bank: "Banca",
  card: "Carta",
  cash: "Contanti",
  savings: "Risparmi",
};

export function AccountCard({
  account,
  onEdit,
  onArchive,
  className,
}: {
  account: Account;
  onEdit?: () => void;
  onArchive?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("mf-surface overflow-hidden", className)}>
      <div className="h-1.5" style={{ background: account.color }} aria-hidden />
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{account.name}</p>
            <StatusBadge tone="neutral" className="mt-1.5">
              {typeLabels[account.type]}
            </StatusBadge>
          </div>
          {(onEdit || onArchive) && (
            <div className="flex gap-0.5">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-touch min-w-touch"
                  onClick={onEdit}
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
                  onClick={onArchive}
                  aria-label={`Archivia ${account.name}`}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        <MoneyValue amount={Number(account.balance)} size="lg" />
      </div>
    </div>
  );
}

export { typeLabels as accountTypeLabels };
