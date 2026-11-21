"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, SkipForward, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  buildUpcomingPayments,
  sumUpcomingAmounts,
  unpaidDebtsWithoutDue,
  type UpcomingPaymentItem,
  type UpcomingPaymentSource,
} from "@/lib/finance/upcoming-payments";
import { advanceRecurringDueDate } from "@/lib/finance/recurring-actions";
import { classifyDescription } from "@/lib/finance/classification";
import type {
  Account,
  Category,
  Debt,
  RecurringTransaction,
  Transaction,
} from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { MoneyValue, SectionHeader } from "@/components/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "mf-dismissed-recurring-suggestions";

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...ids]));
}

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

export function UpcomingPayments({
  recurring,
  debts,
  transactions = [],
  accounts = [],
  categories = [],
  forecast,
}: {
  recurring: RecurringTransaction[];
  debts: Debt[];
  transactions?: Transaction[];
  accounts?: Account[];
  categories?: Category[];
  forecast?: {
    projectedExpense: number;
    projectedIncome: number;
    projectedSavings: number;
    daysLeft: number;
  };
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  function toggleTitle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const upcoming = useMemo(() => {
    const items = buildUpcomingPayments({
      recurring,
      debts,
      transactions,
      includePredicted: true,
      horizonDays: 60,
      limit: 12,
    });
    return items.filter((item) => {
      if (item.source !== "predicted" || !item.detection_key) return true;
      return !dismissed.has(item.detection_key);
    });
  }, [recurring, debts, transactions, dismissed]);

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

  async function confirmPredicted(item: UpcomingPaymentItem) {
    setBusyId(item.id);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");
      const accountId =
        accounts.find((a) => a.id === item.account_id)?.id ?? accounts[0]?.id;
      if (!accountId) throw new Error("Nessun conto disponibile");

      let categoryId =
        item.category_id &&
        categories.some((c) => c.id === item.category_id)
          ? item.category_id
          : null;
      if (!categoryId) {
        categoryId =
          classifyDescription(item.title, [], categories, {
            type: "expense",
          })?.id ?? null;
      }

      const { error } = await supabase.from("recurring_transactions").insert({
        user_id: user.id,
        description: item.title,
        amount: item.amount,
        type: "expense",
        frequency: item.frequency ?? "monthly",
        account_id: accountId,
        category_id: categoryId,
        next_due_date: item.date,
      });
      if (error) throw error;

      if (item.detection_key) {
        setDismissed((prev) => {
          const next = new Set(prev);
          next.add(item.detection_key!);
          writeDismissed(next);
          return next;
        });
      }
      toast.success(`«${item.title}» aggiunto ai ricorrenti`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  async function markRecurringPaid(item: UpcomingPaymentItem) {
    if (!item.recurring_id || !item.frequency) return;
    setBusyId(item.id);
    try {
      const supabase = createClient();
      const nextDue = advanceRecurringDueDate({
        next_due_date: item.date,
        frequency: item.frequency,
      });
      const { error } = await supabase
        .from("recurring_transactions")
        .update({ next_due_date: nextDue })
        .eq("id", item.recurring_id);
      if (error) throw error;
      toast.success(`Segnato · prossima scadenza ${nextDue.split("-").reverse().join("/")}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusyId(null);
    }
  }

  function dismissPredicted(item: UpcomingPaymentItem) {
    if (!item.detection_key) return;
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(item.detection_key!);
      writeDismissed(next);
      return next;
    });
  }

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
            movimenti.
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

          <ul className="divide-y divide-border/60 max-h-[28rem] overflow-y-auto">
            {upcoming.map((item) => {
              const meta = sourceMeta(item.source);
              return (
                <li key={item.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
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
                        <button
                          type="button"
                          onClick={() => toggleTitle(item.id)}
                          aria-expanded={expandedIds.has(item.id)}
                          title={
                            expandedIds.has(item.id)
                              ? "Nascondi"
                              : "Mostra nome completo"
                          }
                          className={cn(
                            "w-full text-left font-medium break-words",
                            "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            expandedIds.has(item.id)
                              ? "whitespace-normal"
                              : "truncate"
                          )}
                        >
                          {item.title}
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", meta.className)}
                          >
                            {meta.label}
                          </Badge>
                          {item.source === "predicted" && item.occurrence_count ? (
                            <span className="text-[11px] text-muted-foreground">
                              vista {item.occurrence_count}×
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
                  </div>

                  {item.source === "predicted" && (
                    <div className="flex flex-wrap gap-2 pl-[3.25rem]">
                      <Button
                        size="sm"
                        className="min-h-9"
                        disabled={busyId === item.id}
                        onClick={() => void confirmPredicted(item)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {busyId === item.id ? "…" : "Aggiungi"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-9"
                        onClick={() => dismissPredicted(item)}
                      >
                        Ignora
                      </Button>
                    </div>
                  )}

                  {item.source === "recurring" && (
                    <div className="flex flex-wrap gap-2 pl-[3.25rem]">
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-9"
                        disabled={busyId === item.id}
                        onClick={() => void markRecurringPaid(item)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {busyId === item.id ? "…" : "Segna pagato"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-9"
                        disabled={busyId === item.id}
                        onClick={() => void markRecurringPaid(item)}
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Salta
                      </Button>
                    </div>
                  )}

                  {item.source === "debt" && (
                    <div className="pl-[3.25rem]">
                      <Button asChild size="sm" variant="outline" className="min-h-9">
                        <Link href="/debts">Gestisci debito</Link>
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {forecast && (
        <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/25 p-3 text-center">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">Entrate</p>
            <MoneyValue amount={forecast.projectedIncome} size="sm" tone="success" />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">Uscite</p>
            <MoneyValue amount={forecast.projectedExpense} size="sm" tone="danger" />
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase text-muted-foreground">Fine mese</p>
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
