import { describe, expect, it } from "vitest";
import {
  computeGoalWhatIf,
  parseItalianDeadline,
} from "./goal-what-if";
import type { Goal } from "@/types/database";

const goal = (over: Partial<Goal> = {}): Goal =>
  ({
    id: "g1",
    user_id: "u",
    name: "Vacanza Islanda",
    target_amount: 1200,
    current_amount: 0,
    deadline: "2027-02-15",
    status: "active",
    settled: false,
    settled_at: null,
    account_id: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...over,
  }) as Goal;

describe("parseItalianDeadline", () => {
  it("parses 15 febbraio into next year when already past this year", () => {
    const now = new Date("2026-09-23T12:00:00.000Z");
    expect(parseItalianDeadline("entro il 15 febbraio", now)).toBe(
      "2027-02-15"
    );
  });

  it("parses slash dates with year", () => {
    expect(parseItalianDeadline("entro 15/02/2027")).toBe("2027-02-15");
  });
});

describe("computeGoalWhatIf", () => {
  it("answers Iceland + 300 from piggy bank by Feb 15", () => {
    const now = new Date("2026-09-23T12:00:00.000Z");
    const result = computeGoalWhatIf({
      goal: goal({ current_amount: 0, target_amount: 1200 }),
      contributeAmount: 300,
      deadline: "2027-02-15",
      now,
    });

    expect(result.currentAfter).toBe(300);
    expect(result.remainingAfter).toBe(900);
    expect(result.neededMonthlyAfter).toBeGreaterThan(150);
    expect(result.neededMonthlyAfter).toBeLessThan(250);
    expect(result.monthlySaved).toBeGreaterThan(0);
    expect(result.summaryText).toMatch(/Vacanza Islanda/);
    expect(result.summaryText).toMatch(/mese/);
  });

  it("reports already reached when contribution covers the gap", () => {
    const result = computeGoalWhatIf({
      goal: goal({ current_amount: 1000, target_amount: 1200 }),
      contributeAmount: 300,
      deadline: "2027-02-15",
      now: new Date("2026-09-23T12:00:00.000Z"),
    });
    expect(result.alreadyReached).toBe(true);
    expect(result.summaryText).toMatch(/raggiungi/);
  });
});
