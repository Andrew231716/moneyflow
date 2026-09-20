import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import { calcGoalProgress } from "@/lib/finance/engine";
import type { Goal } from "@/types/database";

export type GoalPaceStatus =
  | "on_track"
  | "behind"
  | "reached"
  | "no_deadline"
  | "no_progress";

export interface GoalMilestone {
  percent: 25 | 50 | 75 | 100;
  amount: number;
  reached: boolean;
}

export interface GoalTrajectory {
  goalId: string;
  goalName: string;
  percent: number;
  remaining: number;
  current: number;
  target: number;
  deadline: string | null;
  milestones: GoalMilestone[];
  daysElapsed: number;
  daysRemaining: number | null;
  avgMonthlyPace: number | null;
  avgWeeklyPace: number | null;
  neededMonthlyPace: number | null;
  neededWeeklyPace: number | null;
  projectedCompletionDate: string | null;
  status: GoalPaceStatus;
  statusLabel: string;
  forecastMessage: string;
}

const MILESTONE_PERCENTS = [25, 50, 75, 100] as const;
const DAYS_PER_MONTH = 30.437;
const DAYS_PER_WEEK = 7;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildGoalMilestones(
  current: number,
  target: number
): GoalMilestone[] {
  const t = Math.max(0, target);
  return MILESTONE_PERCENTS.map((percent) => {
    const amount = roundMoney((t * percent) / 100);
    return {
      percent,
      amount,
      reached: current + 1e-9 >= amount && t > 0,
    };
  });
}

/**
 * Deterministic pace + forecast for a goal.
 * Uses current_amount / days since created_at as historical pace when possible,
 * otherwise falls back to remaining / days-to-deadline as required pace.
 */
export function calcGoalTrajectory(
  goal: Goal,
  now: Date = new Date()
): GoalTrajectory {
  const { percent, remaining } = calcGoalProgress(goal);
  const current = Number(goal.current_amount);
  const target = Number(goal.target_amount);
  const deadline = goal.deadline;
  const milestones = buildGoalMilestones(current, target);

  const created = goal.created_at ? parseISO(goal.created_at) : now;
  const daysElapsed = Math.max(1, differenceInCalendarDays(now, created) + 1);

  const avgDaily = current > 0 ? current / daysElapsed : 0;
  const avgMonthlyPace = avgDaily > 0 ? roundMoney(avgDaily * DAYS_PER_MONTH) : null;
  const avgWeeklyPace = avgDaily > 0 ? roundMoney(avgDaily * DAYS_PER_WEEK) : null;

  let daysRemaining: number | null = null;
  let neededMonthlyPace: number | null = null;
  let neededWeeklyPace: number | null = null;

  if (deadline) {
    const end = parseISO(deadline.length === 10 ? `${deadline}T12:00:00` : deadline);
    daysRemaining = differenceInCalendarDays(end, now);
    if (remaining <= 0) {
      neededMonthlyPace = 0;
      neededWeeklyPace = 0;
    } else if (daysRemaining > 0) {
      const neededDaily = remaining / daysRemaining;
      neededMonthlyPace = roundMoney(neededDaily * DAYS_PER_MONTH);
      neededWeeklyPace = roundMoney(neededDaily * DAYS_PER_WEEK);
    } else {
      // Past deadline with remaining balance
      neededMonthlyPace = roundMoney(remaining);
      neededWeeklyPace = roundMoney(remaining / (DAYS_PER_MONTH / DAYS_PER_WEEK));
    }
  }

  let projectedCompletionDate: string | null = null;
  if (remaining <= 0) {
    projectedCompletionDate = format(now, "yyyy-MM-dd");
  } else if (avgDaily > 0) {
    const daysNeeded = Math.ceil(remaining / avgDaily);
    projectedCompletionDate = format(addDays(now, daysNeeded), "yyyy-MM-dd");
  }

  const { status, statusLabel, forecastMessage } = buildStatusCopy({
    goal,
    percent,
    remaining,
    deadline,
    daysRemaining,
    avgMonthlyPace,
    neededMonthlyPace,
    projectedCompletionDate,
  });

  return {
    goalId: goal.id,
    goalName: goal.name,
    percent,
    remaining: roundMoney(remaining),
    current,
    target,
    deadline,
    milestones,
    daysElapsed,
    daysRemaining,
    avgMonthlyPace,
    avgWeeklyPace,
    neededMonthlyPace,
    neededWeeklyPace,
    projectedCompletionDate,
    status,
    statusLabel,
    forecastMessage,
  };
}

function buildStatusCopy(params: {
  goal: Goal;
  percent: number;
  remaining: number;
  deadline: string | null;
  daysRemaining: number | null;
  avgMonthlyPace: number | null;
  neededMonthlyPace: number | null;
  projectedCompletionDate: string | null;
}): Pick<GoalTrajectory, "status" | "statusLabel" | "forecastMessage"> {
  const {
    goal,
    percent,
    remaining,
    deadline,
    daysRemaining,
    avgMonthlyPace,
    neededMonthlyPace,
    projectedCompletionDate,
  } = params;

  if (goal.settled) {
    return {
      status: "reached",
      statusLabel: "Saldato",
      forecastMessage: "Obiettivo saldato: i fondi non sono più disponibili.",
    };
  }

  if (goal.status === "completed" || remaining <= 0 || percent >= 100) {
    return {
      status: "reached",
      statusLabel: "Raggiunto",
      forecastMessage: "Obiettivo raggiunto. Complimenti!",
    };
  }

  if (!deadline) {
    const paceBit =
      avgMonthlyPace && avgMonthlyPace > 0
        ? ` Ritmo attuale: circa ${formatEuro(avgMonthlyPace)}/mese.`
        : "";
    return {
      status: "no_deadline",
      statusLabel: "Data mancante",
      forecastMessage: `Mancano ${formatEuro(remaining)} per completare.${paceBit}`,
    };
  }

  if (!avgMonthlyPace || avgMonthlyPace <= 0) {
    const need =
      neededMonthlyPace && neededMonthlyPace > 0
        ? `Serve circa ${formatEuro(neededMonthlyPace)} al mese per farcela entro la scadenza.`
        : daysRemaining !== null && daysRemaining <= 0
          ? `Scadenza superata: mancano ancora ${formatEuro(remaining)}.`
          : `Imposta i primi contributi per stimare la data di arrivo.`;
    return {
      status: "no_progress",
      statusLabel: "In ritardo",
      forecastMessage: need,
    };
  }

  const projectedLabel = projectedCompletionDate
    ? format(parseISO(projectedCompletionDate), "dd/MM/yyyy", { locale: it })
    : null;

  const deadlineDate = parseISO(
    deadline.length === 10 ? `${deadline}T12:00:00` : deadline
  );
  const onTrack =
    projectedCompletionDate != null &&
    parseISO(projectedCompletionDate) <= deadlineDate;

  if (onTrack) {
    return {
      status: "on_track",
      statusLabel: "In linea",
      forecastMessage: projectedLabel
        ? `Al ritmo attuale raggiungi circa il ${projectedLabel}.`
        : `Sei in linea con la scadenza.`,
    };
  }

  const needMsg =
    neededMonthlyPace && neededMonthlyPace > 0
      ? ` Serve circa ${formatEuro(neededMonthlyPace)} al mese per farcela entro la scadenza.`
      : "";

  return {
    status: "behind",
    statusLabel: "In ritardo",
    forecastMessage: projectedLabel
      ? `Al ritmo attuale raggiungi circa il ${projectedLabel}.${needMsg}`
      : `Sei in ritardo sulla scadenza.${needMsg}`,
  };
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);
}

/** Prefer active goals with a deadline; Matrimonio-style names first. */
export function pickPrimaryGoal(goals: Goal[]): Goal | null {
  const active = goals.filter(
    (g) => g.status === "active" && !g.settled
  );
  if (!active.length) {
    const reachedOpen = goals.filter(
      (g) =>
        !g.settled &&
        (g.status === "completed" ||
          Number(g.current_amount) >= Number(g.target_amount))
    );
    return reachedOpen[0] ?? null;
  }
  const matrimonio = active.find((g) => /matrimonio/i.test(g.name));
  if (matrimonio) return matrimonio;
  const withDeadline = active
    .filter((g) => g.deadline)
    .sort((a, b) => {
      const da = a.deadline ? parseISO(a.deadline).getTime() : Infinity;
      const db = b.deadline ? parseISO(b.deadline).getTime() : Infinity;
      return da - db;
    });
  return withDeadline[0] ?? active[0];
}

export function calcGoalTrajectories(
  goals: Goal[],
  now: Date = new Date()
): GoalTrajectory[] {
  return goals
    .filter((g) => !g.settled && (g.status === "active" || g.status === "completed"))
    .map((g) => calcGoalTrajectory(g, now));
}

/**
 * How many weeks sooner a goal is reached if monthly savings increase by `extraMonthly`.
 */
export function estimateWeeksFaster(params: {
  remaining: number;
  monthlyPace: number;
  extraMonthly: number;
}): number {
  const { remaining, monthlyPace, extraMonthly } = params;
  if (remaining <= 0 || extraMonthly <= 0) return 0;
  const base = Math.max(monthlyPace, 0.01);
  const monthsNow = remaining / base;
  const monthsWith = remaining / (base + extraMonthly);
  const weeks = (monthsNow - monthsWith) * (DAYS_PER_MONTH / DAYS_PER_WEEK);
  return Math.max(0, Math.round(weeks * 10) / 10);
}
