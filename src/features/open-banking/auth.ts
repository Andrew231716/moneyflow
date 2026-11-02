import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export class OpenBankingHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "OpenBankingHttpError";
  }
}

export function italianErrorResponse(error: unknown): NextResponse {
  if (error instanceof OpenBankingHttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "OpenBankingConfigError"
  ) {
    return NextResponse.json(
      {
        error:
          (error as Error).message ||
          "Configurazione Open Banking incompleta.",
      },
      { status: 503 }
    );
  }
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name: string }).name === "OpenBankingProviderError"
  ) {
    const providerStatus =
      "status" in error && typeof (error as { status: unknown }).status === "number"
        ? (error as { status: number }).status
        : 502;
    // Never forward bank/provider 401/403 as our auth status — clients would
    // treat a bank consent issue as "sessione MoneyFlow scaduta".
    const status =
      providerStatus === 401 || providerStatus === 403
        ? 502
        : providerStatus === 429
          ? 429
          : providerStatus >= 400 && providerStatus < 600
            ? providerStatus
            : 502;
    return NextResponse.json(
      {
        error:
          (error as Error).message ||
          "Errore nella comunicazione con il provider bancario.",
      },
      { status }
    );
  }
  // Generic — never leak secrets or bank payloads
  return NextResponse.json(
    { error: "Si è verificato un errore. Riprova più tardi." },
    { status: 500 }
  );
}

export async function requireUser(): Promise<{
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new OpenBankingHttpError(
      "Devi accedere per usare Open Banking.",
      401
    );
  }

  return { user, supabase };
}

export function maskIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  if (clean.length < 8) return "****";
  return `${clean.slice(0, 4)} **** **** ${clean.slice(-4)}`;
}

/** Map GoCardless requisition status → our bank_connection_status. */
export function mapRequisitionStatus(
  status: string
):
  | "pending"
  | "active"
  | "expired"
  | "rejected"
  | "suspended"
  | "error" {
  const s = status.toUpperCase();
  // LN = linked, CR = created, GC = giving consent, UA = undisclosed, etc.
  if (s === "LN" || s === "LINKED" || s === "ACTIVE") return "active";
  if (s === "EX" || s === "EXPIRED") return "expired";
  if (s === "RJ" || s === "REJECTED") return "rejected";
  if (s === "SU" || s === "SUSPENDED") return "suspended";
  if (s === "ER" || s === "ERROR") return "error";
  if (
    s === "CR" ||
    s === "GC" ||
    s === "UA" ||
    s === "CREATED" ||
    s === "PENDING"
  ) {
    return "pending";
  }
  return "pending";
}

export function consentExpiredMessage(institutionName: string): string {
  if (/intesa/i.test(institutionName)) {
    return "Il consenso Open Banking di Intesa Sanpaolo è scaduto. Ricollega il conto per continuare la sincronizzazione.";
  }
  return `Il consenso Open Banking di ${institutionName} è scaduto. Ricollega il conto per continuare.`;
}
