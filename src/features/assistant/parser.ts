import { format, parseISO, subMonths } from "date-fns";
import type { Transaction } from "@/types/database";
import { calcMonthSummary } from "@/lib/finance/engine";

export type AssistantIntent =
  | { type: "create_transaction"; payload: CreateTxPayload }
  | { type: "bulk_categorize"; payload: BulkCategorizePayload }
  | { type: "bulk_rename"; payload: BulkRenamePayload }
  | { type: "query_transactions"; payload: QueryPayload }
  | { type: "financial_projection"; payload: Record<string, never> }
  | { type: "unknown"; payload: { message: string } };

export interface CreateTxPayload {
  txType: "income" | "expense";
  amount: number;
  description: string;
  categoryHint?: string;
  accountHint?: string;
  date?: string;
}

export interface BulkCategorizePayload {
  pattern: string;
  categoryName: string;
}

export interface BulkRenamePayload {
  from: string;
  to: string;
}

export interface QueryPayload {
  period?: "month" | "week" | "all";
  categoryHint?: string;
  type?: "income" | "expense";
}

const AMOUNT_RE = /(\d+(?:[.,]\d{1,2})?)\s*€?/;

function parseAmountIT(raw: string): number {
  return Number.parseFloat(raw.replace(",", "."));
}

export function parseAssistantCommand(input: string): AssistantIntent {
  const text = input.trim();
  const lower = text.toLowerCase();

  // create expense: "spesa 25 esselunga" / "ho speso 40 al ristorante"
  const expenseMatch = lower.match(
    /(?:spesa|uscita|ho speso|paga(?:to)?|addebito)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€)?\s*(?:di\s+|per\s+|da\s+|a(?:l|lla)?\s+)?(.+)?/i
  );
  if (expenseMatch) {
    return {
      type: "create_transaction",
      payload: {
        txType: "expense",
        amount: parseAmountIT(expenseMatch[1]),
        description: (expenseMatch[2] || "Spesa").trim(),
        categoryHint: expenseMatch[2]?.trim(),
      },
    };
  }

  // create income: "entrata 1500 stipendio"
  const incomeMatch = lower.match(
    /(?:entrata|incasso|ho ricevuto|accredito|stipendio)\s+(\d+(?:[.,]\d{1,2})?)?\s*(?:€)?\s*(.*)?/i
  );
  if (incomeMatch && (incomeMatch[1] || lower.includes("stipendio"))) {
    const amount = incomeMatch[1]
      ? parseAmountIT(incomeMatch[1])
      : AMOUNT_RE.exec(lower)
        ? parseAmountIT(AMOUNT_RE.exec(lower)![1])
        : 0;
    return {
      type: "create_transaction",
      payload: {
        txType: "income",
        amount: amount || 0,
        description: (incomeMatch[2] || "Entrata").trim() || "Stipendio",
        categoryHint: incomeMatch[2]?.trim() || "Stipendio",
      },
    };
  }

  // bulk categorize: "categorizza esselunga come alimentari"
  const catMatch = lower.match(
    /categorizza\s+["']?(.+?)["']?\s+come\s+["']?(.+?)["']?$/i
  );
  if (catMatch) {
    return {
      type: "bulk_categorize",
      payload: {
        pattern: catMatch[1].trim(),
        categoryName: catMatch[2].trim(),
      },
    };
  }

  // bulk rename: "rinomina amazon in amazon.it"
  const renameMatch = lower.match(
    /rinomina\s+["']?(.+?)["']?\s+(?:in|come)\s+["']?(.+?)["']?$/i
  );
  if (renameMatch) {
    return {
      type: "bulk_rename",
      payload: { from: renameMatch[1].trim(), to: renameMatch[2].trim() },
    };
  }

  // query: "quanto ho speso questo mese" / "mostra entrate"
  if (
    /quanto|mostra|lista|riepilogo|spese|entrate/.test(lower) &&
    !/prevision|proiezion/.test(lower)
  ) {
    return {
      type: "query_transactions",
      payload: {
        period: /settimana/.test(lower)
          ? "week"
          : /mese|questo mese/.test(lower)
            ? "month"
            : "month",
        type: /entrat/.test(lower)
          ? "income"
          : /spes/.test(lower)
            ? "expense"
            : undefined,
        categoryHint: undefined,
      },
    };
  }

  if (/prevision|proiezion|fine mese|forecast/.test(lower)) {
    return { type: "financial_projection", payload: {} };
  }

  return {
    type: "unknown",
    payload: {
      message:
        'Non ho capito. Prova: "spesa 25 esselunga", "categorizza coop come alimentari", "quanto ho speso questo mese", "previsione fine mese".',
    },
  };
}

export function runQueryTransactions(
  transactions: Transaction[],
  payload: QueryPayload
): { count: number; total: number; items: Transaction[]; summaryText: string } {
  let filtered = [...transactions];
  const now = new Date();

  if (payload.period === "month") {
    const month = format(now, "yyyy-MM");
    filtered = filtered.filter((t) => t.date.startsWith(month));
  } else if (payload.period === "week") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    filtered = filtered.filter((t) => parseISO(t.date) >= weekAgo);
  }

  if (payload.type) {
    filtered = filtered.filter((t) => t.type === payload.type);
  } else {
    filtered = filtered.filter((t) => t.type !== "transfer");
  }

  const total = filtered.reduce((s, t) => s + Number(t.amount), 0);
  const summary = calcMonthSummary(transactions, now);
  const prev = calcMonthSummary(transactions, subMonths(now, 1));

  return {
    count: filtered.length,
    total,
    items: filtered.slice(0, 10),
    summaryText: `Trovati ${filtered.length} movimenti per ${total.toFixed(2)} €. Mese corrente: entrate ${summary.income.toFixed(2)} €, uscite ${summary.expense.toFixed(2)} € (mese scorso uscite ${prev.expense.toFixed(2)} €).`,
  };
}

export const ASSISTANT_EXAMPLES = [
  "spesa 25,50 esselunga",
  "entrata 1500 stipendio",
  "categorizza esselunga come alimentari",
  "rinomina amazon in Amazon Marketplace",
  "quanto ho speso questo mese",
  "previsione fine mese",
];
