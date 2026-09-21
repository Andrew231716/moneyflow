import { differenceInCalendarDays, parseISO } from "date-fns";
import {
  rankCutPotential,
  type CutPotentialTip,
} from "@/lib/finance/cut-potential";
import { calcGoalTrajectory } from "@/lib/finance/goal-trajectory";
import type { Budget, Goal, Transaction } from "@/types/database";

const DAYS_PER_MONTH = 30.437;
const DAYS_PER_WEEK = 7;

export interface GoalSavingsPlan {
  goalId: string;
  goalName: string;
  target: number;
  current: number;
  remaining: number;
  deadline: string | null;
  monthsRemaining: number | null;
  daysRemaining: number | null;
  neededMonthly: number | null;
  neededWeekly: number | null;
  cutTips: CutPotentialTip[];
  totalSuggestedCut: number;
  coverageRatio: number | null;
  statusMessage: string;
  adviceMessage: string;
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

/**
 * Piano di risparmio verso un obiettivo: quanto mettere da parte al mese
 * e da quali categorie di spesa è più realistico tagliare.
 */
export function buildGoalSavingsPlan(params: {
  goal: Goal;
  transactions: Transaction[];
  budgets?: Budget[];
  month?: Date;
  tipLimit?: number;
}): GoalSavingsPlan {
  const {
    goal,
    transactions,
    budgets = [],
    month = new Date(),
    tipLimit = 4,
  } = params;

  const trajectory = calcGoalTrajectory(goal, month);
  const remaining = Math.max(0, trajectory.remaining);
  const target = trajectory.target;
  const current = trajectory.current;

  let monthsRemaining: number | null = null;
  let daysRemaining = trajectory.daysRemaining;
  let neededMonthly: number | null = null;
  let neededWeekly: number | null = null;

  if (goal.deadline) {
    const end = parseISO(
      goal.deadline.length === 10 ? `${goal.deadline}T12:00:00` : goal.deadline
    );
    daysRemaining = differenceInCalendarDays(end, month);
    if (remaining <= 0) {
      monthsRemaining = 0;
      neededMonthly = 0;
      neededWeekly = 0;
    } else if (daysRemaining != null && daysRemaining > 0) {
      monthsRemaining = roundMoney(daysRemaining / DAYS_PER_MONTH);
      neededMonthly = roundMoney(remaining / (daysRemaining / DAYS_PER_MONTH));
      neededWeekly = roundMoney(remaining / (daysRemaining / DAYS_PER_WEEK));
    } else if (daysRemaining != null && daysRemaining <= 0) {
      monthsRemaining = 0;
      neededMonthly = remaining;
      neededWeekly = remaining;
    }
  }

  const cut = rankCutPotential({
    transactions,
    budgets,
    goals: [goal],
    month,
    limit: tipLimit,
  });

  const cutTips = cut.tips;
  const totalSuggestedCut = roundMoney(
    cutTips.reduce((s, t) => s + t.suggestedMonthlyCut, 0)
  );
  const coverageRatio =
    neededMonthly != null && neededMonthly > 0
      ? roundMoney(totalSuggestedCut / neededMonthly)
      : null;

  let statusMessage: string;
  if (remaining <= 0) {
    statusMessage = "Obiettivo già raggiunto.";
  } else if (!goal.deadline) {
    statusMessage = `Mancano ${formatEuro(remaining)}. Imposta una scadenza per calcolare quanto mettere da parte ogni mese.`;
  } else if (daysRemaining != null && daysRemaining <= 0) {
    statusMessage = `Scadenza superata: mancano ancora ${formatEuro(remaining)}.`;
  } else {
    statusMessage = `Per «${goal.name}» entro ${goal.deadline}: metti da parte circa ${formatEuro(neededMonthly ?? 0)}/mese (${formatEuro(neededWeekly ?? 0)}/settimana).`;
  }

  let adviceMessage: string;
  if (remaining <= 0) {
    adviceMessage = "Puoi segnare l'obiettivo come saldato quando usi i fondi.";
  } else if (cutTips.length === 0) {
    adviceMessage =
      "Non ci sono ancora tagli evidenti sulle spese categorizzate: sincronizza i movimenti o assegna le categorie, poi riprova.";
  } else if (coverageRatio != null && coverageRatio >= 0.9) {
    adviceMessage = `Tagliando queste categorie potresti coprire quasi tutto il piano (${formatEuro(totalSuggestedCut)}/mese suggeriti).`;
  } else if (coverageRatio != null && coverageRatio > 0) {
    adviceMessage = `I tagli suggeriti coprono circa ${(coverageRatio * 100).toFixed(0)}% del fabbisogno mensile (${formatEuro(totalSuggestedCut)} su ${formatEuro(neededMonthly ?? 0)}). Integra con trasferimento al salvadanaio.`;
  } else {
    adviceMessage = `Parti da questi tagli (${formatEuro(totalSuggestedCut)}/mese) e sposta la differenza sul salvadanaio.`;
  }

  return {
    goalId: goal.id,
    goalName: goal.name,
    target,
    current,
    remaining,
    deadline: goal.deadline,
    monthsRemaining,
    daysRemaining,
    neededMonthly,
    neededWeekly,
    cutTips,
    totalSuggestedCut,
    coverageRatio,
    statusMessage,
    adviceMessage,
  };
}
