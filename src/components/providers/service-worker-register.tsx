"use client";

import { useEffect } from "react";

/** Registers the free static service worker (no paid push / no next-pwa plugin). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "development") return;

    void navigator.serviceWorker.register("/moneyflow-sw.js").catch(() => {
      // Silent — installability still works via manifest without SW.
    });
  }, []);

  return null;
}
