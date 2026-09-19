import { NextRequest, NextResponse } from "next/server";
import {
  italianErrorResponse,
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { disconnectConnection } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/open-banking/disconnect
 * Body: { connection_id }
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireUser();
    const body = (await request.json()) as { connection_id?: string };

    if (!body.connection_id) {
      throw new OpenBankingHttpError(
        "Specifica la connessione da disconnettere.",
        400
      );
    }

    await disconnectConnection({
      supabase,
      userId: user.id,
      connectionId: body.connection_id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return italianErrorResponse(error);
  }
}
