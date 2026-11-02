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
  isAppLockUnlocked,
  isPlatformAuthenticatorAvailable,
  markAppHidden,
  readAppLockConfig,
  registerAppLockCredential,
  setAppLockUnlocked,
  shouldRelockAfterBackground,
  verifyAppLockCredential,
  writeAppLockConfig,
} from "@/lib/security/app-lock";
import { Button } from "@/components/ui/button";

type AppLockContextValue = {
  supported: boolean | null;
  enabled: boolean;
  label: string;
  enabling: boolean;
  enable: () => Promise<void>;
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
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [label, setLabel] = useState("biometria");

  const syncFromStorage = useCallback(async () => {
    const available = await isPlatformAuthenticatorAvailable();
    setSupported(available);
    setLabel(biometricLabel());

    const config = readAppLockConfig();
    const {
      data: { user },
    } = await createClient().auth.getUser();

    if (
      config.enabled &&
      config.credentialId &&
      user &&
      config.userId === user.id
    ) {
      setEnabled(true);
      if (!isAppLockUnlocked()) setLocked(true);
      else setLocked(false);
    } else {
      if (config.enabled && config.userId && user && config.userId !== user.id) {
        clearAppLockConfig();
      }
      setEnabled(false);
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
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [enabled]);

  const enable = useCallback(async () => {
    setEnabling(true);
    try {
      const available = await isPlatformAuthenticatorAvailable();
      if (!available) {
        throw new Error(
          "Questo dispositivo non supporta Face ID / biometria nel browser"
        );
      }
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const credentialId = await registerAppLockCredential({
        userId: user.id,
        userName: user.email ?? user.id,
      });
      writeAppLockConfig({
        enabled: true,
        credentialId,
        userId: user.id,
      });
      setAppLockUnlocked(true);
      setEnabled(true);
      setLocked(false);
      toast.success(`Sblocco con ${biometricLabel()} attivato`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attivazione non riuscita");
      throw e;
    } finally {
      setEnabling(false);
    }
  }, []);

  const disable = useCallback(() => {
    clearAppLockConfig();
    setEnabled(false);
    setLocked(false);
    toast.success("Sblocco biometrico disattivato");
  }, []);

  const lockNow = useCallback(() => {
    if (!enabled) return;
    setAppLockUnlocked(false);
    setLocked(true);
  }, [enabled]);

  const unlock = useCallback(async () => {
    const config = readAppLockConfig();
    if (!config.credentialId) {
      clearAppLockConfig();
      setEnabled(false);
      setLocked(false);
      return;
    }
    setUnlocking(true);
    try {
      await verifyAppLockCredential(config.credentialId);
      setAppLockUnlocked(true);
      setLocked(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sblocco non riuscito");
    } finally {
      setUnlocking(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !locked || !enabled) return;
    const t = window.setTimeout(() => {
      void unlock();
    }, 350);
    return () => window.clearTimeout(t);
  }, [ready, locked, enabled, unlock]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      supported,
      enabled,
      label,
      enabling,
      enable,
      disable,
      lockNow,
    }),
    [supported, enabled, label, enabling, enable, disable, lockNow]
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
              Sblocca con {label} per continuare
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button
              className="min-h-touch w-full"
              disabled={unlocking}
              onClick={() => void unlock()}
            >
              {unlocking ? "Verifica…" : `Sblocca con ${label}`}
            </Button>
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
