import { NextRequest, NextResponse } from "next/server";
import {
  italianErrorResponse,
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { confirmInternalTransfer } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/open-banking/confirm-transfer
 * Body: { transaction_id, matched_transaction_id }
 * Confirms a suggested internal transfer (only then type=transfer).
 */
export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await requireUser();
    const body = (await request.json()) as {
      transaction_id?: string;
      matched_transaction_id?: string;
    };

    if (!body.transaction_id || !body.matched_transaction_id) {
      throw new OpenBankingHttpError(
        "Seleziona entrambe le transazioni del trasferimento.",
        400
      );
    }

    await confirmInternalTransfer({
      supabase,
      userId: user.id,
      transactionId: body.transaction_id,
      matchedTransactionId: body.matched_transaction_id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return italianErrorResponse(error);
  }
}
