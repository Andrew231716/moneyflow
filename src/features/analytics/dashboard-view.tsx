"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Wallet, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type {
  Account,
  BudgetProgress,
  Goal,
  Insight,
  MonthSummary,
  Transaction,
} from "@/types/database";
import type { CutPotentialResult } from "@/lib/finance/cut-potential";
import type { GoalTrajectory } from "@/lib/finance/goal-trajectory";
import { DemoSeedButton } from "@/features/analytics/demo-seed-button";
import { DashboardSyncStatus } from "@/features/open-banking/components/dashboard-sync-status";
import {
  StatCard,
  MoneyValue,
  BudgetCard,
  TransactionItem,
  GoalCard,
  AccountCard,
  InsightCard,
  CutPotentialSection,
  GoalTrajectoryCard,
  EmptyState,
  SectionHeader,
  QuickActions,
  ChartCard,
  defaultQuickActions,
} from "@/components/money";

export function DashboardView(props: {
  availability: number;
  summary: MonthSummary;
  previousSummary: MonthSummary;
  series: {
    month: string;
    label: string;
    income: number;
    expense: number;
    savings: number;
  }[];
  byCategory: { categoryId: string | null; name: string; color: string; total: number }[];
  budgetProgress: BudgetProgress[];
  goals: Goal[];
  savingsAccounts: Account[];
  reservedGoalsTotal: number;
  recent: Transaction[];
  forecast: {
    projectedExpense: number;
    projectedIncome: number;
    projectedSavings: number;
    daysLeft: number;
    dailyBurn: number;
  };
  insights: Insight[];
  cutPotential: CutPotentialResult;
  goalTrajectories: GoalTrajectory[];
  isEmpty: boolean;
}) {
  const {
    availability,
    summary,
    previousSummary,
    series,
    byCategory,
    budgetProgress,
    goals,
    savingsAccounts,
    reservedGoalsTotal,
    recent,
    forecast,
    insights,
    cutPotential,
    goalTrajectories,
    isEmpty,
  } = props;
  const savingsBalance = savingsAccounts.reduce((s, a) => s + Number(a.balance), 0);
  const liquidBalance = availability - savingsBalance;
  const reservedGoals = goals.filter(
    (g) => g.status !== "cancelled" && !g.settled
  );
  const activeGoals = reservedGoals.filter((g) => g.status === "active");
  const highlightGoals = reservedGoals.slice(0, 4);

  const router = useRouter();
  const savingsDelta = summary.savings - previousSummary.savings;
  const savingsDeltaPositive = savingsDelta >= 0;

  const quickActions = defaultQuickActions({
    onExpense: () => router.push("/transactions?new=expense"),
    onIncome: () => router.push("/transactions?new=income"),
    onTransfer: () => router.push("/transactions?new=transfer"),
    importHref: "/transactions/import",
  });

  return (
    <div className="space-y-6">
      {isEmpty && (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="Benvenuto in MoneyFlow"
          description="Aggiungi un conto o carica dati demo per iniziare. Puoi anche collegare una banca."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/accounts">Crea un conto</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/accounts/connect-bank">Collega banca</Link>
              </Button>
              <DemoSeedButton />
            </div>
          }
        />
      )}

      <StatCard
        hero
        title="Disponibilità"
        value={availability}
        hint={
          savingsBalance > 0
            ? `Liquidi ${formatCurrency(liquidBalance)} · Salvadanaio ${formatCurrency(savingsBalance)}`
            : "Tutti i conti"
        }
        trend={{
          label:
            previousSummary.savings === 0 && summary.savings === 0
              ? "Risparmio mese corrente"
              : `${savingsDeltaPositive ? "+" : ""}${formatCurrency(savingsDelta)} vs mese scorso`,
          positive: savingsDelta === 0 ? undefined : savingsDeltaPositive,
        }}
      />

      <QuickActions actions={quickActions} />

      <DashboardSyncStatus />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard title="Entrate" value={summary.income} tone="success" hint="Mese corrente" />
        <StatCard title="Uscite" value={summary.expense} tone="danger" hint="Mese corrente" />
        <StatCard
          title="Risparmio"
          value={summary.savings}
          tone={summary.savings >= 0 ? "success" : "danger"}
          hint={`${summary.savingsRate.toFixed(0)}% delle entrate`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Andamento"
          description="Entrate vs uscite · 6 mesi"
          className="lg:col-span-2"
          contentClassName="h-56 sm:h-64"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(152 64% 34%)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(152 64% 34%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(0 72% 48%)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(0 72% 48%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={48} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))" }}
              />
              <Area
                type="monotone"
                dataKey="income"
                name="Entrate"
                stroke="hsl(152 64% 34%)"
                fill="url(#inc)"
              />
              <Area
                type="monotone"
                dataKey="expense"
                name="Uscite"
                stroke="hsl(0 72% 48%)"
                fill="url(#exp)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Categorie" description="Spese del mese" contentClassName="h-56 sm:h-64">
          {byCategory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Nessuna spesa</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byCategory.slice(0, 6)}
                  dataKey="total"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {byCategory.slice(0, 6).map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {(savingsAccounts.length > 0 || reservedGoals.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="mf-surface p-5 space-y-4">
            <SectionHeader
              title="Salvadanaio"
              description={
                savingsAccounts.length > 0
                  ? `${formatCurrency(savingsBalance)} nei conti risparmio`
                  : "Conti risparmio"
              }
              href="/accounts"
              linkLabel="Conti"
            />
            {savingsAccounts.length > 0 ? (
              <div className="space-y-3">
                <MoneyValue amount={savingsBalance} size="lg" tone="success" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {savingsAccounts.slice(0, 3).map((a) => (
                    <AccountCard key={a.id} account={a} />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Fonte di verità per la disponibilità: i saldi conti. Gli
                  obiettivi riservati a destra possono già essere inclusi qui.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun conto risparmio. Creane uno per il Salvadanaio.
              </p>
            )}
          </section>

          <section className="mf-surface p-5 space-y-4">
            <SectionHeader
              title="Obiettivi"
              description="Somma non saldata (ancora disponibile)"
              href="/goals"
            />
            <MoneyValue amount={reservedGoalsTotal} size="lg" tone="success" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Include obiettivi raggiunti ma non ancora saldati. Dopo{" "}
              <span className="font-medium text-foreground">Saldato</span> escono
              da questo totale (e, se confermi, dal Salvadanaio).
            </p>
            {highlightGoals.length > 0 ? (
              <div className="space-y-3">
                {highlightGoals.slice(0, 3).map((g) => (
                  <GoalCard key={g.id} goal={g} compact />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nessun obiettivo riservato
              </p>
            )}
          </section>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <CutPotentialSection result={cutPotential} compact />

        <section className="space-y-4">
          <div className="px-1">
            <SectionHeader
              title="Tappe obiettivi"
              description="Ritmo e previsione rispetto alla scadenza"
              href="/goals"
            />
          </div>
          {goalTrajectories.length === 0 ? (
            <div className="mf-surface p-5">
              <p className="text-sm text-muted-foreground">
                Nessun obiettivo da monitorare
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {goalTrajectories.map((t) => (
                <GoalTrajectoryCard key={t.goalId} trajectory={t} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="mf-surface p-5 space-y-4">
          <SectionHeader title="Budget" description="Progresso mensile" href="/budgets" />
          {budgetProgress.length === 0 ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">Nessun budget impostato</p>
              <Button asChild size="sm" variant="outline" className="min-h-touch">
                <Link href="/budgets">Imposta dai top spese</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {budgetProgress.slice(0, 4).map((b) => (
                <BudgetCard key={b.budget.id} progress={b} compact />
              ))}
            </div>
          )}
        </section>

        <section className="mf-surface p-5 space-y-4">
          <SectionHeader title="Obiettivi" href="/goals" />
          {activeGoals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nessun obiettivo attivo</p>
          ) : (
            <div className="space-y-3">
              {activeGoals.slice(0, 3).map((g) => (
                <GoalCard key={g.id} goal={g} compact />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="mf-surface p-5 space-y-3 lg:col-span-2">
          <SectionHeader title="Ultimi movimenti" href="/transactions" linkLabel="Tutti" />
          {recent.length === 0 ? (
            <EmptyState
              className="border-0 shadow-none py-8"
              icon={<Wallet className="h-5 w-5" />}
              title="Nessun movimento"
              description="Registra una spesa, importa CSV o sincronizza la banca collegata."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild size="sm">
                    <Link href="/transactions?new=expense">Nuova spesa</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/accounts">Sincronizza banca</Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <div className="divide-y divide-border/60 -mx-1">
              {recent.map((tx) => (
                <TransactionItem key={tx.id} transaction={tx} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="mf-surface p-5 space-y-3">
            <SectionHeader
              title="Previsione"
              description={`${forecast.daysLeft} giorni rimanenti`}
            />
            <div className="space-y-2.5 text-sm">
              <ForecastRow label="Entrate stimate" amount={forecast.projectedIncome} tone="success" />
              <ForecastRow label="Uscite stimate" amount={forecast.projectedExpense} tone="danger" />
              <ForecastRow label="Saldo stimato" amount={forecast.projectedSavings} strong />
            </div>
          </div>

          <div className="mf-surface p-5 space-y-3">
            <SectionHeader title="Insight" description="Suggerimenti automatici" />
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun insight per ora</p>
            ) : (
              <div className="space-y-2">
                {insights.slice(0, 4).map((i) => (
                  <InsightCard key={i.id} insight={i} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ForecastRow({
  label,
  amount,
  tone,
  strong,
}: {
  label: string;
  amount: number;
  tone?: "success" | "danger";
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-muted-foreground">{label}</span>
      <MoneyValue
        amount={amount}
        size="sm"
        tone={tone ?? "default"}
        className={strong ? "font-bold" : undefined}
      />
    </div>
  );
}
