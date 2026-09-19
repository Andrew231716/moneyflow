import { NextRequest, NextResponse } from "next/server";
import {
  italianErrorResponse,
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { syncConnection } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

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

    return NextResponse.json({
      ok: true,
      imported: result.imported,
      skipped: result.skipped,
      updated: result.updated,
      transfer_suggestions: result.transferSuggestions,
      errors: result.errors,
    });
  } catch (error) {
    return italianErrorResponse(error);
  }
}
