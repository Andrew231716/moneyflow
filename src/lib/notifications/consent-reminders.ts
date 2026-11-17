const PERMISSION_KEY = "mf-consent-notify-permission";
const LAST_SHOWN_KEY = "mf-consent-notify-last";

export function getConsentNotifyPreference(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestConsentNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  const result = await Notification.requestPermission();
  try {
    localStorage.setItem(PERMISSION_KEY, result);
  } catch {
    /* ignore */
  }
  return result;
}

/** Show at most one consent notification per calendar day. */
export function maybeNotifyConsentExpiry(params: {
  institutionName: string;
  expired: boolean;
  daysLeft: number | null;
}): boolean {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(LAST_SHOWN_KEY) === today) return false;
  } catch {
    /* ignore */
  }

  const title = params.expired
    ? `Consenso scaduto · ${params.institutionName}`
    : `Consenso in scadenza · ${params.institutionName}`;
  const body = params.expired
    ? "Ricollega la banca per continuare la sincronizzazione."
    : `Scade tra ${params.daysLeft ?? "pochi"} giorni. Apri MoneyFlow per rinnovarlo.`;

  try {
    const n = new Notification(title, {
      body,
      icon: "/icons/icon-192.png",
      tag: "mf-consent-reminder",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    localStorage.setItem(LAST_SHOWN_KEY, today);
    return true;
  } catch {
    return false;
  }
}
