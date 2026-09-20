import { describe, expect, it } from "vitest";
import {
  buildGoalMilestones,
  calcGoalTrajectory,
  estimateWeeksFaster,
  pickPrimaryGoal,
} from "@/lib/finance/goal-trajectory";
import type { Goal } from "@/types/database";

const baseGoal = (over: Partial<Goal> = {}): Goal =>
  ({
    id: "g1",
    user_id: "u",
    name: "Vacanza",
    target_amount: 1000,
    current_amount: 250,
    deadline: "2026-12-31",
    account_id: null,
    color: "#0d9488",
    icon: "target",
    status: "active",
    settled: false,
    settled_at: null,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    ...over,
  }) as Goal;

describe("goal trajectory", () => {
  it("builds milestones with checkmarks", () => {
    const ms = buildGoalMilestones(500, 1000);
    expect(ms.map((m) => m.percent)).toEqual([25, 50, 75, 100]);
    expect(ms[0].reached).toBe(true);
    expect(ms[1].reached).toBe(true);
    expect(ms[2].reached).toBe(false);
    expect(ms[3].reached).toBe(false);
  });

  it("marks reached goals", () => {
    const t = calcGoalTrajectory(
      baseGoal({ current_amount: 1000, status: "completed" }),
      new Date("2026-09-15")
    );
    expect(t.status).toBe("reached");
    expect(t.statusLabel).toBe("Raggiunto");
    expect(t.milestones.every((m) => m.reached)).toBe(true);
  });

  it("reports missing deadline", () => {
    const t = calcGoalTrajectory(
      baseGoal({ deadline: null }),
      new Date("2026-09-15")
    );
    expect(t.status).toBe("no_deadline");
    expect(t.statusLabel).toBe("Data mancante");
  });

  it("computes pace and on-track forecast", () => {
    // 500 saved over ~106 days (~Jun 1 → Sep 15) ≈ 143 €/mo; remaining 500 → ~3.5 mo → ~end Dec → on track for Dec 31
    const t = calcGoalTrajectory(
      baseGoal({ current_amount: 500, target_amount: 1000 }),
      new Date("2026-09-15")
    );
    expect(t.avgMonthlyPace).toBeGreaterThan(100);
    expect(t.neededMonthlyPace).toBeGreaterThan(0);
    expect(t.projectedCompletionDate).toBeTruthy();
    expect(t.status).toBe("on_track");
    expect(t.statusLabel).toBe("In linea");
    expect(t.forecastMessage).toMatch(/raggiungi circa il/i);
  });

  it("flags behind when pace is too slow", () => {
    const t = calcGoalTrajectory(
      baseGoal({
        current_amount: 50,
        target_amount: 5000,
        deadline: "2026-10-15",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      new Date("2026-09-15")
    );
    expect(t.status).toBe("behind");
    expect(t.statusLabel).toBe("In ritardo");
    expect(t.forecastMessage).toMatch(/Serve circa/i);
  });

  it("prefers Matrimonio goals as primary", () => {
    const picked = pickPrimaryGoal([
      baseGoal({ id: "a", name: "Casa", deadline: "2026-10-01" }),
      baseGoal({
        id: "b",
        name: "Matrimonio Giulia e Ruben",
        deadline: "2027-06-01",
      }),
    ]);
    expect(picked?.id).toBe("b");
  });

  it("estimates weeks faster from extra monthly savings", () => {
    const weeks = estimateWeeksFaster({
      remaining: 1000,
      monthlyPace: 100,
      extraMonthly: 100,
    });
    expect(weeks).toBeGreaterThan(20);
    expect(weeks).toBeLessThan(23);
  });

  it("labels settled goals as Saldato", () => {
    const t = calcGoalTrajectory(
      baseGoal({
        current_amount: 1000,
        status: "completed",
        settled: true,
        settled_at: "2026-09-01T00:00:00.000Z",
      }),
      new Date("2026-09-15")
    );
    expect(t.statusLabel).toBe("Saldato");
  });
});
