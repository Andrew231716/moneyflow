import type { Institution } from "./types";

/**
 * Normalize bank names for case-insensitive matching.
 * Handles "Intesa Sanpaolo" / "Intesa San Paolo" / "INTESA SANPAOLO".
 * NEVER hardcodes institution_id — discovery is always dynamic.
 */
export function normalizeInstitutionName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function isIntesaSanpaolo(name: string): boolean {
  const n = normalizeInstitutionName(name);
  // intesa + sanpaolo (with or without space already stripped)
  return n.includes("intesa") && n.includes("sanpaolo");
}

/**
 * Prioritize Intesa Sanpaolo at the top when present; otherwise return list as-is
 * (caller may still show full list when search yields no Intesa match).
 */
export function prioritizeInstitutions(
  institutions: Institution[],
  searchQuery?: string
): Institution[] {
  const q = (searchQuery ?? "").trim().toLowerCase();

  let filtered = institutions;
  if (q) {
    filtered = institutions.filter((i) => {
      const name = i.name.toLowerCase();
      const bic = (i.bic ?? "").toLowerCase();
      return name.includes(q) || bic.includes(q);
    });
  }

  const withFlags = filtered.map((i) => ({
    ...i,
    isSuggested: isIntesaSanpaolo(i.name),
  }));

  return withFlags.sort((a, b) => {
    if (a.isSuggested && !b.isSuggested) return -1;
    if (!a.isSuggested && b.isSuggested) return 1;
    return a.name.localeCompare(b.name, "it");
  });
}

export function findIntesaSanpaolo(
  institutions: Institution[]
): Institution | null {
  return institutions.find((i) => isIntesaSanpaolo(i.name)) ?? null;
}
