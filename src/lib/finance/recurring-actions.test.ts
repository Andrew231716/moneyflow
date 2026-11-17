import { describe, expect, it } from "vitest";
import { advanceRecurringDueDate } from "@/lib/finance/recurring-actions";

describe("advanceRecurringDueDate", () => {
  it("moves monthly due forward one month", () => {
    expect(
      advanceRecurringDueDate(
        { next_due_date: "2026-11-10", frequency: "monthly" },
        new Date("2026-11-05")
      )
    ).toBe("2026-12-10");
  });

  it("skips stale dues until on/after asOf", () => {
    expect(
      advanceRecurringDueDate(
        { next_due_date: "2026-08-01", frequency: "monthly" },
        new Date("2026-11-05")
      )
    ).toBe("2026-12-01");
  });
});
