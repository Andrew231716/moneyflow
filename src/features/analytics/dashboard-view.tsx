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
  Category,
  ClassificationRule,
  Debt,
  Goal,
  Insight,
  MonthSummary,
  Transaction,
} from "@/types/database";
import type { CutPotentialResult } from "@/lib/finance/cut-potential";
import type { GoalTrajectory } from "@/lib/finance/goal-trajectory";
import { DemoSeedButton } from "@/features/analytics/demo-seed-button";
import { DashboardSyncStatus } from "@/features/open-banking/components/dashboard-sync-status";
import { AppAlerts } from "@/features/alerts/app-alerts";
import type { BankConsentAlert } from "@/features/alerts/build-consent-alerts";
import { HomeTriage } from "@/features/analytics/home-triage";
import { PwaInstallNudge } from "@/features/pwa/install-nudge";
import {
  StatCard,
  MoneyValue,
  BudgetCard,
  TransactionItem,
  GoalCard,
  InsightCard,
  CutPotentialSection,
  EmptyState,
  ExpandableText,
  SectionHeader,
  QuickActions,
  ChartCard,
  defaultQuickActions,
} from "@/components/money";

export function DashboardView(props: {
  upcoming: React.ReactNode;
  availability: number;
  availabilityCurrency: string;
  currencyGroups: { currency: string; total: number }[];
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
  debts: Debt[];
  openDebtsTotal: number;
  netWorth: number;
  recent: Transaction[];
  allTransactions: Transaction[];
  categories: Category[];
  rules: ClassificationRule[];
  triage: {
    pendingCount: number;
    uncategorizedCount: number;
    predictedCount: number;
    transferPairCount: number;
  };
  insights: Insight[];
  cutPotential: CutPotentialResult;
  goalTrajectories: GoalTrajectory[];
  consentAlerts: BankConsentAlert[];
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
    debts,
    openDebtsTotal,
    netWorth,
    recent,
    allTransactions,
    categories,
    rules,
    triage,
    insights,
    cutPotential,
    goalTrajectories,
    consentAlerts,
    availabilityCurrency,
    currencyGroups,
    isEmpty,
  } = props;

  const savingsBalance = savingsAccounts
    .filter(
      (a) => (a.currency || "EUR").toUpperCase() === availabilityCurrency
    )
    .reduce((s, a) => s + Number(a.balance), 0);
  const liquidBalance = availability - savingsBalance;
  const reservedGoals = goals.filter(
    (g) => g.status !== "cancelled" && !g.settled
  );
  const highlightGoals = reservedGoals.slice(0, 3);
  const openDebts = debts.filter((d) => !d.paid_at).slice(0, 3);

  const router = useRouter();
  const savingsDelta = summary.savings - previousSummary.savings;
  const savingsDeltaPositive = savingsDelta >= 0;

  const quickActions = defaultQuickActions({
    onExpense: () => router.push("/transactions?new=expense"),
    onIncome: () => router.push("/transactions?new=income"),
    onTransfer: () => router.push("/transactions?new=transfer"),
    importHref: "/transactions/import",
  });

  const monthLabel = new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/Rome",
  }).format(new Date());

  return (
    <div className="space-y-4 sm:space-y-5">
      {isEmpty && (
        <EmptyState
          icon={<Sparkles className="h-6 w-6" />}
          title="Benvenuto in MoneyFlow"
          description="Aggiungi un conto o collega la banca per iniziare."
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

      <AppAlerts
        consentAlerts={consentAlerts}
        budgetProgress={budgetProgress}
        goals={goals}
      />

      <StatCard
        hero
        title="Disponibilità"
        value={availability}
        currency={availabilityCurrency}
        hint={
          [
            currencyGroups.length > 1
              ? `Solo ${availabilityCurrency}`
              : null,
            reservedGoalsTotal > 0 || savingsBalance > 0
              ? [
                  `Liquidi ${formatCurrency(liquidBalance, availabilityCurrency)}`,
                  savingsBalance > 0
                    ? `Risparmio ${formatCurrency(savingsBalance, availabilityCurrency)}`
                    : null,
                  reservedGoalsTotal > 0
                    ? `Obiettivi ${formatCurrency(reservedGoalsTotal)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        trend={{
          label:
            previousSummary.savings === 0 && summary.savings === 0
              ? "Questo mese"
              : `${savingsDeltaPositive ? "+" : ""}${formatCurrency(savingsDelta)} vs mese scorso`,
          positive: savingsDelta === 0 ? undefined : savingsDeltaPositive,
        }}
      />

      {currencyGroups.length > 1 && (
        <div className="flex flex-wrap gap-3 text-sm px-1">
          {currencyGroups.map((g) => (
            <span key={g.currency} className="text-muted-foreground">
              {g.currency}{" "}
              <MoneyValue amount={g.total} currency={g.currency} size="sm" />
            </span>
          ))}
        </div>
      )}

      {openDebtsTotal > 0 && (
        <div className="flex items-center justify-between gap-2 text-sm px-1">
          <span className="text-muted-foreground">Netto dopo debiti</span>
          <MoneyValue
            amount={netWorth}
            currency={availabilityCurrency}
            size="sm"
            tone={netWorth >= 0 ? "success" : "danger"}
          />
        </div>
      )}

      <HomeTriage
        {...triage}
        transactions={allTransactions}
        categories={categories}
        rules={rules}
      />

      <QuickActions actions={quickActions} />
      <DashboardSyncStatus />

      <div id="prossimi-pagamenti">{props.upcoming}</div>

      <section className="space-y-2">
        <SectionHeader
          title={monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
          description="Pending esclusi dal riepilogo"
          href="/statistics"
          linkLabel="Statistiche"
        />
        <div
          className="grid grid-cols-3 gap-2"
          aria-label="Riepilogo del mese"
        >
          <StatCard
            title="Entrate"
            value={summary.income}
            tone="success"
            className="p-3"
          />
          <StatCard
            title="Uscite"
            value={summary.expense}
            tone="danger"
            className="p-3"
          />
          <StatCard
            title="Saldo"
            value={summary.savings}
            tone={summary.savings >= 0 ? "success" : "danger"}
            hint={`${summary.savingsRate.toFixed(0)}%`}
            className="p-3"
          />
        </div>
      </section>

      <section className="mf-surface p-4 space-y-3">
        <SectionHeader
          title="Ultimi movimenti"
          href="/transactions"
          linkLabel="Tutti"
        />
        {recent.length === 0 ? (
          <EmptyState
            className="border-0 shadow-none py-6"
            icon={<Wallet className="h-5 w-5" />}
            title="Nessun movimento"
            description="Registra una spesa o sincronizza la banca."
          />
        ) : (
          <div className="divide-y divide-border/60 -mx-1">
            {recent.slice(0, 6).map((tx) => (
              <TransactionItem key={tx.id} transaction={tx} />
            ))}
          </div>
        )}
      </section>

      {(budgetProgress.length > 0 || highlightGoals.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {budgetProgress.length > 0 && (
            <section className="mf-surface p-4 space-y-3">
              <SectionHeader title="Budget" href="/budgets" />
              <div className="space-y-2">
                {budgetProgress.slice(0, 3).map((b) => (
                  <BudgetCard
                    key={b.budget.id}
                    progress={b}
                    compact
                    href="/budgets"
                  />
                ))}
              </div>
            </section>
          )}
          {highlightGoals.length > 0 && (
            <section className="mf-surface p-4 space-y-3">
              <SectionHeader
                title="Obiettivi"
                description={
                  reservedGoalsTotal > 0
                    ? formatCurrency(reservedGoalsTotal)
                    : undefined
                }
                href="/goals"
              />
              <div className="space-y-2">
                {highlightGoals.map((g) => (
                  <GoalCard key={g.id} goal={g} compact href="/goals" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {(savingsAccounts.length > 0 || openDebts.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {savingsAccounts.length > 0 && (
            <section className="mf-surface p-4 space-y-2">
              <SectionHeader title="Salvadanaio" href="/accounts" linkLabel="Conti" />
              <MoneyValue amount={savingsBalance} size="md" tone="success" />
            </section>
          )}
          {openDebts.length > 0 && (
            <section className="mf-surface p-4 space-y-2">
              <SectionHeader title="Debiti" href="/debts" linkLabel="Gestisci" />
              <MoneyValue amount={openDebtsTotal} size="md" tone="danger" />
              <ul className="space-y-1 text-sm">
                {openDebts.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <ExpandableText className="text-muted-foreground min-w-0 flex-1">
                      {d.name}
                    </ExpandableText>
                    <MoneyValue amount={Number(d.amount)} size="sm" tone="danger" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <details className="mf-surface group">
        <summary className="cursor-pointer list-none p-4 font-medium text-sm flex items-center justify-between">
          <span>Andamento e insight</span>
          <span className="text-xs text-muted-foreground group-open:hidden">
            Apri
          </span>
          <span className="text-xs text-muted-foreground hidden group-open:inline">
            Chiudi
          </span>
        </summary>
        <div className="space-y-4 border-t px-4 pb-4 pt-3">
          <PwaInstallNudge />
          {!cutPotential.empty && (
            <CutPotentialSection result={cutPotential} compact />
          )}
          {goalTrajectories.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {goalTrajectories.length} obiettiv
              {goalTrajectories.length === 1 ? "o" : "i"} con tappe —{" "}
              <Link href="/goals" className="text-primary hover:underline">
                vedi obiettivi
              </Link>
            </p>
          )}
          <div className="grid gap-3 lg:grid-cols-3">
            <ChartCard
              title="Andamento"
              description="6 mesi"
              className="lg:col-span-2"
              contentClassName="h-48"
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
                  <YAxis tick={{ fontSize: 12 }} width={40} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Area type="monotone" dataKey="income" name="Entrate" stroke="hsl(152 64% 34%)" fill="url(#inc)" />
                  <Area type="monotone" dataKey="expense" name="Uscite" stroke="hsl(0 72% 48%)" fill="url(#exp)" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Categorie" description="Mese" contentClassName="h-48">
              {byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-10 text-center">
                  Nessuna spesa
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory.slice(0, 6)}
                      dataKey="total"
                      nameKey="name"
                      innerRadius={40}
                      outerRadius={70}
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
          {insights.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {insights.slice(0, 4).map((i) => (
                <InsightCard key={i.id} insight={i} />
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
