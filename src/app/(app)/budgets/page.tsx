import { format, startOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchBudgets, fetchCategories, fetchTransactions } from "@/lib/data/queries";
import { calcBudgetProgress, calcExpenseByCategory } from "@/lib/finance/engine";
import { BudgetsManager } from "@/features/budgets/budgets-manager";
import { resolveBudgetMonth } from "@/features/budgets/month";
import { toMonthStart } from "@/lib/utils";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams?: Promise<{ month?: string }>;
}) {
  if (!hasSupabaseEnv()) return null;

  const sp = (await searchParams) ?? {};
  const month = resolveBudgetMonth(sp.month);
  const monthKey = format(month, "yyyy-MM");
  const now = new Date();
  const monthsBack = Math.max(
    2,
    (now.getFullYear() - month.getFullYear()) * 12 +
      (now.getMonth() - month.getMonth()) +
      1
  );

  const [budgets, previousBudgets, transactions, categories] = await Promise.all([
    fetchBudgets(month),
    fetchBudgets(subMonths(month, 1)),
    fetchTransactions(Math.min(24, monthsBack + 1)),
    fetchCategories(),
  ]);

  const progress = calcBudgetProgress(budgets, transactions, month);
  const topExpenses = calcExpenseByCategory(transactions, month);
  const monthLabel = format(month, "LLLL yyyy", { locale: it });
  const isCurrentMonth =
    toMonthStart(month) === toMonthStart(startOfMonth(now));

  return (
    <AppShell title="Budget">
      <BudgetsManager
        progress={progress}
        categories={categories}
        topExpenses={topExpenses}
        monthIso={toMonthStart(month)}
        monthKey={monthKey}
        monthLabel={monthLabel}
        isCurrentMonth={isCurrentMonth}
        previousMonthBudgets={previousBudgets.map((b) => ({
          category_id: b.category_id,
          amount: Number(b.amount),
          name: b.category?.name ?? "Categoria",
        }))}
      />
    </AppShell>
  );
}
