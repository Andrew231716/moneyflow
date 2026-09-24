import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { resolveBudgetMonth } from "./month";

describe("resolveBudgetMonth", () => {
  const now = new Date("2026-09-24T12:00:00.000Z");

  it("defaults to current month", () => {
    expect(format(resolveBudgetMonth(undefined, now), "yyyy-MM")).toBe("2026-09");
    expect(format(resolveBudgetMonth("nope", now), "yyyy-MM")).toBe("2026-09");
  });

  it("accepts yyyy-MM for a past month", () => {
    expect(format(resolveBudgetMonth("2026-07", now), "yyyy-MM")).toBe("2026-07");
  });

  it("clamps far past and far future", () => {
    expect(format(resolveBudgetMonth("2020-01", now), "yyyy-MM")).toBe("2024-09");
    expect(format(resolveBudgetMonth("2030-01", now), "yyyy-MM")).toBe("2026-10");
  });
});
