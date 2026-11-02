import { endOfMonth, format, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import type { Account, BudgetProgress, Goal, MonthSummary, Transaction } from "@/types/database";
import { isBookedForStats } from "@/lib/finance/engine";

export type MonthlyReportInput = {
  month: Date;
  summary: MonthSummary;
  previousSummary?: MonthSummary;
  transactions: Transaction[];
  accounts: Account[];
  budgetProgress: BudgetProgress[];
  goals: Goal[];
  byCategory: { name: string; total: number }[];
};

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function buildMonthlyTransactionsCsv(input: MonthlyReportInput): string {
  const start = format(startOfMonth(input.month), "yyyy-MM-dd");
  const end = format(endOfMonth(input.month), "yyyy-MM-dd");
  const rows = input.transactions.filter((tx) => {
    if (tx.type === "transfer") return false;
    if (!isBookedForStats(tx)) return false;
    const d = tx.date.slice(0, 10);
    return d >= start && d <= end;
  });

  const header = [
    "data",
    "tipo",
    "importo",
    "descrizione",
    "categoria",
    "conto",
    "valuta",
  ];
  const lines = [header.join(",")];
  for (const tx of rows) {
    lines.push(
      [
        csvEscape(tx.date.slice(0, 10)),
        csvEscape(tx.type),
        csvEscape(Number(tx.amount).toFixed(2)),
        csvEscape(tx.description),
        csvEscape(tx.category?.name ?? ""),
        csvEscape(tx.account?.name ?? ""),
        csvEscape(tx.account?.currency ?? "EUR"),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function buildMonthlySummaryCsv(input: MonthlyReportInput): string {
  const label = format(input.month, "MMMM yyyy", { locale: it });
  const lines = [
    ["voce", "valore"].join(","),
    [csvEscape(`Report ${label}`), ""].join(","),
    ["entrate", input.summary.income.toFixed(2)].join(","),
    ["uscite", input.summary.expense.toFixed(2)].join(","),
    ["risparmio", input.summary.savings.toFixed(2)].join(","),
    ["tasso_risparmio_%", input.summary.savingsRate.toFixed(1)].join(","),
  ];
  if (input.previousSummary) {
    lines.push(
      [
        "delta_uscite_vs_mese_prec",
        (input.summary.expense - input.previousSummary.expense).toFixed(2),
      ].join(",")
    );
  }
  lines.push(["", ""].join(","));
  lines.push(["categoria", "totale"].join(","));
  for (const c of input.byCategory) {
    lines.push([csvEscape(c.name), c.total.toFixed(2)].join(","));
  }
  return lines.join("\n");
}

export function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8"
) {
  const blob = new Blob(["\uFEFF" + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function monthSlug(month: Date): string {
  return format(month, "yyyy-MM");
}
