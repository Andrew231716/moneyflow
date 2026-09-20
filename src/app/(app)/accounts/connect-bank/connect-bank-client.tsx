"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Building2, Loader2, Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Institution } from "@/features/open-banking/types";

const STATUS_MESSAGES: Record<string, string> = {
  rejected: "Autorizzazione rifiutata dalla banca. Puoi riprovare.",
  expired: "Autorizzazione scaduta. Seleziona di nuovo la banca.",
  suspended: "Connessione sospesa dalla banca. Riprova più tardi.",
  error: "Si è verificato un errore durante il collegamento. Riprova.",
  pending: "Autorizzazione ancora in corso. Controlla lo stato tra poco.",
  sync_error:
    "Banca collegata, ma la sincronizzazione dei movimenti non è riuscita. Vai su Conti e premi Sincronizza.",
};

export default function ConnectBankClient() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  const [query, setQuery] = useState("");
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [suggested, setSuggested] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ country: "IT" });
      if (q?.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/open-banking/institutions?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Impossibile caricare le banche.");
        setInstitutions([]);
        setSuggested(null);
        return;
      }
      setInstitutions(data.institutions ?? []);
      setSuggested(data.suggested ?? null);
    } catch {
      setError("Impossibile caricare le banche. Riprova.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, load]);

  const statusMessage = status ? STATUS_MESSAGES[status] : null;
  const list = useMemo(() => institutions, [institutions]);

  async function connect(inst: Institution) {
    setConnectingId(inst.id);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          institution_id: inst.id,
          institution_name: inst.name,
          institution_logo: inst.logo,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.link) {
        setError(data.error ?? "Impossibile avviare il collegamento.");
        setConnectingId(null);
        return;
      }
      // Redirect to bank authorization — never collect credentials in-app
      window.location.href = data.link as string;
    } catch {
      setError("Impossibile avviare il collegamento. Riprova.");
      setConnectingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Open Banking in sola lettura: MoneyFlow non chiede mai le tue
          credenziali bancarie. L&apos;autorizzazione avviene sul sito sicuro
          della banca.
        </p>
        <p className="text-xs text-muted-foreground">Paese: Italia (IT)</p>
      </div>

      {statusMessage && (
        <div
          className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-sm text-foreground"
          role="status"
        >
          {statusMessage}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9 min-h-touch"
          placeholder="Cerca banca (es. Intesa Sanpaolo)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cerca banca"
        />
      </div>

      {suggested && !query.trim() && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Star className="size-4 text-primary" />
            Suggerita per te
          </h2>
          <InstitutionRow
            institution={suggested}
            connecting={connectingId === suggested.id}
            onConnect={() => void connect(suggested)}
            highlight
          />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Banche disponibili in Italia
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
            <Loader2 className="size-4 animate-spin" />
            Caricamento banche…
          </div>
        ) : list.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground text-center">
            Nessuna banca trovata. Prova un altro nome o lascia vuota la ricerca
            per vedere l&apos;elenco completo.
          </p>
        ) : (
          <ul className="mf-surface divide-y overflow-hidden">
            {list.map((inst) => (
              <li key={inst.id}>
                <InstitutionRow
                  institution={inst}
                  connecting={connectingId === inst.id}
                  onConnect={() => void connect(inst)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InstitutionRow({
  institution,
  connecting,
  onConnect,
  highlight,
}: {
  institution: Institution;
  connecting: boolean;
  onConnect: () => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-3 min-h-touch ${
        highlight ? "rounded-xl border border-primary/25 bg-primary/5" : ""
      }`}
    >
      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
        {institution.logo ? (
          <Image
            src={institution.logo}
            alt=""
            width={40}
            height={40}
            className="object-contain"
            unoptimized
          />
        ) : (
          <Building2 className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{institution.name}</p>
        {institution.bic && (
          <p className="truncate text-xs text-muted-foreground">
            {institution.bic}
          </p>
        )}
      </div>
      <Button
        size="sm"
        className="min-h-touch"
        onClick={onConnect}
        disabled={connecting}
        aria-label={`Collega ${institution.name}`}
      >
        {connecting ? (
          <>
            <Loader2 className="animate-spin" />
            Collegamento…
          </>
        ) : (
          "Collega"
        )}
      </Button>
    </div>
  );
}
