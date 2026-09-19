import { AppShell } from "@/components/layout/app-shell";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { fetchTransactions } from "@/lib/data/queries";
import {
  calcExpenseByCategory,
  calcMonthlySeries,
} from "@/lib/finance/engine";
import { StatisticsView } from "@/features/analytics/statistics-view";

export default async function StatisticsPage() {
  if (!hasSupabaseEnv()) return null;
  const transactions = await fetchTransactions(12);
  return (
    <AppShell title="Statistiche">
      <StatisticsView
        series6={calcMonthlySeries(transactions, 6)}
        series12={calcMonthlySeries(transactions, 12)}
        byCategory={calcExpenseByCategory(transactions)}
      />
    </AppShell>
  );
}
