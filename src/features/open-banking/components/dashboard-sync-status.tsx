"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BankConnectionRow } from "@/features/open-banking/types";

type Conn = Pick<
  BankConnectionRow,
  "id" | "institution_name" | "status" | "last_synced_at" | "error_message"
>;

const RATE_LIMIT_COOLDOWN_SEC = 300;

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

function looksLikeRateLimit(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /troppe richieste|già scaricati sono al sicuro|riprova tra qualche/i.test(msg);
}

/** Compact bank sync status for the Home dashboard. */
export function DashboardSyncStatus() {
  const router = useRouter();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

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

  useEffect(() => {
    const active = Object.values(cooldownUntil).some((t) => t > Date.now());
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function remainingCooldown(connectionId: string): number {
    const until = cooldownUntil[connectionId] ?? 0;
    return Math.max(0, Math.ceil((until - now) / 1000));
  }

  function startCooldown(connectionId: string, seconds: number) {
    const sec = seconds > 0 ? seconds : RATE_LIMIT_COOLDOWN_SEC;
    setCooldownUntil((prev) => ({
      ...prev,
      [connectionId]: Date.now() + sec * 1000,
    }));
  }

  async function sync(connectionId: string) {
    if (remainingCooldown(connectionId) > 0) return;
    setBusyId(connectionId);
    setLastMessage(null);
    try {
      const res = await fetch("/api/open-banking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      const data = await res.json().catch(() => ({}));
      await refresh();

      if (!res.ok) {
        const msg = data.error ?? data.message ?? "Sincronizzazione non riuscita.";
        setLastMessage(msg);
        if (looksLikeRateLimit(msg) || data.rate_limited) {
          startCooldown(connectionId, data.retry_after_seconds ?? RATE_LIMIT_COOLDOWN_SEC);
          toast.message("Banca momentaneamente occupata", { description: msg });
        } else {
          toast.error(msg);
        }
        return;
      }

      if (data.rate_limited || looksLikeRateLimit(data.message)) {
        const msg =
          data.message ??
          "Riprova tra qualche minuto — i movimenti già scaricati sono al sicuro";
        setLastMessage(msg);
        startCooldown(connectionId, data.retry_after_seconds ?? RATE_LIMIT_COOLDOWN_SEC);
        toast.message("Sincronizzazione in pausa", { description: msg });
        router.refresh();
        return;
      }

      if (data.ok) {
        setLastMessage(null);
        toast.success(data.message ?? "Sincronizzazione completata.");
        router.refresh();
        return;
      }

      if (data.partial) {
        const msg =
          data.message ??
          data.errors?.[0] ??
          "Sincronizzazione parziale. Riprova tra poco.";
        setLastMessage(msg);
        if (looksLikeRateLimit(msg)) {
          startCooldown(connectionId, data.retry_after_seconds ?? RATE_LIMIT_COOLDOWN_SEC);
        }
        toast.message("Sincronizzazione parziale", { description: msg });
        router.refresh();
        return;
      }

      const msg =
        data.message ?? data.error ?? data.errors?.[0] ?? "Sincronizzazione non riuscita.";
      setLastMessage(msg);
      toast.error(msg);
    } catch {
      const msg = "Sincronizzazione non riuscita. Controlla la connessione e riprova.";
      setLastMessage(msg);
      toast.error(msg);
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
      {lastMessage && (
        <p className="text-xs text-warning leading-relaxed">{lastMessage}</p>
      )}
      <ul className="space-y-2">
        {connections.map((c) => {
          const cooldown = remainingCooldown(c.id);
          const rateLimited =
            cooldown > 0 || looksLikeRateLimit(c.error_message);
          return (
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
                  {cooldown > 0 ? ` · attesa ${cooldown}s` : ""}
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
                  disabled={busyId === c.id || cooldown > 0}
                  aria-label={`Sincronizza ${c.institution_name}`}
                  onClick={() => void sync(c.id)}
                >
                  {busyId === c.id ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                  {cooldown > 0 ? `${cooldown}s` : rateLimited ? "Riprova" : "Sync"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
