import { describe, expect, it } from "vitest";
import {
  findIntesaSanpaolo,
  isIntesaSanpaolo,
  normalizeInstitutionName,
  prioritizeInstitutions,
} from "../institutions";
import type { Institution } from "../types";

describe("Intesa discovery (no hardcoded institution_id)", () => {
  it("normalizes name variants", () => {
    expect(normalizeInstitutionName("Intesa Sanpaolo")).toBe("intesasanpaolo");
    expect(normalizeInstitutionName("Intesa San Paolo")).toBe("intesasanpaolo");
    expect(normalizeInstitutionName("INTESA SANPAOLO")).toBe("intesasanpaolo");
  });

  it("detects Intesa aliases", () => {
    expect(isIntesaSanpaolo("Intesa Sanpaolo")).toBe(true);
    expect(isIntesaSanpaolo("Banca Intesa San Paolo")).toBe(true);
    expect(isIntesaSanpaolo("UniCredit")).toBe(false);
  });

  it("prioritizes Intesa dynamically from live-shaped list", () => {
    const list: Institution[] = [
      {
        id: "UNICREDIT_LIVE_ID",
        name: "UniCredit",
        countries: ["IT"],
      },
      {
        id: "DYNAMIC_INTESA_ID_XYZ",
        name: "Intesa San Paolo",
        countries: ["IT"],
      },
      {
        id: "FINECO_LIVE",
        name: "Fineco",
        countries: ["IT"],
      },
    ];
    const sorted = prioritizeInstitutions(list);
    expect(sorted[0].id).toBe("DYNAMIC_INTESA_ID_XYZ");
    expect(sorted[0].isSuggested).toBe(true);
    expect(findIntesaSanpaolo(list)?.id).toBe("DYNAMIC_INTESA_ID_XYZ");
  });

  it("returns full filtered list when Intesa not present", () => {
    const list: Institution[] = [
      { id: "A", name: "Alpha Bank", countries: ["IT"] },
      { id: "B", name: "Beta Bank", countries: ["IT"] },
    ];
    const sorted = prioritizeInstitutions(list);
    expect(sorted).toHaveLength(2);
    expect(sorted.every((i) => !i.isSuggested)).toBe(true);
    expect(findIntesaSanpaolo(list)).toBeNull();
  });
});
