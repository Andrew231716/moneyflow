import { NextResponse } from "next/server";
import {
  italianErrorResponse,
  requireUser,
} from "@/features/open-banking/auth";
import { listUserBankConnections } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/open-banking/accounts
 * Lists user's bank connections + linked bank accounts (ownership enforced).
 */
export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const connections = await listUserBankConnections({
      supabase,
      userId: user.id,
    });

    return NextResponse.json({ connections });
  } catch (error) {
    return italianErrorResponse(error);
  }
}
