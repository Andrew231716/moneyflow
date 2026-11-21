"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader,
  ChartCard,
  MoneyValue,
  EmptyState,
  ExpandableText,
  CutPotentialSection,
  GoalTrajectoryCard,
  SectionHeader,
} from "@/components/money";
import { MonthlyExportPanel } from "@/features/analytics/monthly-export-panel";
import type { CutPotentialResult } from "@/lib/finance/cut-potential";
import type { GoalTrajectory } from "@/lib/finance/goal-trajectory";
import type { Account, BudgetProgress, Goal, MonthSummary, Transaction } from "@/types/database";

export function StatisticsView({
  series6,
  series12,
  byCategory,
  previousByCategory,
  cutPotential,
  goalTrajectories,
  summary,
  previousSummary,
  transactions,
  accounts,
  budgetProgress,
  goals,
}: {
  series6: { label: string; income: number; expense: number; savings: number }[];
  series12: { label: string; income: number; expense: number; savings: number }[];
  byCategory: { name: string; color: string; total: number; categoryId: string | null }[];
  previousByCategory: { name: string; color: string; total: number }[];
  cutPotential: CutPotentialResult;
  goalTrajectories: GoalTrajectory[];
  summary: MonthSummary;
  previousSummary: MonthSummary;
  transactions: Transaction[];
  accounts: Account[];
  budgetProgress: BudgetProgress[];
  goals: Goal[];
}) {
  const comparison = buildCategoryComparison(byCategory, previousByCategory);
  const router = useRouter();
  const review = comparison.slice().sort((a, b) =>
    Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Statistiche"
        description="Andamento entrate e uscite, confronto mesi e export"
      />

      <MonthlyExportPanel
        summary={summary}
        previousSummary={previousSummary}
        transactions={transactions}
        accounts={accounts}
        budgetProgress={budgetProgress}
        goals={goals}
        byCategory={byCategory}
      />
      <section className="mf-surface space-y-2 p-4">
        <h2 className="font-semibold">Riepilogo del mese</h2>
        <ul className="space-y-2 text-sm">
          {byCategory.slice(0, 5).map((category) => (
            <li key={category.categoryId ?? "uncategorized"}>
              <Link className="flex justify-between gap-2 underline"
                href={`/transactions?category=${category.categoryId ?? "uncategorized"}&month=${format(new Date(), "yyyy-MM")}`}>
                <span>{category.name}</span><span>{formatCurrency(category.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
        {review[0] && review[0].current !== review[0].previous && (
          <p className="text-sm">Variazione maggiore nel confronto: {review[0].name} · {formatCurrency(review[0].current - review[0].previous)}</p>
        )}
        <Link className="text-sm text-primary underline" href="/transactions?pending=1">Controlla i movimenti in sospeso</Link>
      </section>

      <Tabs defaultValue="6">
        <TabsList>
          <TabsTrigger value="6" className="min-h-10">6 mesi</TabsTrigger>
          <TabsTrigger value="12" className="min-h-10">12 mesi</TabsTrigger>
        </TabsList>
        <TabsContent value="6" className="mt-4 space-y-4">
          <SeriesChart title="Ultimi 6 mesi" data={series6} />
          <SavingsTrend title="Risparmio mensile (6 mesi)" data={series6} />
        </TabsContent>
        <TabsContent value="12" className="mt-4 space-y-4">
          <SeriesChart title="Ultimi 12 mesi" data={series12} />
          <SavingsTrend title="Risparmio mensile (12 mesi)" data={series12} />
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Categorie del mese" description="Uscite · trasferimenti esclusi" contentClassName="h-72">
          {byCategory.length === 0 ? (
            <EmptyState
              className="border-0 shadow-none py-8"
              title="Nessun dato"
              description="Quando registri spese, appariranno qui."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory.slice(0, 8)}
                  dataKey="total"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={90}
                  paddingAngle={2}
                  onClick={(_, index) => {
                    const category = byCategory[index];
                    if (category) router.push(`/transactions?category=${category.categoryId ?? "uncategorized"}&month=${format(new Date(), "yyyy-MM")}`);
                  }}
                >
                  {byCategory.slice(0, 8).map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Confronto vs mese scorso"
          description="Stesse categorie · delta uscite"
          contentClassName="h-72"
        >
          {comparison.length === 0 ? (
            <EmptyState
              className="border-0 shadow-none py-8"
              title="Nessun confronto"
              description="Servono spese in entrambi i mesi."
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparison} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="current" name="Questo mese" fill="hsl(0 72% 48%)" radius={4} />
                <Bar dataKey="previous" name="Mese scorso" fill="hsl(215 16% 60%)" radius={4} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CutPotentialSection result={cutPotential} />
        <section className="space-y-4">
          <div className="px-1">
            <SectionHeader
              title="Tappe obiettivi"
              description="Ritmo e previsione rispetto alla scadenza"
              href="/goals"
            />
          </div>
          {goalTrajectories.length === 0 ? (
            <EmptyState
              className="py-8"
              title="Nessun obiettivo"
              description="Crea un obiettivo con data per vedere le tappe."
            />
          ) : (
            <div className="space-y-3">
              {goalTrajectories.map((t) => (
                <GoalTrajectoryCard key={t.goalId} trajectory={t} />
              ))}
            </div>
          )}
        </section>
      </div>

      <ChartCard title="Top categorie" description="Dettaglio importi del mese">
        {byCategory.length === 0 ? (
          <EmptyState
            className="border-0 shadow-none py-8"
            title="Nessun dato"
            description="Quando registri spese, appariranno qui."
          />
        ) : (
          <div className="space-y-3">
            {byCategory.slice(0, 8).map((c) => (
              <div
                key={c.name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: c.color }}
                    aria-hidden
                  />
                  <ExpandableText>{c.name}</ExpandableText>
                </span>
                <MoneyValue amount={c.total} size="sm" tone="danger" />
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  );
}

function buildCategoryComparison(
  current: { name: string; color: string; total: number }[],
  previous: { name: string; color: string; total: number }[]
) {
  const prevMap = new Map(previous.map((c) => [c.name, c.total]));
  const names = new Set([
    ...current.slice(0, 6).map((c) => c.name),
    ...previous.slice(0, 6).map((c) => c.name),
  ]);
  return Array.from(names)
    .map((name) => ({
      name,
      current: current.find((c) => c.name === name)?.total ?? 0,
      previous: prevMap.get(name) ?? 0,
    }))
    .sort((a, b) => b.current + b.previous - (a.current + a.previous))
    .slice(0, 6);
}

function SeriesChart({
  title,
  data,
}: {
  title: string;
  data: { label: string; income: number; expense: number; savings: number }[];
}) {
  return (
    <ChartCard title={title} contentClassName="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip
            formatter={(v: number) => formatCurrency(v)}
            contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
          />
          <Legend />
          <Bar dataKey="income" name="Entrate" fill="hsl(152 64% 34%)" radius={4} />
          <Bar dataKey="expense" name="Uscite" fill="hsl(0 72% 48%)" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function SavingsTrend({
  title,
  data,
}: {
  title: string;
  data: { label: string; savings: number }[];
}) {
  return (
    <ChartCard title={title} contentClassName="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} width={48} />
          <Tooltip formatter={(v: number) => formatCurrency(v)} />
          <Line
            type="monotone"
            dataKey="savings"
            name="Risparmio"
            stroke="hsl(173 80% 30%)"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
