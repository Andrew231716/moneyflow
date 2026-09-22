"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RATE_LIMIT_RETRY_AFTER_SECONDS } from "@/features/open-banking/errors";
import { cn } from "@/lib/utils";

type Conn = { id: string; institution_name: string; status: string };

function looksLikeRateLimit(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /troppe richieste|rate.?limit|già scaricati|riprova tra|banca momentaneamente|quota giornaliera|riprova domani|sincronizzazione parziale|prossima sync/i.test(
    msg
  );
}

/**
 * Syncs active bank connections in place (stays on the current page).
 * Used from Movimenti empty states so "Sync banca" does not dump users on Conti.
 */
export function SyncBankButton({
  className,
  size = "sm",
  variant = "outline",
  label = "Sync banca",
  onSynced,
}: {
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "secondary";
  label?: string;
  onSynced?: () => void;
}) {
  const router = useRouter();
  const [connections, setConnections] = useState<Conn[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/open-banking/accounts");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const list = (data.connections ?? []) as Conn[];
        setConnections(list.filter((c) => c.status === "active"));
      } else {
        setConnections([]);
      }
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function syncAll() {
    if (busy) return;
    if (connections.length === 0) {
      toast.message("Nessuna banca attiva", {
        description: "Collega un conto da Conti per sincronizzare.",
      });
      router.push("/accounts");
      return;
    }

    setBusy(true);
    let anyOk = false;
    try {
      for (const c of connections) {
        const res = await fetch("/api/open-banking/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connection_id: c.id }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg = data.error ?? data.message ?? "Sincronizzazione non riuscita.";
          if (looksLikeRateLimit(msg) || data.rate_limited) {
            toast.message("Banca momentaneamente occupata", { description: msg });
          } else {
            toast.error(`${c.institution_name}: ${msg}`);
          }
          continue;
        }

        anyOk = true;
        if (data.rate_limited || looksLikeRateLimit(data.message)) {
          toast.message("Sincronizzazione in pausa", {
            description:
              data.message ??
              `Riprova tra circa ${RATE_LIMIT_RETRY_AFTER_SECONDS}s.`,
          });
        } else if (data.partial) {
          toast.message("Sincronizzazione parziale", {
            description: data.message ?? data.errors?.[0],
          });
        } else {
          toast.success(
            data.message ?? `${c.institution_name}: sincronizzazione completata.`
          );
        }
      }

      if (anyOk) {
        onSynced?.();
        router.refresh();
      }
    } catch {
      toast.error("Sincronizzazione non riuscita. Controlla la connessione.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={cn("min-h-touch", className)}
      disabled={loading || busy}
      onClick={() => void syncAll()}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden />
      )}
      {busy ? "Sincronizzo…" : label}
    </Button>
  );
}
