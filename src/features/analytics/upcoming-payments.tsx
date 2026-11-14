import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import type { Debt, RecurringTransaction } from "@/types/database";

export function UpcomingPayments({ recurring, debts }: {
  recurring: RecurringTransaction[];
  debts: Debt[];
}) {
  const upcoming = [
    ...recurring.filter((item) => item.is_active && item.type === "expense").map((item) => ({
      id: `recurring-${item.id}`, date: item.next_due_date, title: item.description,
      amount: formatCurrency(Number(item.amount), item.account?.currency),
    })),
    ...debts.filter((item) => !item.paid_at && item.due_date).map((item) => ({
      id: `debt-${item.id}`, date: item.due_date!, title: item.name,
      amount: formatCurrency(Number(item.amount)),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const unpaid = debts.filter((item) => !item.paid_at && !item.due_date);
  const calendar = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MoneyFlow//Scadenze//IT",
    ...upcoming.flatMap((item) => [
      "BEGIN:VEVENT", `UID:${item.id}@moneyflow`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, "")}`,
      `DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`,
      `SUMMARY:${item.title.replace(/\\/g, "\\\\").replace(/[;,]/g, "\\$&").replace(/\r?\n/g, "\\n")}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n") + "\r\n";
  return (
    <section className="mf-surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Prossime scadenze</h2>
        <Link href="/recurring" className="text-sm text-primary underline">Ricorrenti</Link>
      </div>
      {upcoming.length === 0 && <p className="text-sm text-muted-foreground">Nessuna scadenza programmata.</p>}
      <ul className="max-h-64 overflow-y-auto divide-y">
        {upcoming.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span>{item.date.split("-").reverse().join("/")} · {item.title}</span>
            <strong className="tabular-nums">{item.amount}</strong>
          </li>
        ))}
      </ul>
      {upcoming.length > 0 && (
        <a className="text-sm text-primary underline" download="moneyflow-scadenze.ics"
          href={`data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`}>
          Esporta nel calendario per impostare promemoria
        </a>
      )}
      {unpaid.length > 0 && (
        <details>
          <summary className="text-sm font-medium">Debiti aperti senza scadenza ({unpaid.length})</summary>
          <ul className="my-2 space-y-1 text-sm">{unpaid.map((item) => <li key={item.id}>{item.name} · {formatCurrency(Number(item.amount))}</li>)}</ul>
          <Link href="/debts" className="text-sm text-primary underline">Gestisci debiti</Link>
        </details>
      )}
    </section>
  );
}
