import Link from "next/link";
import { Sparkles } from "lucide-react";
import {
  buildUpcomingPayments,
  sumUpcomingAmounts,
  unpaidDebtsWithoutDue,
  type UpcomingPaymentItem,
  type UpcomingPaymentSource,
} from "@/lib/finance/upcoming-payments";
import type { Debt, RecurringTransaction, Transaction } from "@/types/database";
import { MoneyValue, SectionHeader } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function sourceMeta(source: UpcomingPaymentSource): {
  label: string;
  className: string;
} {
  switch (source) {
    case "predicted":
      return {
        label: "Da storico",
        className: "border-primary/30 bg-primary/10 text-primary",
      };
    case "debt":
      return {
        label: "Debito",
        className: "border-warning/30 bg-warning/10 text-warning",
      };
    default:
      return {
        label: "Ricorrente",
        className: "bg-secondary text-secondary-foreground",
      };
  }
}

function formatItDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

function weekdayHint(iso: string): string {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      weekday: "short",
      timeZone: "Europe/Rome",
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return "";
  }
}

function PaymentRow({ item }: { item: UpcomingPaymentItem }) {
  const meta = sourceMeta(item.source);
  const inner = (
    <>
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl text-center",
            item.source === "predicted"
              ? "bg-primary/10 text-primary"
              : item.source === "debt"
                ? "bg-warning/10 text-warning"
                : "bg-secondary text-secondary-foreground"
          )}
        >
          <span className="text-[10px] font-medium uppercase leading-none">
            {weekdayHint(item.date)}
          </span>
          <span className="text-sm font-semibold tabular-nums leading-tight">
            {formatItDate(item.date)}
          </span>
        </div>
        <div className="min-w-0 space-y-1">
          <p className="font-medium truncate">{item.title}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[10px]", meta.className)}>
              {meta.label}
            </Badge>
            {item.source === "predicted" && item.occurrence_count ? (
              <span className="text-[11px] text-muted-foreground">
                vista {item.occurrence_count}× nei mesi scorsi
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <MoneyValue
        amount={item.amount}
        currency={item.currency}
        size="sm"
        tone="danger"
        className="shrink-0"
      />
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-accent/40 -mx-1 px-1 rounded-lg"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">{inner}</div>
  );
}

export function UpcomingPayments({
  recurring,
  debts,
  transactions = [],
  forecast,
}: {
  recurring: RecurringTransaction[];
  debts: Debt[];
  transactions?: Transaction[];
  forecast?: {
    projectedExpense: number;
    projectedIncome: number;
    projectedSavings: number;
    daysLeft: number;
  };
}) {
  const upcoming = buildUpcomingPayments({
    recurring,
    debts,
    transactions,
    includePredicted: true,
    horizonDays: 60,
    limit: 10,
  });
  const predictedCount = upcoming.filter((i) => i.source === "predicted").length;
  const total = sumUpcomingAmounts(upcoming);
  const unpaid = unpaidDebtsWithoutDue(debts);

  const calendar =
    upcoming.length > 0
      ? [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//MoneyFlow//Scadenze//IT",
          ...upcoming.flatMap((item) => [
            "BEGIN:VEVENT",
            `UID:${item.id}@moneyflow`,
            `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, "")}`,
            `DTSTART;VALUE=DATE:${item.date.replaceAll("-", "")}`,
            `SUMMARY:${item.title
              .replace(/\\/g, "\\\\")
              .replace(/[;,]/g, "\\$&")
              .replace(/\r?\n/g, "\\n")}`,
            "END:VEVENT",
          ]),
          "END:VCALENDAR",
        ].join("\r\n") + "\r\n"
      : "";

  return (
    <section className="mf-surface-lift space-y-4 p-4 sm:p-5">
      <SectionHeader
        title="Prossimi pagamenti"
        description={
          predictedCount > 0
            ? `Scadenze + ${predictedCount} previsti dai mesi scorsi`
            : "Cosa arriva nelle prossime settimane"
        }
        href="/recurring"
        linkLabel="Ricorrenti"
      />

      {upcoming.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-center space-y-2">
          <Sparkles className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nessun pagamento in arrivo. Aggiungi un ricorrente o sincronizza i
            movimenti: impostiamo le previsioni dai mesi scorsi.
          </p>
          <Link
            href="/recurring"
            className="inline-flex text-sm font-medium text-primary hover:underline"
          >
            Vai a Ricorrenti
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2 rounded-xl bg-expense/5 px-3 py-2.5">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Totale in uscita
              </p>
              <MoneyValue amount={total} size="md" tone="danger" />
            </div>
            <p className="text-xs text-muted-foreground">
              {upcoming.length} scadenz{upcoming.length === 1 ? "a" : "e"} · 60
              giorni
            </p>
          </div>

          <ul className="divide-y divide-border/60 max-h-80 overflow-y-auto">
            {upcoming.map((item) => (
              <li key={item.id}>
                <PaymentRow item={item} />
              </li>
            ))}
          </ul>

          {predictedCount > 0 && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Le voci «Da storico» sono stime dai movimenti dei mesi precedenti.
              Confermale in{" "}
              <Link href="/recurring" className="text-primary hover:underline">
                Ricorrenti
              </Link>{" "}
              per usarle nelle previsioni di fine mese.
            </p>
          )}
        </>
      )}

      {forecast && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/25 p-3 text-center">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">
              Entrate
            </p>
            <MoneyValue
              amount={forecast.projectedIncome}
              size="sm"
              tone="success"
            />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">
              Uscite
            </p>
            <MoneyValue
              amount={forecast.projectedExpense}
              size="sm"
              tone="danger"
            />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">
              Fine mese
            </p>
            <MoneyValue
              amount={forecast.projectedSavings}
              size="sm"
              tone={forecast.projectedSavings >= 0 ? "success" : "danger"}
            />
          </div>
          <p className="col-span-3 text-[11px] text-muted-foreground">
            Previsione a {forecast.daysLeft} giorni dalla fine del mese
          </p>
        </div>
      )}

      {upcoming.length > 0 && (
        <a
          className="inline-flex text-sm font-medium text-primary hover:underline"
          download="moneyflow-scadenze.ics"
          href={`data:text/calendar;charset=utf-8,${encodeURIComponent(calendar)}`}
        >
          Esporta nel calendario
        </a>
      )}

      {unpaid.length > 0 && (
        <details className="rounded-xl border bg-card/60 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">
            Debiti aperti senza scadenza ({unpaid.length})
          </summary>
          <ul className="my-2 space-y-1.5 text-sm">
            {unpaid.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">{item.name}</span>
                <MoneyValue amount={Number(item.amount)} size="sm" tone="danger" />
              </li>
            ))}
          </ul>
          <Link href="/debts" className="text-sm text-primary hover:underline">
            Gestisci debiti
          </Link>
        </details>
      )}
    </section>
  );
}
