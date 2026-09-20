import { NextRequest, NextResponse } from "next/server";
import {
  italianErrorResponse,
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { resolveDefaultProviderId } from "@/features/open-banking/factory";
import { listInstitutions } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/open-banking/institutions?country=IT&q=
 * Returns Italian institutions with Intesa Sanpaolo prioritized (dynamic id).
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser();

    const { searchParams } = request.nextUrl;
    const country = (searchParams.get("country") ?? "IT").toUpperCase();
    const search = searchParams.get("q") ?? searchParams.get("search") ?? undefined;

    const institutions = await listInstitutions({
      country,
      search,
      providerId: resolveDefaultProviderId(),
    });

    return NextResponse.json({
      country,
      institutions,
      suggested:
        institutions.find((i) => i.isSuggested) ?? null,
    });
  } catch (error) {
    if (error instanceof OpenBankingHttpError) {
      return italianErrorResponse(error);
    }
    return italianErrorResponse(error);
  }
}
