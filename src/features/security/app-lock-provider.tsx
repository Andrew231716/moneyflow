"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Fingerprint, ScanFace } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  biometricLabel,
  clearAppLockConfig,
  hasAppLockPin,
  isAppLockUnlocked,
  isPlatformAuthenticatorAvailable,
  isValidPin,
  markAppHidden,
  readAppLockConfig,
  registerAppLockCredential,
  saveAppLockPin,
  setAppLockUnlocked,
  shouldRelockAfterBackground,
  verifyAppLockCredential,
  verifyAppLockPin,
  writeAppLockConfig,
} from "@/lib/security/app-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AppLockContextValue = {
  supported: boolean | null;
  enabled: boolean;
  hasPin: boolean;
  hasBiometric: boolean;
  label: string;
  enabling: boolean;
  enableWithPin: (pin: string, withBiometric: boolean) => Promise<void>;
  disable: () => void;
  lockNow: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [label, setLabel] = useState("biometria");
  const [pinInput, setPinInput] = useState("");
  const [showPin, setShowPin] = useState(false);

  const syncFromStorage = useCallback(async () => {
    const available = await isPlatformAuthenticatorAvailable();
    setSupported(available);
    setLabel(biometricLabel());

    const config = readAppLockConfig();
    const {
      data: { user },
    } = await createClient().auth.getUser();

    const lockReady =
      config.enabled &&
      user &&
      config.userId === user.id &&
      (config.hasPin || config.hasBiometric);

    if (lockReady) {
      setEnabled(true);
      setHasPin(config.hasPin);
      setHasBiometric(config.hasBiometric);
      if (!isAppLockUnlocked()) setLocked(true);
      else setLocked(false);
    } else {
      if (config.enabled && config.userId && user && config.userId !== user.id) {
        clearAppLockConfig();
      }
      setEnabled(false);
      setHasPin(false);
      setHasBiometric(false);
      setLocked(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void syncFromStorage();
  }, [syncFromStorage]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (enabled) markAppHidden();
        return;
      }
      if (!enabled) return;
      if (shouldRelockAfterBackground()) {
        setAppLockUnlocked(false);
        setLocked(true);
        setShowPin(false);
        setPinInput("");
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  const enableWithPin = useCallback(
    async (pin: string, withBiometric: boolean) => {
      setEnabling(true);
      try {
        if (!isValidPin(pin)) {
          throw new Error("Il PIN deve avere da 4 a 8 cifre");
        }
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Non autenticato");

        await saveAppLockPin(pin);

        let credentialId: string | null = null;
        if (withBiometric) {
          const available = await isPlatformAuthenticatorAvailable();
          if (!available) {
            throw new Error(
              "Questo dispositivo non supporta Face ID / biometria nel browser"
            );
          }
          credentialId = await registerAppLockCredential({
            userId: user.id,
            userName: user.email ?? user.id,
          });
        }

        writeAppLockConfig({
          enabled: true,
          userId: user.id,
          credentialId,
        });
        setAppLockUnlocked(true);
        setEnabled(true);
        setHasPin(true);
        setHasBiometric(Boolean(credentialId));
        setLocked(false);
        toast.success(
          withBiometric
            ? `Sblocco con ${biometricLabel()} + PIN attivato`
            : "Sblocco con PIN attivato"
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Attivazione non riuscita");
        throw e;
      } finally {
        setEnabling(false);
      }
    },
    []
  );

  const disable = useCallback(() => {
    clearAppLockConfig();
    setEnabled(false);
    setHasPin(false);
    setHasBiometric(false);
    setLocked(false);
    toast.success("Sblocco app disattivato");
  }, []);

  const lockNow = useCallback(() => {
    if (!enabled) return;
    setAppLockUnlocked(false);
    setLocked(true);
    setShowPin(false);
    setPinInput("");
  }, [enabled]);

  const unlockBiometric = useCallback(async () => {
    const config = readAppLockConfig();
    if (!config.credentialId) {
      setShowPin(true);
      return;
    }
    setUnlocking(true);
    try {
      await verifyAppLockCredential(config.credentialId);
      setAppLockUnlocked(true);
      setLocked(false);
      setPinInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sblocco biometrico non riuscito");
      setShowPin(true);
    } finally {
      setUnlocking(false);
    }
  }, []);

  const unlockPin = useCallback(async () => {
    setUnlocking(true);
    try {
      const ok = await verifyAppLockPin(pinInput);
      if (!ok) throw new Error("PIN non corretto");
      setAppLockUnlocked(true);
      setLocked(false);
      setPinInput("");
      setShowPin(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sblocco non riuscito");
    } finally {
      setUnlocking(false);
    }
  }, [pinInput]);

  useEffect(() => {
    if (!ready || !locked || !enabled) return;
    if (!hasBiometric) {
      setShowPin(true);
      return;
    }
    const t = window.setTimeout(() => {
      void unlockBiometric();
    }, 350);
    return () => window.clearTimeout(t);
  }, [ready, locked, enabled, hasBiometric, unlockBiometric]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      supported,
      enabled,
      hasPin,
      hasBiometric,
      label,
      enabling,
      enableWithPin,
      disable,
      lockNow,
    }),
    [
      supported,
      enabled,
      hasPin,
      hasBiometric,
      label,
      enabling,
      enableWithPin,
      disable,
      lockNow,
    ]
  );

  return (
    <AppLockContext.Provider value={value}>
      {children}
      {ready && enabled && locked && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background/95 px-6 backdrop-blur-sm">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
            {/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? (
              <ScanFace className="size-8" />
            ) : (
              <Fingerprint className="size-8" />
            )}
          </div>
          <div className="max-w-sm space-y-2 text-center">
            <h1 className="text-xl font-semibold tracking-tight">MoneyFlow</h1>
            <p className="text-sm text-muted-foreground">
              {showPin || !hasBiometric
                ? "Inserisci il PIN per continuare"
                : `Sblocca con ${label} (o usa il PIN di backup)`}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            {hasBiometric && !showPin && (
              <Button
                className="min-h-touch w-full"
                disabled={unlocking}
                onClick={() => void unlockBiometric()}
              >
                {unlocking ? "Verifica…" : `Sblocca con ${label}`}
              </Button>
            )}
            {(showPin || !hasBiometric || hasAppLockPin()) && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="app-lock-pin">PIN</Label>
                <Input
                  id="app-lock-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) =>
                    setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))
                  }
                  className="min-h-touch text-center tracking-[0.3em]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void unlockPin();
                  }}
                />
                <Button
                  className="min-h-touch w-full"
                  disabled={unlocking || pinInput.length < 4}
                  onClick={() => void unlockPin()}
                >
                  Sblocca con PIN
                </Button>
              </div>
            )}
            {hasBiometric && !showPin && (
              <Button
                variant="outline"
                className="min-h-touch w-full"
                onClick={() => setShowPin(true)}
              >
                Usa PIN di backup
              </Button>
            )}
            <Button
              variant="ghost"
              className="min-h-touch w-full"
              onClick={async () => {
                clearAppLockConfig();
                setEnabled(false);
                setLocked(false);
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
            >
              Esci dall&apos;account
            </Button>
          </div>
        </div>
      )}
    </AppLockContext.Provider>
  );
}
