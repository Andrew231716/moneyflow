import { NextRequest, NextResponse } from "next/server";
import {
  OpenBankingHttpError,
  requireUser,
} from "@/features/open-banking/auth";
import { handleConnectionCallback } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/open-banking/callback
 * GoCardless: ref / requisition id
 * Enable Banking: code + state (or error + error_description)
 */
export async function GET(request: NextRequest) {
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ??
    request.nextUrl.origin ??
    "http://localhost:3000";

  try {
    const { user, supabase } = await requireUser();
    const { searchParams } = request.nextUrl;

    const providerError = searchParams.get("error");
    if (providerError) {
      const reason =
        /denied|cancel|rejected/i.test(providerError) ||
        /denied|cancel|rejected/i.test(searchParams.get("error_description") ?? "")
          ? "rejected"
          : "error";
      return NextResponse.redirect(
        new URL(`/accounts/connect-bank?status=${reason}`, appOrigin)
      );
    }

    const code = searchParams.get("code");
    const state = searchParams.get("state");

    // GoCardless redirects with ref= our reference; may also include other params
    const ref =
      state ??
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
      code,
    });

    const status = connection.status;
    // Auth succeeded → land on Conti even if the first sync was partial.
    if (status === "active") {
      const url = new URL("/accounts", appOrigin);
      url.searchParams.set("bank", "connected");
      if (!synced) url.searchParams.set("sync", "partial");
      return NextResponse.redirect(url);
    }

    const reason =
      status === "rejected"
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
