"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PageHeader,
  ChartCard,
  MoneyValue,
  EmptyState,
} from "@/components/money";

export function StatisticsView({
  series6,
  series12,
  byCategory,
}: {
  series6: { label: string; income: number; expense: number; savings: number }[];
  series12: { label: string; income: number; expense: number; savings: number }[];
  byCategory: { name: string; color: string; total: number }[];
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Statistiche"
        description="Andamento entrate e uscite nel tempo"
      />

      <Tabs defaultValue="6">
        <TabsList>
          <TabsTrigger value="6" className="min-h-10">6 mesi</TabsTrigger>
          <TabsTrigger value="12" className="min-h-10">12 mesi</TabsTrigger>
        </TabsList>
        <TabsContent value="6" className="mt-4">
          <SeriesChart title="Ultimi 6 mesi" data={series6} />
        </TabsContent>
        <TabsContent value="12" className="mt-4">
          <SeriesChart title="Ultimi 12 mesi" data={series12} />
        </TabsContent>
      </Tabs>

      <ChartCard title="Top categorie" description="Uscite del mese · trasferimenti esclusi">
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
                  <span className="truncate">{c.name}</span>
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
