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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    <Tabs defaultValue="6">
      <TabsList>
        <TabsTrigger value="6">6 mesi</TabsTrigger>
        <TabsTrigger value="12">12 mesi</TabsTrigger>
      </TabsList>
      <TabsContent value="6">
        <ChartCard title="Ultimi 6 mesi" data={series6} />
      </TabsContent>
      <TabsContent value="12">
        <ChartCard title="Ultimi 12 mesi" data={series12} />
      </TabsContent>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Top categorie (mese)</CardTitle>
          <CardDescription>Solo uscite — trasferimenti esclusi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {byCategory.slice(0, 8).map((c) => (
            <div key={c.name} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: c.color }}
                />
                {c.name}
              </span>
              <span className="font-medium">{formatCurrency(c.total)}</span>
            </div>
          ))}
          {byCategory.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessun dato</p>
          )}
        </CardContent>
      </Card>
    </Tabs>
  );
}

function ChartCard({
  title,
  data,
}: {
  title: string;
  data: { label: string; income: number; expense: number; savings: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Bar dataKey="income" name="Entrate" fill="hsl(142 71% 35%)" radius={4} />
            <Bar dataKey="expense" name="Uscite" fill="hsl(0 72% 51%)" radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
