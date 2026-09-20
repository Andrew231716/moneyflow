import { format, parseISO, subDays, subMonths } from "date-fns";
import type {
  Account,
  Budget,
  Category,
  Goal,
  Transaction,
} from "@/types/database";
import {
  calcBudgetProgress,
  calcMonthSummary,
  calcTotalAvailability,
  generateInsights,
  forecastMonthEnd,
} from "@/lib/finance/engine";
import {
  formatCutPotentialAssistantText,
  rankCutPotential,
} from "@/lib/finance/cut-potential";
import type { RecurringTransaction } from "@/types/database";
import { formatCurrency } from "@/lib/utils";

export type AssistantIntent =
  | { type: "create_transaction"; payload: CreateTxPayload }
  | { type: "deposit_savings"; payload: SavingsPayload }
  | { type: "withdraw_savings"; payload: SavingsPayload }
  | { type: "create_goal"; payload: CreateGoalPayload }
  | { type: "update_goal"; payload: UpdateGoalPayload }
  | { type: "complete_goal"; payload: { nameHint: string } }
  | { type: "create_transfer"; payload: TransferPayload }
  | { type: "create_budget"; payload: CreateBudgetPayload }
  | { type: "query_budget"; payload: { categoryHint?: string } }
  | { type: "create_category"; payload: CreateCategoryPayload }
  | { type: "create_recurring"; payload: CreateRecurringPayload }
  | { type: "sync_bank"; payload: { institutionHint: string } }
  | { type: "query_balance"; payload: { accountHint?: string } }
  | { type: "query_transactions"; payload: QueryPayload }
  | { type: "query_insights"; payload: Record<string, never> }
  | { type: "query_cut_potential"; payload: Record<string, never> }
  | { type: "bulk_categorize"; payload: BulkCategorizePayload }
  | { type: "bulk_rename"; payload: BulkRenamePayload }
  | { type: "financial_projection"; payload: Record<string, never> }
  | { type: "help"; payload: Record<string, never> }
  | { type: "unknown"; payload: { message: string } };

export interface CreateTxPayload {
  txType: "income" | "expense";
  amount: number;
  description: string;
  categoryHint?: string;
  accountHint?: string;
  date?: string;
}

export interface SavingsPayload {
  amount: number;
  accountHint?: string;
  fromAccountHint?: string;
}

export interface CreateGoalPayload {
  name: string;
  targetAmount: number;
  currentAmount: number;
  completed?: boolean;
}

export interface UpdateGoalPayload {
  nameHint: string;
  addAmount?: number;
  setCurrent?: number;
  setTarget?: number;
}

export interface TransferPayload {
  amount: number;
  fromHint?: string;
  toHint?: string;
}

export interface CreateBudgetPayload {
  amount: number;
  categoryHint: string;
}

export interface CreateCategoryPayload {
  name: string;
  categoryType: "income" | "expense";
}

export interface CreateRecurringPayload {
  txType: "income" | "expense";
  amount: number;
  description: string;
  frequency: "weekly" | "monthly" | "yearly";
  categoryHint?: string;
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

const AMOUNT_RE = /(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?/i;

function parseAmountIT(raw: string): number {
  return Number.parseFloat(raw.replace(",", "."));
}

function extractAmount(text: string): number | null {
  const m = text.match(AMOUNT_RE);
  if (!m) return null;
  const n = parseAmountIT(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Parse relative Italian dates: oggi / ieri / dopodomani / N giorni fa */
export function parseItalianDate(text: string, now = new Date()): string {
  const lower = text.toLowerCase();
  if (/\boggi\b/.test(lower)) return format(now, "yyyy-MM-dd");
  if (/\bieri\b/.test(lower)) return format(subDays(now, 1), "yyyy-MM-dd");
  if (/\bl['']altro ieri\b|\baltroieri\b/.test(lower)) {
    return format(subDays(now, 2), "yyyy-MM-dd");
  }
  const daysAgo = lower.match(/(\d+)\s*giorni?\s*fa/);
  if (daysAgo) {
    return format(subDays(now, Number.parseInt(daysAgo[1], 10)), "yyyy-MM-dd");
  }
  return format(now, "yyyy-MM-dd");
}

function stripDateWords(text: string): string {
  return text
    .replace(/\b(oggi|ieri|l['']altro ieri|altroieri)\b/gi, " ")
    .replace(/\b\d+\s*giorni?\s*fa\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HELP_MESSAGE = `Sono il Gestore finanziario locale (senza AI cloud). Comandi utili:
• Salvadanaio: "Metti 300 euro nel salvadanaio", "Preleva 50 dal salvadanaio"
• Obiettivi: "Crea obiettivo Matrimonio a 200 euro già raggiunto", "Aggiungi 20 all'obiettivo Matrimonio"
• Risparmio: "Dove posso risparmiare?"
• Movimenti: "Aggiungi spesa 35 euro ristorante ieri", "Entrata 100 freelance"
• Banca: "Sincronizza Intesa"
• Query: "Quanto ho sul conto?", "Quanto ho speso questo mese", "Budget rimanente", "Previsione fine mese"
• Altro: "Categorizza coop come alimentari", "Crea budget 200 alimentari"`;



export function parseAssistantCommand(input: string): AssistantIntent {
  const text = input.trim();
  const lower = text.toLowerCase();

  if (/^(aiuto|help|comandi|\?)$/i.test(lower) || /cosa puoi fare|che comandi/.test(lower)) {
    return { type: "help", payload: {} };
  }

  // Savings deposit: "metti 300 euro nel salvadanaio" / "versa 50 sul salvadanaio"
  const savingsIn = lower.match(
    /(?:metti|versa|deposita|sposta|trasferisci)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s*(?:di\s+)?(?:nel|sul|nel\s+mio|sul\s+mio|in|su)?\s*(?:il\s+)?(?:salvadan(?:aio|i)?|risparm(?:i|io)|conto\s+risparmio)/i
  );
  if (savingsIn) {
    return {
      type: "deposit_savings",
      payload: { amount: parseAmountIT(savingsIn[1]) },
    };
  }
  // Alternate order: "nel salvadanaio metti 300"
  if (/salvadan|risparm/.test(lower) && /(?:metti|versa|deposita)/.test(lower)) {
    const amt = extractAmount(lower);
    if (amt != null && amt > 0 && !/preleva|togli|ritira/.test(lower)) {
      return { type: "deposit_savings", payload: { amount: amt } };
    }
  }

  // Savings withdraw
  const savingsOut = lower.match(
    /(?:preleva|togli|ritira)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s*(?:dal|dal\s+mio|da)?\s*(?:il\s+)?(?:salvadan(?:aio|i)?|risparm(?:i|io))/i
  );
  if (savingsOut) {
    return {
      type: "withdraw_savings",
      payload: { amount: parseAmountIT(savingsOut[1]) },
    };
  }

  // Create goal: "crea obiettivo Matrimonio Giulia e Ruben a 200 euro già raggiunto"
  const goalMatch = lower.match(
    /(?:crea|nuovo|aggiungi)\s+(?:un\s+)?obiettiv[oi]\s+(.+?)\s+(?:a|di|da|target)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?(?:\s+(già\s+raggiunt[oa]|complet[oa]|raggiunt[oa]))?/i
  );
  if (goalMatch) {
    const target = parseAmountIT(goalMatch[2]);
    const done = Boolean(goalMatch[3]) || /già\s+raggiunt|completato|raggiunto/.test(lower);
    const name = text
      .replace(/^(?:crea|nuovo|aggiungi)\s+(?:un\s+)?obiettiv[oi]\s+/i, "")
      .replace(/\s+(?:a|di|da|target)\s+\d+(?:[.,]\d{1,2})?\s*(?:€|euro)?(?:\s+(già\s+raggiunt[oa]|complet[oa]|raggiunt[oa]))?$/i, "")
      .trim();
    return {
      type: "create_goal",
      payload: {
        name: name || goalMatch[1].trim(),
        targetAmount: target,
        currentAmount: done ? target : 0,
        completed: done,
      },
    };
  }

  // Complete goal
  const completeGoal = lower.match(
    /(?:completa|segna\s+come\s+raggiunt[oa]|marca\s+complet[oa])\s+(?:l['']?\s*)?obiettiv[oi]\s+(.+)/i
  );
  if (completeGoal) {
    return {
      type: "complete_goal",
      payload: { nameHint: completeGoal[1].trim() },
    };
  }

  // Update goal progress: "aggiungi 50 all'obiettivo viaggio"
  const goalAdd = lower.match(
    /(?:aggiungi|versa)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s+(?:all['']|al\s+|a\s+l['']?)?obiettiv[oi]\s+(.+)/i
  );
  if (goalAdd) {
    return {
      type: "update_goal",
      payload: {
        nameHint: goalAdd[2].trim(),
        addAmount: parseAmountIT(goalAdd[1]),
      },
    };
  }

  // Sync bank: "sincronizza Intesa" / "sync banca"
  const syncMatch = lower.match(
    /(?:sincronizza|sync(?:hronize)?|aggiorna)\s+(?:la\s+)?(?:banca\s+)?(.+)?/i
  );
  if (syncMatch && /sincronizza|sync|aggiorna\s+(banca|conto|intesa|unicredit|fineco|revolut)/.test(lower)) {
    const hint = (syncMatch[1] || "")
      .replace(/^(la\s+)?(banca\s+)?/i, "")
      .trim();
    return {
      type: "sync_bank",
      payload: { institutionHint: hint || "banca" },
    };
  }
  if (/^sincronizza|^sync\b/.test(lower)) {
    return {
      type: "sync_bank",
      payload: {
        institutionHint: lower.replace(/^(sincronizza|sync)\s*/i, "").trim() || "banca",
      },
    };
  }

  // Balance query — before generic "quanto" expense query
  if (
    /quanto\s+ho|saldo|disponibilit[aà]|sul\s+conto|nei\s+conti|patrimonio/.test(lower) &&
    !/spes|entrat/.test(lower)
  ) {
    const accountHint = lower.match(
      /(?:sul|nel|del|di)\s+(?:conto\s+)?(.+?)(?:\?|$)/
    )?.[1]
      ?.replace(/\b(conto|banca|totale)\b/g, "")
      .trim();
    return {
      type: "query_balance",
      payload: {
        accountHint:
          accountHint && accountHint.length > 1 && !/quanto|ho|euro/.test(accountHint)
            ? accountHint
            : undefined,
      },
    };
  }

  // Budget remaining
  if (/budget|rimanente|avanzat/.test(lower) && !/crea|imposta|imposta|nuovo/.test(lower)) {
    const cat = lower.match(/budget\s+(?:rimanente\s+)?(?:di\s+|per\s+)?(.+)?/)?.[1]?.trim();
    return {
      type: "query_budget",
      payload: {
        categoryHint: cat && !/rimanente|mese|quanto/.test(cat) ? cat : undefined,
      },
    };
  }

  // Create budget: "budget 200 alimentari" / "imposta budget 150 ristoranti"
  const budgetCreate = lower.match(
    /(?:imposta|crea|nuovo|set)?\s*budget\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s+(?:per\s+|di\s+|su\s+)?(.+)/i
  );
  if (budgetCreate && !/rimanente|quanto|avanzat/.test(lower)) {
    return {
      type: "create_budget",
      payload: {
        amount: parseAmountIT(budgetCreate[1]),
        categoryHint: budgetCreate[2].trim(),
      },
    };
  }

  // Transfer: "trasferisci 100 da conti a risparmi"
  const transferMatch = lower.match(
    /trasferisci\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s+(?:da\s+(.+?)\s+a\s+(.+)|a\s+(.+))/i
  );
  if (transferMatch && !/salvadan/.test(lower)) {
    return {
      type: "create_transfer",
      payload: {
        amount: parseAmountIT(transferMatch[1]),
        fromHint: transferMatch[2]?.trim(),
        toHint: (transferMatch[3] || transferMatch[4])?.trim(),
      },
    };
  }

  // Category: "crea categoria abbonamenti"
  const catCreate = lower.match(
    /(?:crea|nuova)\s+categoria\s+(entrata\s+|uscita\s+|spesa\s+)?(.+)/i
  );
  if (catCreate) {
    const typeHint = catCreate[1]?.toLowerCase() ?? "";
    return {
      type: "create_category",
      payload: {
        name: catCreate[2].trim(),
        categoryType: /entrat|income/.test(typeHint) ? "income" : "expense",
      },
    };
  }

  // Recurring: "ricorrente spesa 9.99 netflix mensile"
  const recurringMatch = lower.match(
    /ricorrente\s+(spesa|uscita|entrata|incasso)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s+(.+?)(?:\s+(settimanal[ei]|mensil[ei]|annua(?:le)?))?$/i
  );
  if (recurringMatch) {
    const freqRaw = (recurringMatch[4] || "mensile").toLowerCase();
    const frequency = /sett/.test(freqRaw)
      ? "weekly"
      : /ann/.test(freqRaw)
        ? "yearly"
        : "monthly";
    const txType = /entrat|incasso/.test(recurringMatch[1]) ? "income" : "expense";
    return {
      type: "create_recurring",
      payload: {
        txType,
        amount: parseAmountIT(recurringMatch[2]),
        description: recurringMatch[3].trim(),
        frequency,
        categoryHint: recurringMatch[3].trim(),
      },
    };
  }

  // Cut potential / where to save
  if (
    /dove\s+(?:posso|puoi)\s+risparm|tagliare\s+spes|ridurre\s+spes|consigli\s+di\s+risparm|dove\s+tagliare/.test(
      lower
    )
  ) {
    return { type: "query_cut_potential", payload: {} };
  }

  // Insights
  if (/insight|consigli|analisi|come\s+vado|situazione\s+finanziaria/.test(lower)) {
    return { type: "query_insights", payload: {} };
  }

  // Expense — flexible: "aggiungi spesa 35 euro ristorante ieri" / "spesa 25 esselunga"
  const expenseMatch = lower.match(
    /(?:aggiungi\s+)?(?:spesa|uscita|ho speso|paga(?:to)?|addebito)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro)?\s*(?:di\s+|per\s+|da\s+|a(?:l|lla)?\s+)?(.+)?/i
  );
  if (expenseMatch) {
    const rawDesc = expenseMatch[2] || "Spesa";
    const date = parseItalianDate(lower);
    const description = stripDateWords(rawDesc) || "Spesa";
    return {
      type: "create_transaction",
      payload: {
        txType: "expense",
        amount: parseAmountIT(expenseMatch[1]),
        description,
        categoryHint: description,
        date,
      },
    };
  }

  // Income
  const incomeMatch = lower.match(
    /(?:aggiungi\s+)?(?:entrata|incasso|ho ricevuto|accredito|stipendio)\s+(\d+(?:[.,]\d{1,2})?)?\s*(?:€|euro)?\s*(.*)?/i
  );
  if (incomeMatch && (incomeMatch[1] || lower.includes("stipendio"))) {
    const amount = incomeMatch[1]
      ? parseAmountIT(incomeMatch[1])
      : extractAmount(lower) ?? 0;
    const rawDesc = (incomeMatch[2] || "Entrata").trim() || "Stipendio";
    return {
      type: "create_transaction",
      payload: {
        txType: "income",
        amount: amount || 0,
        description: stripDateWords(rawDesc) || "Stipendio",
        categoryHint: stripDateWords(rawDesc) || "Stipendio",
        date: parseItalianDate(lower),
      },
    };
  }

  // Bulk categorize
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

  // Bulk rename
  const renameMatch = lower.match(
    /rinomina\s+["']?(.+?)["']?\s+(?:in|come)\s+["']?(.+?)["']?$/i
  );
  if (renameMatch) {
    return {
      type: "bulk_rename",
      payload: { from: renameMatch[1].trim(), to: renameMatch[2].trim() },
    };
  }

  if (/prevision|proiezion|fine mese|forecast/.test(lower)) {
    return { type: "financial_projection", payload: {} };
  }

  // Query expenses/income
  if (
    /quanto|mostra|lista|riepilogo|spese|entrate/.test(lower) &&
    !/prevision|proiezion|saldo|sul\s+conto/.test(lower)
  ) {
    return {
      type: "query_transactions",
      payload: {
        period: /settimana/.test(lower)
          ? "week"
          : /tutt[oi]|sempre|all/.test(lower)
            ? "all"
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

  return {
    type: "unknown",
    payload: { message: HELP_MESSAGE },
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
    summaryText: `Trovati ${filtered.length} movimenti per ${formatCurrency(total)}. Mese corrente: entrate ${formatCurrency(summary.income)}, uscite ${formatCurrency(summary.expense)} (mese scorso uscite ${formatCurrency(prev.expense)}).`,
  };
}

export function runQueryBalance(
  accounts: Account[],
  accountHint?: string
): { summaryText: string; total: number; lines: { name: string; amount: number }[] } {
  const active = accounts.filter((a) => !a.is_archived);
  let list = active;
  if (accountHint) {
    const hint = accountHint.toLowerCase();
    const matched = active.filter(
      (a) =>
        a.name.toLowerCase().includes(hint) ||
        a.type.toLowerCase().includes(hint) ||
        (hint.includes("salvadan") && a.type === "savings")
    );
    if (matched.length) list = matched;
  }
  const total = list.reduce((s, a) => s + Number(a.balance), 0);
  const allTotal = calcTotalAvailability(active);
  const lines = list.map((a) => ({ name: a.name, amount: Number(a.balance) }));
  const detail = lines
    .map((l) => `• ${l.name}: ${formatCurrency(l.amount)}`)
    .join("\n");
  return {
    total,
    lines,
    summaryText:
      list.length === active.length
        ? `Disponibilità totale: ${formatCurrency(allTotal)}\n${detail}`
        : `Saldo selezionato: ${formatCurrency(total)}\n${detail}\n(Totale conti: ${formatCurrency(allTotal)})`,
  };
}

export function runQueryBudget(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  categoryHint?: string
): { summaryText: string } {
  const progress = calcBudgetProgress(budgets, transactions, new Date());
  let list = progress;
  if (categoryHint) {
    const hint = categoryHint.toLowerCase();
    list = progress.filter((p) =>
      (p.budget.category?.name || categories.find((c) => c.id === p.budget.category_id)?.name || "")
        .toLowerCase()
        .includes(hint)
    );
  }
  if (!list.length) {
    return {
      summaryText: categoryHint
        ? `Nessun budget trovato per "${categoryHint}".`
        : "Nessun budget impostato questo mese.",
    };
  }
  const lines = list.map((p) => {
    const name =
      p.budget.category?.name ||
      categories.find((c) => c.id === p.budget.category_id)?.name ||
      "Categoria";
    const remaining = Number(p.budget.amount) - p.spent;
    return `• ${name}: spesi ${formatCurrency(p.spent)} / ${formatCurrency(Number(p.budget.amount))} (rimangono ${formatCurrency(remaining)})`;
  });
  return { summaryText: `Budget mese:\n${lines.join("\n")}` };
}

export function runInsightsText(
  transactions: Transaction[],
  recurring: RecurringTransaction[],
  budgets: Budget[],
  goals: Goal[]
): string {
  const now = new Date();
  const summary = calcMonthSummary(transactions, now);
  const previousSummary = calcMonthSummary(transactions, subMonths(now, 1));
  const forecast = forecastMonthEnd(transactions, recurring);
  const budgetProgress = calcBudgetProgress(budgets, transactions, now);
  const insights = generateInsights({
    summary,
    budgets: budgetProgress,
    goals,
    forecast,
    previousSummary,
  });
  if (!insights.length) {
    return `Situazione ok. Entrate ${formatCurrency(summary.income)}, uscite ${formatCurrency(summary.expense)}, risparmio ${formatCurrency(summary.savings)}.`;
  }
  return insights.map((i) => `• ${i.title}: ${i.message}`).join("\n");
}

export function runCutPotentialText(
  transactions: Transaction[],
  budgets: Budget[],
  goals: Goal[]
): string {
  return formatCutPotentialAssistantText(
    rankCutPotential({ transactions, budgets, goals, limit: 4 })
  );
}

export function findAccount(
  accounts: Account[],
  hint?: string,
  preferType?: Account["type"]
): Account | undefined {
  const active = accounts.filter((a) => !a.is_archived);
  if (hint) {
    const h = hint.toLowerCase();
    const byName = active.find((a) => a.name.toLowerCase().includes(h));
    if (byName) return byName;
    if (/salvadan|risparm/.test(h)) {
      return active.find((a) => a.type === "savings");
    }
  }
  if (preferType) {
    const byType = active.find((a) => a.type === preferType);
    if (byType) return byType;
  }
  return active[0];
}

export function findSavingsAccount(accounts: Account[]): Account | undefined {
  const active = accounts.filter((a) => !a.is_archived);
  return (
    active.find((a) => a.type === "savings" && /salvadan/i.test(a.name)) ||
    active.find((a) => a.type === "savings")
  );
}

export function findGoal(goals: Goal[], hint: string): Goal | undefined {
  const h = hint.toLowerCase();
  return (
    goals.find((g) => g.name.toLowerCase() === h) ||
    goals.find((g) => g.name.toLowerCase().includes(h))
  );
}

export const ASSISTANT_EXAMPLES = [
  "Metti 300 euro nel salvadanaio",
  "Crea obiettivo Matrimonio Giulia e Ruben a 200 euro già raggiunto",
  "Dove posso risparmiare?",
  "Quanto ho sul conto?",
  "Sincronizza Intesa",
  "Aggiungi spesa 35 euro ristorante ieri",
  "Budget rimanente",
  "Previsione fine mese",
  "Quanto ho speso questo mese",
  "Crea budget 200 alimentari",
  "Categorizza esselunga come alimentari",
  "Aiuto",
];

export { HELP_MESSAGE };
