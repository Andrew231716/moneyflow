"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAppLock } from "@/features/security/app-lock-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AppLockSettings() {
  const {
    supported,
    enabled,
    hasPin,
    hasBiometric,
    label,
    enabling,
    enableWithPin,
    disable,
    lockNow,
  } = useAppLock();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [withBiometric, setWithBiometric] = useState(true);

  async function activate() {
    if (pin !== confirm) {
      toast.error("I due PIN non coincidono");
      return;
    }
    try {
      await enableWithPin(pin, withBiometric && supported === true);
      setPin("");
      setConfirm("");
    } catch {
      // toast already shown
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sblocco app</CardTitle>
        <CardDescription>
          All&apos;apertura chiedi un PIN (e opzionalmente {label}). Gratuito,
          solo su questo dispositivo — non sostituisce email/password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {enabled ? (
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-sm text-muted-foreground">
              Attivo
              {hasBiometric ? ` · ${label}` : ""}
              {hasPin ? " · PIN di backup" : ""}
            </p>
            <Button
              variant="secondary"
              className="min-h-touch"
              onClick={disable}
            >
              Disattiva
            </Button>
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
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="lock-pin">PIN (4–8 cifre)</Label>
                <Input
                  id="lock-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  className="min-h-touch"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lock-pin-2">Conferma PIN</Label>
                <Input
                  id="lock-pin-2"
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirm}
                  onChange={(e) =>
                    setConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  className="min-h-touch"
                />
              </div>
            </div>
            {supported === true && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={withBiometric}
                  onChange={(e) => setWithBiometric(e.target.checked)}
                />
                Usa anche {label}
              </label>
            )}
            {supported === false && (
              <p className="text-xs text-muted-foreground">
                Biometria non disponibile qui: puoi comunque usare solo il PIN.
              </p>
            )}
            <Button
              className="min-h-touch"
              disabled={enabling || pin.length < 4 || confirm.length < 4}
              onClick={() => void activate()}
            >
              {enabling ? "Attivazione…" : "Attiva sblocco"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
