import { addMonths, parseISO, startOfMonth, subMonths } from "date-fns";

/**
 * Parse ?month=yyyy-MM (or yyyy-MM-dd) for Budget navigation.
 * Clamped to [now-24 months, now+1 month].
 */
export function resolveBudgetMonth(
  raw: string | undefined,
  now = new Date()
): Date {
  const current = startOfMonth(now);
  const earliest = startOfMonth(subMonths(current, 24));
  const latest = startOfMonth(addMonths(current, 1));

  if (!raw || !/^\d{4}-\d{2}(-\d{2})?$/.test(raw)) return current;
  try {
    const iso = raw.length === 7 ? `${raw}-01` : raw.slice(0, 10);
    const parsed = startOfMonth(parseISO(`${iso}T12:00:00`));
    if (Number.isNaN(parsed.getTime())) return current;
    if (parsed < earliest) return earliest;
    if (parsed > latest) return latest;
    return parsed;
  } catch {
    return current;
  }
}
