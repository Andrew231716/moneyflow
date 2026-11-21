"use client";

import Link from "next/link";
import { AlertCircle, Clock3, Sparkles, ArrowLeftRight } from "lucide-react";
import type {
  Category,
  ClassificationRule,
  Transaction,
} from "@/types/database";
import { cn } from "@/lib/utils";
import { AutoCategorizeButton } from "@/features/transactions/auto-categorize-button";

export function HomeTriage({
  pendingCount,
  uncategorizedCount,
  predictedCount,
  transferPairCount,
  transactions = [],
  categories = [],
  rules = [],
}: {
  pendingCount: number;
  uncategorizedCount: number;
  predictedCount: number;
  transferPairCount: number;
  transactions?: Transaction[];
  categories?: Category[];
  rules?: ClassificationRule[];
}) {
  const chips = [
    pendingCount > 0 && {
      href: "/transactions?pending=1",
      label: `${pendingCount} in sospeso`,
      hint: "Non in budget",
      icon: Clock3,
      tone: "warning" as const,
    },
    uncategorizedCount > 0 && {
      href: "/transactions?category=uncategorized",
      label: `${uncategorizedCount} senza categoria`,
      hint: "Da classificare",
      icon: AlertCircle,
      tone: "muted" as const,
    },
    transferPairCount > 0 && {
      href: "/transactions?review=transfers",
      label: `${transferPairCount} trasferimenti?`,
      hint: "Da confermare",
      icon: ArrowLeftRight,
      tone: "primary" as const,
    },
    predictedCount > 0 && {
      href: "#prossimi-pagamenti",
      label: `${predictedCount} da storico`,
      hint: "Prossimi pagamenti",
      icon: Sparkles,
      tone: "primary" as const,
    },
  ].filter(Boolean) as Array<{
    href: string;
    label: string;
    hint: string;
    icon: typeof Clock3;
    tone: "warning" | "muted" | "primary";
  }>;

  if (chips.length === 0 && uncategorizedCount === 0) return null;

  return (
    <section aria-label="Da rivedere" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-xs font-medium text-muted-foreground">Da rivedere</p>
        {uncategorizedCount > 0 && (
          <AutoCategorizeButton
            transactions={transactions}
            categories={categories}
            rules={rules}
            size="sm"
            variant="secondary"
          />
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {chips.map((chip) => {
            const Icon = chip.icon;
            return (
              <Link
                key={chip.href + chip.label}
                href={chip.href}
                className={cn(
                  "shrink-0 rounded-2xl border px-3 py-2.5 min-w-[9.5rem] transition-colors",
                  "hover:bg-accent/50 active:bg-accent/70",
                  chip.tone === "warning" && "border-warning/30 bg-warning/5",
                  chip.tone === "primary" && "border-primary/25 bg-primary/5",
                  chip.tone === "muted" && "border-border bg-card"
                )}
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                  <span className="truncate">{chip.label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {chip.hint}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
