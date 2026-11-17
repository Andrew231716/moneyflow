"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "mf-pwa-install-dismissed";

export function PwaInstallNudge() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!visible || !event) return null;

  async function install() {
    await event!.prompt();
    const choice = await event!.userChoice;
    if (choice.outcome === "accepted") {
      setVisible(false);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div className="mf-surface flex items-start gap-3 p-3 border border-primary/20 bg-primary/[0.04]">
      <Download className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">Installa MoneyFlow</p>
        <p className="text-xs text-muted-foreground">
          Aggiungilo alla home per aprirlo subito e ricevere promemoria sui
          consensi banca.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="min-h-touch" onClick={() => void install()}>
            Installa
          </Button>
          <Button size="sm" variant="ghost" className="min-h-touch" onClick={dismiss}>
            Non ora
          </Button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Chiudi"
        className="text-muted-foreground hover:text-foreground p-1"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
