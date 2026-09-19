"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, Unplug, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BankAccountRow, BankConnectionRow } from "@/features/open-banking/types";

type ConnectionView = BankConnectionRow & {
  bank_accounts: BankAccountRow[];
  consent_expired: boolean;
  consent_message: string | null;
};

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

/**
 * Drop-in panel for Conti / accounts page.
 * Sibling can render: <BankConnectionsPanel />
 */
export function BankConnectionsPanel() {
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/accounts");
      const data = await res.json();
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

  async function sync(connectionId: string) {
    setBusyId(connectionId);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sincronizzazione non riuscita.");
      }
      await refresh();
    } catch {
      setError("Sincronizzazione non riuscita.");
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
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Disconnessione non riuscita.");
      }
      await refresh();
    } catch {
      setError("Disconnessione non riuscita.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Banche collegate</h2>
          <p className="text-sm text-muted-foreground">
            Open Banking in sola lettura
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/accounts/connect-bank">
            <Link2 />
            Collega banca
          </Link>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Caricamento…
        </div>
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessuna banca collegata.{" "}
          <Link
            href="/accounts/connect-bank"
            className="font-medium text-teal-700 underline-offset-2 hover:underline"
          >
            Collega Intesa Sanpaolo o un&apos;altra banca
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-3">
          {connections.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{c.institution_name}</p>
                  <Badge
                    variant={
                      c.consent_expired || c.status === "expired"
                        ? "destructive"
                        : c.status === "active"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {statusLabel(c.status, c.consent_expired)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ultima sync: {formatSync(c.last_synced_at)}
                </p>
                {c.consent_message && (
                  <p className="text-xs text-amber-800">{c.consent_message}</p>
                )}
                {c.bank_accounts?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {c.bank_accounts.length} conto
                    {c.bank_accounts.length === 1 ? "" : "i"} collegato
                    {c.bank_accounts.length === 1 ? "" : "i"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(c.consent_expired ||
                  c.status === "expired" ||
                  c.status === "rejected" ||
                  c.status === "error") && (
                  <Button asChild size="sm" variant="outline">
                    <Link href="/accounts/connect-bank">Ricollega</Link>
                  </Button>
                )}
                {c.status === "active" && !c.consent_expired && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === c.id}
                    onClick={() => void sync(c.id)}
                  >
                    {busyId === c.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RefreshCw />
                    )}
                    Sync
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busyId === c.id}
                  onClick={() => void disconnect(c.id)}
                >
                  <Unplug />
                  Disconnetti
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Minimal entry point link for Conti page header. */
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
