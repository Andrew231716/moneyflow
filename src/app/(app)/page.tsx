import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import {
  fetchAccounts,
  fetchBudgets,
  fetchCategories,
  fetchDebts,
  fetchGoals,
  fetchRecurring,
  fetchRules,
  fetchTransactions,
} from "@/lib/data/queries";
import { DashboardView } from "@/features/analytics/dashboard-view";
import { UpcomingPayments } from "@/features/analytics/upcoming-payments";
import {
  calcBudgetProgress,
  calcExpenseByCategory,
  calcMonthSummary,
  calcMonthlySeries,
  calcDisponibilitaTotale,
  calcNetWorth,
  calcOpenDebtsTotal,
  calcReservedGoalsTotal,
  forecastMonthEnd,
  generateInsights,
} from "@/lib/finance/engine";
import {
  groupBalancesByCurrency,
  primaryCurrencyTotal,
} from "@/lib/finance/currency";
import { rankCutPotential } from "@/lib/finance/cut-potential";
import { calcGoalTrajectories } from "@/lib/finance/goal-trajectory";
import { buildUpcomingPayments } from "@/lib/finance/upcoming-payments";
import { countSyncReviewItems } from "@/lib/finance/sync-review";
import { buildConsentAlerts } from "@/features/alerts/build-consent-alerts";
import { listBankConnectionsForAlerts } from "@/features/open-banking/list-connections";
import { createClient } from "@/lib/supabase/server";
import { subMonths } from "date-fns";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    accounts,
    transactions,
    budgets,
    goals,
    recurring,
    debts,
    categories,
    rules,
    connections,
  ] = await Promise.all([
    fetchAccounts(),
    fetchTransactions(12),
    fetchBudgets(),
    fetchGoals(),
    fetchRecurring(),
    fetchDebts(),
    fetchCategories(),
    fetchRules().catch(() => []),
    user
      ? listBankConnectionsForAlerts({
          supabase,
          userId: user.id,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const now = new Date();
  const summary = calcMonthSummary(transactions, now);
  const previousSummary = calcMonthSummary(transactions, subMonths(now, 1));
  const series = calcMonthlySeries(transactions, 6);
  const byCategory = calcExpenseByCategory(transactions, now);
  const budgetProgress = calcBudgetProgress(budgets, transactions, now);
  const forecast = forecastMonthEnd(transactions, recurring, now);
  const insights = generateInsights({
    summary,
    budgets: budgetProgress,
    goals,
    forecast,
    previousSummary,
  });
  const reservedGoalsTotal = calcReservedGoalsTotal(goals);
  const primary = primaryCurrencyTotal(accounts);
  const availability = calcDisponibilitaTotale(accounts);
  const openDebtsTotal = calcOpenDebtsTotal(debts);
  const netWorth = calcNetWorth(availability, debts);
  const recent = transactions.filter((t) => t.type !== "transfer").slice(0, 8);
  const savingsAccounts = accounts.filter((a) => a.type === "savings");
  const cutPotential = rankCutPotential({
    transactions,
    budgets,
    goals,
    month: now,
    limit: 4,
  });
  const goalTrajectories = calcGoalTrajectories(goals, now).filter(
    (t) => !goals.find((g) => g.id === t.goalId)?.settled
  );
  const consentAlerts = buildConsentAlerts(connections);
  const currencyGroups = groupBalancesByCurrency(accounts);
  const review = countSyncReviewItems(transactions);
  const predictedCount = buildUpcomingPayments({
    recurring,
    debts,
    transactions,
    includePredicted: true,
    asOf: now,
    limit: 20,
  }).filter((i) => i.source === "predicted").length;

  return (
    <AppShell title="Home">
      <DashboardView
        upcoming={
          <UpcomingPayments
            recurring={recurring}
            debts={debts}
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            forecast={forecast}
          />
        }
        availability={availability}
        availabilityCurrency={primary.currency}
        currencyGroups={currencyGroups}
        summary={summary}
        previousSummary={previousSummary}
        series={series}
        byCategory={byCategory}
        budgetProgress={budgetProgress}
        goals={goals}
        savingsAccounts={savingsAccounts}
        reservedGoalsTotal={reservedGoalsTotal}
        debts={debts}
        openDebtsTotal={openDebtsTotal}
        netWorth={netWorth}
        recent={recent}
        allTransactions={transactions}
        categories={categories}
        rules={rules}
        triage={{
          pendingCount: review.pending,
          uncategorizedCount: review.uncategorized,
          predictedCount,
          transferPairCount: review.transfers,
        }}
        insights={insights}
        cutPotential={cutPotential}
        goalTrajectories={goalTrajectories.slice(0, 3)}
        consentAlerts={consentAlerts}
        isEmpty={accounts.length === 0 && transactions.length === 0}
      />
    </AppShell>
  );
}
