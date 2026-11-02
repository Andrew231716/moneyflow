"use client";

import { toast } from "sonner";
import { useAppLock } from "@/features/security/app-lock-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AppLockSettings() {
  const { supported, enabled, label, enabling, enable, disable, lockNow } =
    useAppLock();

  async function toggle() {
    if (enabled) {
      disable();
      return;
    }
    try {
      await enable();
    } catch {
      // toast already shown in provider
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sblocco biometrico</CardTitle>
        <CardDescription>
          All&apos;apertura dell&apos;app chiedi {label} (Face ID, Touch ID o
          equivalente). Non sostituisce email e password: protegge solo questo
          dispositivo quando sei già connesso.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {supported === false ? (
          <p className="text-sm text-muted-foreground">
            Questo browser/dispositivo non espone Face ID o biometria via web.
            Su iPhone funziona meglio da Safari o dall&apos;app aggiunta alla
            Home.
          </p>
        ) : (
          <>
            <Button
              variant={enabled ? "secondary" : "default"}
              className="min-h-touch"
              disabled={supported === null || enabling}
              onClick={() => void toggle()}
            >
              {enabling
                ? "Attivazione…"
                : enabled
                  ? "Disattiva"
                  : `Attiva ${label}`}
            </Button>
            {enabled && (
              <Button
                variant="outline"
                className="min-h-touch"
                onClick={() => {
                  lockNow();
                  toast.message("App bloccata");
                }}
              >
                Blocca ora
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
