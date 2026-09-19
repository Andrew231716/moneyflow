import { NextRequest, NextResponse } from "next/server";
import {
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { handleConnectionCallback } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/open-banking/callback
 * Resolves requisition → accounts → MoneyFlow accounts → first sync.
 */
export async function GET(request: NextRequest) {
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ??
    request.nextUrl.origin ??
    "http://localhost:3000";

  try {
    const { user, supabase } = await requireUser();
    const { searchParams } = request.nextUrl;

    // GoCardless redirects with ref= our reference; may also include other params
    const ref =
      searchParams.get("ref") ??
      searchParams.get("reference") ??
      searchParams.get("connection_id");
    const requisitionId =
      searchParams.get("requisition") ??
      searchParams.get("requisition_id") ??
      searchParams.get("id");

    const { connection, synced } = await handleConnectionCallback({
      supabase,
      userId: user.id,
      ref,
      requisitionId,
    });

    const status = connection.status;
    if (status === "active" && synced) {
      return NextResponse.redirect(
        new URL("/accounts?bank=connected", appOrigin)
      );
    }

    const reason =
      status === "active" && !synced
        ? "error"
        : status === "rejected"
        ? "rejected"
        : status === "expired"
          ? "expired"
          : status === "suspended"
            ? "suspended"
            : status === "error"
              ? "error"
              : "pending";

    return NextResponse.redirect(
      new URL(`/accounts/connect-bank?status=${reason}`, appOrigin)
    );
  } catch (error) {
    if (error instanceof OpenBankingHttpError && error.status === 401) {
      return NextResponse.redirect(
        new URL(`/login?redirect=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`, appOrigin)
      );
    }
    // Soft-fail to connect page with generic Italian message
    return NextResponse.redirect(
      new URL("/accounts/connect-bank?status=error", appOrigin)
    );
  }
}
