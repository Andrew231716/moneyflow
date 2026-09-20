"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Unplug, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BankAccountRow, BankConnectionRow } from "@/features/open-banking/types";

type ConnectionView = BankConnectionRow & {
  bank_accounts: BankAccountRow[];
  consent_expired: boolean;
  consent_message: string | null;
};

const RATE_LIMIT_COOLDOWN_SEC = 120;

function formatSync(iso: string | null): string {
  if (!iso) return "Mai sincronizzato";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(status: string, expired: boolean): string {
  if (expired || status === "expired") return "Consenso scaduto";
  switch (status) {
    case "active":
      return "Connesso";
    case "pending":
      return "In attesa";
    case "rejected":
      return "Rifiutato";
    case "suspended":
      return "Sospeso";
    case "error":
      return "Errore";
    default:
      return status;
  }
}

function looksLikeRateLimit(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /troppe richieste|già scaricati sono al sicuro|riprova tra qualche/i.test(msg);
}

/**
 * Drop-in panel for Conti / accounts page.
 */
export function BankConnectionsPanel() {
  const router = useRouter();
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/accounts");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Impossibile caricare le connessioni.");
        setConnections([]);
        return;
      }
      setConnections(data.connections ?? []);
    } catch {
      setError("Impossibile caricare le connessioni.");
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

  async function sync(connectionId: string, fullSync = false) {
    if (remainingCooldown(connectionId) > 0) return;
    setBusyId(connectionId);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connectionId,
          full_sync: fullSync || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      await refresh();
      if (!res.ok) {
        const msg = data.error ?? data.message ?? "Sincronizzazione non riuscita.";
        setError(msg);
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
        setError(msg);
        startCooldown(connectionId, data.retry_after_seconds ?? RATE_LIMIT_COOLDOWN_SEC);
        toast.message("Sincronizzazione in pausa", { description: msg });
        router.refresh();
        return;
      }
      if (data.ok) {
        toast.success(data.message ?? "Sincronizzazione completata.");
        router.refresh();
        return;
      }
      if (data.partial) {
        const msg =
          data.message ??
          data.errors?.[0] ??
          "Sincronizzazione parziale. Riprova tra poco per i movimenti restanti.";
        setError(msg);
        if (looksLikeRateLimit(msg)) {
          startCooldown(connectionId, data.retry_after_seconds ?? RATE_LIMIT_COOLDOWN_SEC);
        }
        toast.message("Sincronizzazione parziale", { description: msg });
        router.refresh();
        return;
      }
      const msg =
        data.message ?? data.error ?? data.errors?.[0] ?? "Sincronizzazione non riuscita.";
      setError(msg);
      toast.error(msg);
    } catch {
      const msg = "Sincronizzazione non riuscita. Controlla la connessione e riprova.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  async function disconnect(connectionId: string) {
    if (!confirm("Disconnettere questa banca? I movimenti già importati restano.")) {
      return;
    }
    setBusyId(connectionId);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      const data = await res.json().catch(() => ({}));
      await refresh();
      if (!res.ok) {
        setError(data.error ?? "Disconnessione non riuscita.");
      }
    } catch {
      setError("Disconnessione non riuscita.");
    } finally {
      setBusyId(null);
    }
  }

  const hasIntesa = connections.some((c) =>
    /intesa/i.test(c.institution_name ?? "")
  );
  const latestSync = connections.reduce<string | null>((best, c) => {
    if (!c.last_synced_at) return best;
    if (!best || c.last_synced_at > best) return c.last_synced_at;
    return best;
  }, null);
  const hasActiveBank = connections.some(
    (c) => c.status === "active" && !c.consent_expired
  );

  return (
    <div className="mf-surface p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Banche collegate</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Open Banking in sola lettura
          </p>
        </div>
        <Button asChild size="sm" className="min-h-touch">
          <Link href="/accounts/connect-bank">
            <Link2 />
            Collega banca
          </Link>
        </Button>
      </div>

      {hasActiveBank && (
        <p className="text-xs text-muted-foreground rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
          Ultimo aggiornamento: {formatSync(latestSync)}. Aggiornamento automatico attivo
          (una volta al giorno).
        </p>
      )}

      {error && (
        <p
          className="text-sm text-destructive rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2"
          role="alert"
        >
          {error}
        </p>
      )}

      {hasIntesa && (
        <p className="text-xs text-muted-foreground rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
          I salvadanai (XME Salvadanaio) e gli obiettivi dell&apos;app Intesa Sanpaolo non
          sono disponibili tramite Open Banking: la banca espone solo i conti di
          pagamento (saldo e movimenti), non i contenitori di risparmio privati.
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Caricamento…
        </div>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          Nessuna banca collegata.{" "}
          <Link
            href="/accounts/connect-bank"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Collega Intesa Sanpaolo o un&apos;altra banca
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {connections.map((c) => {
            const cool = remainingCooldown(c.id);
            const syncBusy = busyId === c.id;
            return (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border bg-background/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{c.institution_name}</p>
                    <Badge
                      variant={
                        c.consent_expired || c.status === "expired"
                          ? "destructive"
                          : c.status === "active"
                            ? "success"
                            : c.status === "pending"
                              ? "warning"
                              : "secondary"
                      }
                    >
                      {statusLabel(c.status, c.consent_expired)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ultimo aggiornamento: {formatSync(c.last_synced_at)}
                  </p>
                  {c.error_message && !c.consent_expired && (
                    <p className="text-xs text-warning">{c.error_message}</p>
                  )}
                  {c.consent_message && (
                    <p className="text-xs text-warning">{c.consent_message}</p>
                  )}
                  {c.bank_accounts?.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {c.bank_accounts.map((ba) => (
                        <li key={ba.id}>
                          {ba.name || "Conto"}
                          {ba.iban_masked ? ` · ${ba.iban_masked}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(c.consent_expired ||
                    c.status === "expired" ||
                    c.status === "rejected" ||
                    c.status === "error") && (
                    <Button asChild size="sm" variant="outline" className="min-h-touch">
                      <Link href="/accounts/connect-bank">Ricollega</Link>
                    </Button>
                  )}
                  {c.status === "active" && !c.consent_expired && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-touch"
                        disabled={syncBusy || cool > 0}
                        onClick={() => void sync(c.id, false)}
                      >
                        {syncBusy ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RefreshCw />
                        )}
                        {cool > 0 ? `Attendi ${cool}s` : "Sincronizza"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-touch text-xs"
                        disabled={syncBusy || cool > 0}
                        onClick={() => {
                          if (
                            confirm(
                              "Scaricare di nuovo fino a 90 giorni di movimenti? Usa questa opzione solo se mancano dati vecchi."
                            )
                          ) {
                            void sync(c.id, true);
                          }
                        }}
                      >
                        Sincronizza tutto
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-touch"
                    disabled={busyId === c.id}
                    onClick={() => void disconnect(c.id)}
                  >
                    <Unplug />
                    Disconnetti
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ConnectBankLink({ className }: { className?: string }) {
  return (
    <Button asChild size="sm" variant="outline" className={className}>
      <Link href="/accounts/connect-bank">
        <Link2 />
        Collega banca
      </Link>
    </Button>
  );
}
