import { NextRequest, NextResponse } from "next/server";
import {
  italianErrorResponse,
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { startBankConnection } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/open-banking/connect
 * Body: { institution_id, institution_name, institution_logo? }
 * Returns { link, connection_id } — client redirects to bank (never asks for credentials).
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireUser();
    const body = (await request.json()) as {
      institution_id?: string;
      institution_name?: string;
      institution_logo?: string | null;
    };

    if (!body.institution_id || !body.institution_name) {
      throw new OpenBankingHttpError(
        "Seleziona una banca per continuare.",
        400
      );
    }

    const result = await startBankConnection({
      supabase,
      userId: user.id,
      institutionId: body.institution_id,
      institutionName: body.institution_name,
      institutionLogo: body.institution_logo,
    });

    return NextResponse.json({
      connection_id: result.connectionId,
      link: result.link,
    });
  } catch (error) {
    return italianErrorResponse(error);
  }
}
