"use client";

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import type { Account, BudgetProgress, Goal, MonthSummary, Transaction } from "@/types/database";
import {
  buildMonthlySummaryCsv,
  buildMonthlyTransactionsCsv,
  downloadTextFile,
  monthSlug,
} from "@/lib/export/monthly-report";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/money";

export function MonthlyExportPanel({
  month = new Date(),
  summary,
  previousSummary,
  transactions,
  accounts,
  budgetProgress,
  goals,
  byCategory,
}: {
  month?: Date;
  summary: MonthSummary;
  previousSummary?: MonthSummary;
  transactions: Transaction[];
  accounts: Account[];
  budgetProgress: BudgetProgress[];
  goals: Goal[];
  byCategory: { name: string; total: number }[];
}) {
  const [busy, setBusy] = useState(false);
  const input = useMemo(
    () => ({
      month,
      summary,
      previousSummary,
      transactions,
      accounts,
      budgetProgress,
      goals,
      byCategory,
    }),
    [
      month,
      summary,
      previousSummary,
      transactions,
      accounts,
      budgetProgress,
      goals,
      byCategory,
    ]
  );

  const label = format(month, "MMMM yyyy", { locale: it });

  function exportCsv() {
    setBusy(true);
    try {
      const slug = monthSlug(month);
      downloadTextFile(
        `moneyflow-riepilogo-${slug}.csv`,
        buildMonthlySummaryCsv(input)
      );
      downloadTextFile(
        `moneyflow-movimenti-${slug}.csv`,
        buildMonthlyTransactionsCsv(input)
      );
      toast.success("CSV scaricati");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export non riuscito");
    } finally {
      setBusy(false);
    }
  }

  function printPdf() {
    window.print();
  }

  const deltaExpense =
    previousSummary != null
      ? summary.expense - previousSummary.expense
      : null;

  return (
    <ChartCard
      title="Report mensile"
      description={`${label} · export gratuito CSV / stampa PDF`}
      className="print:border-0 print:shadow-none"
    >
      <div className="space-y-4 print:space-y-3">
        <div className="grid gap-2 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground">Entrate</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(summary.income)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Uscite</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(summary.expense)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Risparmio</p>
            <p className="font-medium tabular-nums">
              {formatCurrency(summary.savings)}
            </p>
          </div>
        </div>
        {deltaExpense != null && (
          <p className="text-xs text-muted-foreground">
            Uscite vs mese precedente:{" "}
            <span className="font-medium text-foreground">
              {deltaExpense >= 0 ? "+" : ""}
              {formatCurrency(deltaExpense)}
            </span>
          </p>
        )}
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            className="min-h-touch"
            variant="secondary"
            disabled={busy}
            onClick={exportCsv}
          >
            <Download className="size-4" />
            Scarica CSV
          </Button>
          <Button
            className="min-h-touch"
            variant="outline"
            onClick={printPdf}
          >
            <Printer className="size-4" />
            Stampa / PDF
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground print:hidden">
          Per il PDF usa “Salva come PDF” nella finestra di stampa del browser —
          nessun servizio a pagamento.
        </p>
      </div>
    </ChartCard>
  );
}
