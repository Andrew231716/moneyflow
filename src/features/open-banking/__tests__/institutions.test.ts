import { describe, expect, it } from "vitest";
import {
  findIntesaSanpaolo,
  isIntesaSanpaolo,
  isRevolut,
  isRevolutPersonal,
  mergeRevolutFromExtraCountries,
  normalizeInstitutionName,
  prioritizeInstitutions,
  prioritizeRevolutSearch,
  revolutEmptyAccountsTip,
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

  it("detects Revolut", () => {
    expect(isRevolut("Revolut")).toBe(true);
    expect(isRevolut("Revolut Bank UAB")).toBe(true);
    expect(isRevolut("Intesa Sanpaolo")).toBe(false);
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

  it("merges LT Revolut into IT catalog without duplicating ids", () => {
    const itList: Institution[] = [
      { id: "IT::UniCredit", name: "UniCredit", countries: ["IT"] },
    ];
    const ltList: Institution[] = [
      { id: "LT::Revolut", name: "Revolut", countries: ["LT"] },
      { id: "LT::Swedbank", name: "Swedbank", countries: ["LT"] },
      { id: "IT::UniCredit", name: "UniCredit", countries: ["IT"] },
    ];
    const merged = mergeRevolutFromExtraCountries(itList, ltList);
    expect(merged.map((i) => i.id).sort()).toEqual([
      "IT::UniCredit",
      "LT::Revolut",
    ]);
  });

  it("drops IT personal Revolut when LT personal is available", () => {
    const itList: Institution[] = [
      { id: "IT::Revolut", name: "Revolut", countries: ["IT"] },
      { id: "IT::UniCredit", name: "UniCredit", countries: ["IT"] },
    ];
    const ltList: Institution[] = [
      { id: "LT::Revolut", name: "Revolut", countries: ["LT"] },
      { id: "LT::RevolutBusiness", name: "RevolutBusiness", countries: ["LT"] },
    ];
    const merged = mergeRevolutFromExtraCountries(itList, ltList);
    expect(merged.map((i) => i.id).sort()).toEqual([
      "IT::UniCredit",
      "LT::Revolut",
      "LT::RevolutBusiness",
    ]);
    expect(isRevolutPersonal("Revolut")).toBe(true);
    expect(isRevolutPersonal("RevolutBusiness")).toBe(false);
  });

  it("prioritizes LT personal Revolut when searching", () => {
    const list: Institution[] = [
      { id: "IT::Alpha", name: "Alpha Bank", countries: ["IT"] },
      { id: "LT::RevolutBusiness", name: "RevolutBusiness", countries: ["LT"] },
      { id: "LT::Revolut", name: "Revolut Bank UAB", countries: ["LT"] },
    ];
    const sorted = prioritizeRevolutSearch(list, "revolut");
    expect(sorted[0].id).toBe("LT::Revolut");
  });

  it("empty-accounts tip mentions Control Panel whitelist", () => {
    expect(revolutEmptyAccountsTip().toLowerCase()).toMatch(/restricted|link accounts|control panel/);
  });
});
