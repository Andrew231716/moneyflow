import { NextRequest, NextResponse } from "next/server";
import {
  italianErrorResponse,
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { RATE_LIMIT_PARTIAL_MESSAGE, RATE_LIMIT_DAILY_MESSAGE, RATE_LIMIT_RETRY_AFTER_SECONDS, RATE_LIMIT_DAILY_RETRY_AFTER_SECONDS } from "@/features/open-banking/errors";
import { syncConnection } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";
/** Allow multi-page Intesa sync with rate-limit backoff (Hobby may still cap lower). */
export const maxDuration = 60;

/**
 * POST /api/open-banking/sync
 * Body: { connection_id, full_sync?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireUser();
    const body = (await request.json()) as {
      connection_id?: string;
      full_sync?: boolean;
    };

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
      fullSync: Boolean(body.full_sync),
      skipBalances: true,
    });

    const softOnly =
      result.errors.length > 0 &&
      (result.imported > 0 || result.updated > 0 || Boolean(result.rateLimited));

    const rateLimited = Boolean(result.rateLimited);
    const dailyLimited = result.errors.some(
      (e) => e === RATE_LIMIT_DAILY_MESSAGE || /quota giornaliera/i.test(e)
    );
    const message = rateLimited
      ? result.imported > 0
        ? `Importati ${result.imported} movimenti. ${dailyLimited ? RATE_LIMIT_DAILY_MESSAGE : RATE_LIMIT_PARTIAL_MESSAGE}`
        : dailyLimited
          ? RATE_LIMIT_DAILY_MESSAGE
          : RATE_LIMIT_PARTIAL_MESSAGE
      : result.errors.length === 0
        ? result.imported > 0
          ? `Sincronizzazione completata: ${result.imported} nuovi movimenti.`
          : "Sincronizzazione completata. Nessun nuovo movimento."
        : softOnly
          ? `Importati ${result.imported} movimenti. ${result.errors[0]}`
          : result.errors[0] ?? "Sincronizzazione non riuscita.";

    return NextResponse.json({
      ok: result.errors.length === 0 && !rateLimited,
      partial: softOnly || rateLimited,
      rate_limited: rateLimited,
      retry_after_seconds: rateLimited
        ? dailyLimited
          ? RATE_LIMIT_DAILY_RETRY_AFTER_SECONDS
          : RATE_LIMIT_RETRY_AFTER_SECONDS
        : 0,
      imported: result.imported,
      skipped: result.skipped,
      updated: result.updated,
      transfer_suggestions: result.transferSuggestions,
      errors: result.errors,
      message,
    });
  } catch (error) {
    return italianErrorResponse(error);
  }
}
