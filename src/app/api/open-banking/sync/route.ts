import { NextRequest, NextResponse } from "next/server";
import {
  italianErrorResponse,
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { syncConnection } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";
/** Allow multi-page Intesa sync with rate-limit backoff (Hobby may still cap lower). */
export const maxDuration = 60;

/**
 * POST /api/open-banking/sync
 * Body: { connection_id }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireUser();
    const body = (await request.json()) as { connection_id?: string };

    if (!body.connection_id) {
      throw new OpenBankingHttpError(
        "Specifica la connessione da sincronizzare.",
        400
      );
    }

    const result = await syncConnection({
      supabase,
      userId: user.id,
      connectionId: body.connection_id,
    });

    const softOnly =
      result.errors.length > 0 && (result.imported > 0 || result.updated > 0);

    return NextResponse.json({
      ok: result.errors.length === 0,
      partial: softOnly,
      imported: result.imported,
      skipped: result.skipped,
      updated: result.updated,
      transfer_suggestions: result.transferSuggestions,
      errors: result.errors,
      message:
        result.errors.length === 0
          ? result.imported > 0
            ? `Sincronizzazione completata: ${result.imported} nuovi movimenti.`
            : "Sincronizzazione completata. Nessun nuovo movimento."
          : softOnly
            ? `Importati ${result.imported} movimenti. ${result.errors[0]}`
            : result.errors[0] ?? "Sincronizzazione non riuscita.",
    });
  } catch (error) {
    return italianErrorResponse(error);
  }
}
