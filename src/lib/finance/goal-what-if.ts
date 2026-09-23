import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Goal } from "@/types/database";

const DAYS_PER_MONTH = 30.437;
const DAYS_PER_WEEK = 7;

const IT_MONTHS: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

export interface GoalWhatIfInput {
  goal: Goal;
  /** Hypothetical contribution applied today (e.g. from Salvadanaio). */
  contributeAmount?: number;
  /** Override deadline (ISO yyyy-MM-dd). Falls back to goal.deadline. */
  deadline?: string | null;
  now?: Date;
}

export interface GoalWhatIfResult {
  goalName: string;
  target: number;
  currentBefore: number;
  contributeAmount: number;
  currentAfter: number;
  remainingBefore: number;
  remainingAfter: number;
  deadline: string | null;
  daysRemaining: number | null;
  monthsRemaining: number | null;
  neededMonthlyBefore: number | null;
  neededMonthlyAfter: number | null;
  neededWeeklyAfter: number | null;
  monthlySaved: number | null;
  alreadyReached: boolean;
  summaryText: string;
  moneyLines: { label: string; amount: number }[];
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);
}

function formatDeadlineIt(iso: string): string {
  try {
    const d = parseISO(iso.length === 10 ? `${iso}T12:00:00` : iso);
    return new Intl.DateTimeFormat("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}

function neededPerPeriod(
  remaining: number,
  daysRemaining: number | null
): { monthly: number | null; weekly: number | null; months: number | null } {
  if (remaining <= 0) {
    return { monthly: 0, weekly: 0, months: 0 };
  }
  if (daysRemaining == null) {
    return { monthly: null, weekly: null, months: null };
  }
  if (daysRemaining <= 0) {
    return { monthly: remaining, weekly: remaining, months: 0 };
  }
  const months = roundMoney(daysRemaining / DAYS_PER_MONTH);
  return {
    monthly: roundMoney(remaining / (daysRemaining / DAYS_PER_MONTH)),
    weekly: roundMoney(remaining / (daysRemaining / DAYS_PER_WEEK)),
    months,
  };
}

/**
 * Parse Italian absolute dates used in what-if questions:
 * "15 febbraio", "15/02", "15-02-2027", "2027-02-15".
 * If year is omitted and the day/month already passed this year, use next year.
 */
export function parseItalianDeadline(
  text: string,
  now = new Date()
): string | null {
  const lower = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

  const iso = lower.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = lower.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](20\d{2}))?\b/);
  if (slash) {
    const day = Number.parseInt(slash[1], 10);
    const month = Number.parseInt(slash[2], 10);
    let year = slash[3]
      ? Number.parseInt(slash[3], 10)
      : now.getFullYear();
    if (!slash[3]) {
      const candidate = new Date(year, month - 1, day, 12);
      if (candidate.getTime() < now.getTime()) year += 1;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const named = lower.match(
    /\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)(?:\s+(20\d{2}))?\b/
  );
  if (named) {
    const day = Number.parseInt(named[1], 10);
    const month = IT_MONTHS[named[2]];
    let year = named[3]
      ? Number.parseInt(named[3], 10)
      : now.getFullYear();
    if (!named[3]) {
      const candidate = new Date(year, month - 1, day, 12);
      if (candidate.getTime() < now.getTime()) year += 1;
    }
    if (!month || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Hypothetical savings plan: apply a contribution today and/or a new deadline,
 * then recompute how much to set aside per month/week.
 */
export function computeGoalWhatIf(input: GoalWhatIfInput): GoalWhatIfResult {
  const now = input.now ?? new Date();
  const target = Number(input.goal.target_amount) || 0;
  const currentBefore = Number(input.goal.current_amount) || 0;
  const contributeAmount = Math.max(0, roundMoney(input.contributeAmount ?? 0));
  const currentAfter = roundMoney(currentBefore + contributeAmount);
  const remainingBefore = Math.max(0, roundMoney(target - currentBefore));
  const remainingAfter = Math.max(0, roundMoney(target - currentAfter));
  const deadline =
    input.deadline ||
    (input.goal.deadline
      ? input.goal.deadline.slice(0, 10)
      : null);

  let daysRemaining: number | null = null;
  if (deadline) {
    const end = parseISO(
      deadline.length === 10 ? `${deadline}T12:00:00` : deadline
    );
    daysRemaining = differenceInCalendarDays(end, now);
  }

  const before = neededPerPeriod(remainingBefore, daysRemaining);
  const after = neededPerPeriod(remainingAfter, daysRemaining);
  const alreadyReached = remainingAfter <= 0;
  const monthlySaved =
    before.monthly != null && after.monthly != null
      ? roundMoney(before.monthly - after.monthly)
      : null;

  const moneyLines: { label: string; amount: number }[] = [
    { label: "Target", amount: target },
    { label: "Già messo", amount: currentBefore },
  ];
  if (contributeAmount > 0) {
    moneyLines.push({ label: "Versamento oggi", amount: contributeAmount });
    moneyLines.push({ label: "Dopo il versamento", amount: currentAfter });
  }
  moneyLines.push({ label: "Manca ancora", amount: remainingAfter });
  if (after.monthly != null) {
    moneyLines.push({ label: "Da parte / mese", amount: after.monthly });
  }
  if (after.weekly != null) {
    moneyLines.push({ label: "Da parte / settimana", amount: after.weekly });
  }

  let summaryText: string;
  if (alreadyReached) {
    summaryText =
      contributeAmount > 0
        ? `Con ${formatEuro(contributeAmount)} in più su «${input.goal.name}» raggiungi già il target (${formatEuro(target)}).`
        : `«${input.goal.name}» è già raggiunto (${formatEuro(currentAfter)} / ${formatEuro(target)}).`;
  } else if (!deadline) {
    summaryText = `Su «${input.goal.name}» mancano ${formatEuro(remainingAfter)}${
      contributeAmount > 0
        ? ` dopo aver versato ${formatEuro(contributeAmount)} oggi`
        : ""
    }. Indica una scadenza (es. «entro il 15 febbraio») per calcolare quanto mettere da parte ogni mese.`;
  } else if (daysRemaining != null && daysRemaining <= 0) {
    summaryText = `La scadenza ${formatDeadlineIt(deadline)} è già passata: mancano ancora ${formatEuro(remainingAfter)}.`;
  } else {
    const parts: string[] = [];
    if (contributeAmount > 0) {
      parts.push(
        `Se oggi versi ${formatEuro(contributeAmount)} su «${input.goal.name}» (da ${formatEuro(currentBefore)} a ${formatEuro(currentAfter)}),`
      );
    } else {
      parts.push(`Per «${input.goal.name}» (ora ${formatEuro(currentBefore)} / ${formatEuro(target)}),`);
    }
    parts.push(
      `entro il ${formatDeadlineIt(deadline)} ti restano circa ${after.months} mesi: metti da parte ${formatEuro(after.monthly ?? 0)} al mese (o ${formatEuro(after.weekly ?? 0)} a settimana).`
    );
    if (monthlySaved != null && monthlySaved > 0 && contributeAmount > 0) {
      parts.push(
        `Risparmi circa ${formatEuro(monthlySaved)}/mese rispetto a non versare oggi.`
      );
    }
    summaryText = parts.join(" ");
  }

  return {
    goalName: input.goal.name,
    target,
    currentBefore,
    contributeAmount,
    currentAfter,
    remainingBefore,
    remainingAfter,
    deadline,
    daysRemaining,
    monthsRemaining: after.months,
    neededMonthlyBefore: before.monthly,
    neededMonthlyAfter: after.monthly,
    neededWeeklyAfter: after.weekly,
    monthlySaved,
    alreadyReached,
    summaryText,
    moneyLines,
  };
}
