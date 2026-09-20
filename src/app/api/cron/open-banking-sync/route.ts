import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { syncAllActiveConnections } from "@/features/open-banking/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/**
 * GET /api/cron/open-banking-sync
 * Secured by CRON_SECRET (Authorization: Bearer …).
 * Syncs active bank connections gently (sequential + delays).
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Non autorizzato." }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const summary = await syncAllActiveConnections({
      supabase,
      delayMs: 5_000,
      maxConnections: 20,
    });

    return NextResponse.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Errore durante il sync automatico.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
