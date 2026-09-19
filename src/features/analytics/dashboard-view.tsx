"use client";

import Link from "next/link";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { calcGoalProgress } from "@/lib/finance/engine";
import type {
  BudgetProgress,
  Goal,
  Insight,
  MonthSummary,
  Transaction,
} from "@/types/database";
import { DemoSeedButton } from "@/features/analytics/demo-seed-button";

const stateColor: Record<string, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  critical: "bg-orange-500",
  over: "bg-destructive",
};

export function DashboardView(props: {
  availability: number;
  summary: MonthSummary;
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
  recent: Transaction[];
  forecast: {
    projectedExpense: number;
    projectedIncome: number;
    projectedSavings: number;
    daysLeft: number;
    dailyBurn: number;
  };
  insights: Insight[];
  isEmpty: boolean;
}) {
  const {
    availability,
    summary,
    series,
    byCategory,
    budgetProgress,
    goals,
    recent,
    forecast,
    insights,
    isEmpty,
  } = props;

  return (
    <div className="space-y-6">
      {isEmpty && (
        <Card className="border-dashed border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>Benvenuto in MoneyFlow</CardTitle>
            <CardDescription>
              Aggiungi un conto o carica dati demo per iniziare. Puoi anche collegare una banca.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/accounts">Crea un conto</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/accounts/connect-bank">Collega banca</Link>
            </Button>
            <DemoSeedButton />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Disponibilità" value={formatCurrency(availability)} hint="Tutti i conti" />
        <StatCard
          title="Entrate mese"
          value={formatCurrency(summary.income)}
          hint="Escluse trasferimenti"
          tone="success"
        />
        <StatCard
          title="Uscite mese"
          value={formatCurrency(summary.expense)}
          hint="Escluse trasferimenti"
          tone="danger"
        />
        <StatCard
          title="Risparmio"
          value={formatCurrency(summary.savings)}
          hint={`${summary.savingsRate.toFixed(0)}% delle entrate`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Andamento 6 mesi</CardTitle>
            <CardDescription>Entrate vs uscite (senza trasferimenti)</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="inc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(142 71% 35%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(142 71% 35%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="exp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(0 72% 51%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={48} />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ borderRadius: 12 }}
                />
                <Area type="monotone" dataKey="income" name="Entrate" stroke="hsl(142 71% 35%)" fill="url(#inc)" />
                <Area type="monotone" dataKey="expense" name="Uscite" stroke="hsl(0 72% 51%)" fill="url(#exp)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spese per categoria</CardTitle>
            <CardDescription>Mese corrente</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Previsione fine mese</CardTitle>
            <CardDescription>{forecast.daysLeft} giorni rimanenti</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Entrate stimate" value={formatCurrency(forecast.projectedIncome)} />
            <Row label="Uscite stimate" value={formatCurrency(forecast.projectedExpense)} />
            <Row
              label="Saldo stimato"
              value={formatCurrency(forecast.projectedSavings)}
              strong
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Budget</CardTitle>
              <CardDescription>Progresso mensile</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/budgets">Vedi</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {budgetProgress.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun budget impostato</p>
            )}
            {budgetProgress.slice(0, 4).map((b) => (
              <div key={b.budget.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>{b.budget.category?.name ?? "Categoria"}</span>
                  <span>{b.percent.toFixed(0)}%</span>
                </div>
                <Progress
                  value={Math.min(100, b.percent)}
                  indicatorClassName={stateColor[b.state]}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Insight</CardTitle>
            <CardDescription>Suggerimenti automatici</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun insight per ora</p>
            )}
            {insights.map((i) => (
              <div key={i.id} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      i.type === "success"
                        ? "success"
                        : i.type === "warning"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {i.title}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{i.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Ultimi movimenti</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/transactions">Tutti</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun movimento</p>
            )}
            {recent.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tx.description || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {tx.date} · {tx.category?.name ?? "Senza categoria"}
                  </p>
                </div>
                <span
                  className={
                    tx.type === "income"
                      ? "text-sm font-semibold text-success"
                      : "text-sm font-semibold text-destructive"
                  }
                >
                  {tx.type === "income" ? "+" : "−"}
                  {formatCurrency(Number(tx.amount))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Obiettivi</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/goals">Tutti</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {goals.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun obiettivo attivo</p>
            )}
            {goals.map((g) => {
              const p = calcGoalProgress(g);
              return (
                <div key={g.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{g.name}</span>
                    <span className="text-muted-foreground">{p.percent.toFixed(0)}%</span>
                  </div>
                  <Progress value={p.percent} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: "success" | "danger";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle
          className={
            tone === "success"
              ? "text-2xl text-success"
              : tone === "danger"
                ? "text-2xl text-destructive"
                : "text-2xl"
          }
        >
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
