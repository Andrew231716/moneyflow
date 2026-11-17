import { format, parseISO } from "date-fns";
import { nextDueAfter } from "@/lib/finance/engine";
import type { RecurringFrequency, RecurringTransaction } from "@/types/database";

/** Advance next_due_date by one frequency step (mark paid / skip). */
export function advanceRecurringDueDate(
  item: Pick<RecurringTransaction, "next_due_date" | "frequency">,
  asOf: Date = new Date()
): string {
  const current = parseISO(item.next_due_date.slice(0, 10));
  let next = nextDueAfter(current, item.frequency as RecurringFrequency);
  // If still in the past relative to asOf, keep stepping (stale dues)
  const asOfDay = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  let guard = 0;
  while (next < asOfDay && guard < 36) {
    next = nextDueAfter(next, item.frequency as RecurringFrequency);
    guard += 1;
  }
  return format(next, "yyyy-MM-dd");
}
