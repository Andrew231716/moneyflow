"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BankConnectionRow } from "@/features/open-banking/types";

type Conn = Pick<
  BankConnectionRow,
  "id" | "institution_name" | "status" | "last_synced_at" | "error_message"
>;

function formatSync(iso: string | null): string {
  if (!iso) return "Mai";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Compact bank sync status for the Home dashboard. */
export function DashboardSyncStatus() {
  const router = useRouter();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/open-banking/accounts");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setConnections(data.connections ?? []);
      else setConnections([]);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function sync(connectionId: string) {
    setBusyId(connectionId);
    try {
      await fetch("/api/open-banking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      await refresh();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="mf-surface flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Stato banche…
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="mf-surface flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Nessuna banca collegata</p>
          <p className="text-xs text-muted-foreground">
            Collega Intesa o un&apos;altra banca per importare i movimenti.
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="min-h-touch">
          <Link href="/accounts/connect-bank">Collega</Link>
        </Button>
      </div>
    );
  }

  return (
    <section className="mf-surface p-4 space-y-3" aria-label="Stato sincronizzazione banche">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Sync banche</h2>
        <Button asChild size="sm" variant="ghost" className="min-h-touch text-xs">
          <Link href="/accounts">Conti</Link>
        </Button>
      </div>
      <ul className="space-y-2">
        {connections.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium truncate">{c.institution_name}</span>
                <Badge
                  variant={c.status === "active" ? "success" : "secondary"}
                  className="shrink-0"
                >
                  {c.status === "active" ? "Attiva" : c.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Ultima sync: {formatSync(c.last_synced_at)}
              </p>
              {c.error_message && (
                <p className="text-xs text-warning line-clamp-2">{c.error_message}</p>
              )}
            </div>
            {c.status === "active" && (
              <Button
                size="sm"
                variant="outline"
                className="min-h-touch shrink-0"
                disabled={busyId === c.id}
                aria-label={`Sincronizza ${c.institution_name}`}
                onClick={() => void sync(c.id)}
              >
                {busyId === c.id ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <RefreshCw aria-hidden />
                )}
                Sync
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
