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

/** Revolut (Bank UAB / personal or business) — stricter AIS history window than IT banks. */
export function isRevolut(name: string): boolean {
  return normalizeInstitutionName(name).includes("revolut");
}

/** Personal Revolut connector (not RevolutBusiness). */
export function isRevolutPersonal(name: string): boolean {
  const n = normalizeInstitutionName(name);
  return n.includes("revolut") && !n.includes("business");
}

export function isRevolutBusiness(name: string): boolean {
  const n = normalizeInstitutionName(name);
  return n.includes("revolut") && n.includes("business");
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

/**
 * Italian UI lists IT ASPSPs, but personal Revolut is published under LT (Bank UAB).
 * Prefer LT personal entries; drop IT personal Revolut duplicates that often auth
 * without returning AIS accounts. Keep RevolutBusiness as a separate option.
 */
export function mergeRevolutFromExtraCountries(
  primary: Institution[],
  extras: Institution[]
): Institution[] {
  const ltPersonal = extras.filter(
    (i) =>
      isRevolutPersonal(i.name) &&
      (i.countries?.[0] || "").toUpperCase() === "LT"
  );
  const ltBusiness = extras.filter((i) => isRevolutBusiness(i.name));

  // Drop IT personal Revolut when LT personal is available.
  let base = primary;
  if (ltPersonal.length > 0) {
    base = primary.filter(
      (i) =>
        !(
          isRevolutPersonal(i.name) &&
          (i.countries?.[0] || i.id.split("::")[0] || "").toUpperCase() === "IT"
        )
    );
  }

  const byId = new Map(base.map((i) => [i.id, i] as const));
  for (const inst of [...ltPersonal, ...ltBusiness]) {
    if (!byId.has(inst.id)) byId.set(inst.id, inst);
  }
  return Array.from(byId.values());
}

/** Prefer LT personal Revolut when the user is clearly searching for it. */
export function prioritizeRevolutSearch(
  institutions: Institution[],
  searchQuery?: string
): Institution[] {
  if (!/revolut/i.test(searchQuery ?? "")) return institutions;
  return [...institutions].sort((a, b) => {
    const score = (i: Institution) => {
      if (!isRevolut(i.name)) return 3;
      const country = (i.countries?.[0] || i.id.split("::")[0] || "").toUpperCase();
      if (isRevolutPersonal(i.name) && country === "LT") return 0;
      if (isRevolutPersonal(i.name)) return 1;
      return 2; // business
    };
    const d = score(a) - score(b);
    if (d !== 0) return d;
    return a.name.localeCompare(b.name, "it");
  });
}

/** Tip when Revolut AIS returns zero accounts after a successful auth redirect. */
export function revolutEmptyAccountsTip(): string {
  return [
    "Revolut non ha condiviso nessun conto.",
    "Nell'app, prima di confermare, spunta il conto EUR (e le carte se ti servono).",
    "Se Enable Banking è in modalità restricted: nel Control Panel collega (Link accounts) lo stesso conto EUR, poi ripeti l'autorizzazione da MoneyFlow.",
    "Conto business? Cerca RevolutBusiness, non Revolut personale.",
  ].join(" ");
}
