import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type QuickActionItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "expense" | "income" | "neutral";
};

const toneStyles = {
  default: "bg-primary/10 text-primary hover:bg-primary/15",
  expense: "bg-expense/10 text-expense hover:bg-expense/15",
  income: "bg-income/10 text-income hover:bg-income/15",
  neutral: "bg-muted text-foreground hover:bg-muted/80",
};

export const defaultQuickActions = (
  handlers: {
    onExpense?: () => void;
    onIncome?: () => void;
    onTransfer?: () => void;
    importHref?: string;
  } = {}
): QuickActionItem[] => [
  {
    id: "expense",
    label: "+Spesa",
    icon: ArrowDownLeft,
    onClick: handlers.onExpense,
    tone: "expense",
  },
  {
    id: "income",
    label: "+Entrata",
    icon: ArrowUpRight,
    onClick: handlers.onIncome,
    tone: "income",
  },
  {
    id: "transfer",
    label: "Trasferisci",
    icon: ArrowLeftRight,
    onClick: handlers.onTransfer,
    tone: "neutral",
  },
  {
    id: "import",
    label: "Importa",
    icon: Upload,
    href: handlers.importHref ?? "/transactions/import",
    tone: "default",
  },
];

export function QuickActions({
  actions,
  className,
}: {
  actions: QuickActionItem[];
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-4 gap-2 sm:gap-3", className)}>
      {actions.map((a) => {
        const Icon = a.icon;
        const classes = cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3 min-h-[72px]",
          "text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          toneStyles[a.tone ?? "default"]
        );

        if (a.href) {
          return (
            <Link key={a.id} href={a.href} className={classes}>
              <Icon className="h-5 w-5" />
              <span className="truncate max-w-full">{a.label}</span>
            </Link>
          );
        }

        return (
          <button
            key={a.id}
            type="button"
            onClick={a.onClick}
            className={classes}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate max-w-full">{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
