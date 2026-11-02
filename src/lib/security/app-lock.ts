const ENABLED_KEY = "moneyflow.appLock.enabled";
const CREDENTIAL_KEY = "moneyflow.appLock.credentialId";
const USER_KEY = "moneyflow.appLock.userId";
const UNLOCKED_KEY = "moneyflow.appLock.unlocked";
const HIDDEN_AT_KEY = "moneyflow.appLock.hiddenAt";

/** Re-lock after the tab/app was in background this long (ms). */
export const APP_LOCK_BACKGROUND_MS = 30_000;

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function randomChallenge(size = 32): ArrayBuffer {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes.buffer;
}

export type AppLockConfig = {
  enabled: boolean;
  credentialId: string | null;
  userId: string | null;
};

export function readAppLockConfig(): AppLockConfig {
  if (typeof localStorage === "undefined") {
    return { enabled: false, credentialId: null, userId: null };
  }
  return {
    enabled: localStorage.getItem(ENABLED_KEY) === "1",
    credentialId: localStorage.getItem(CREDENTIAL_KEY),
    userId: localStorage.getItem(USER_KEY),
  };
}

export function writeAppLockConfig(config: {
  enabled: boolean;
  credentialId: string;
  userId: string;
}) {
  localStorage.setItem(ENABLED_KEY, config.enabled ? "1" : "0");
  localStorage.setItem(CREDENTIAL_KEY, config.credentialId);
  localStorage.setItem(USER_KEY, config.userId);
}

export function clearAppLockConfig() {
  localStorage.removeItem(ENABLED_KEY);
  localStorage.removeItem(CREDENTIAL_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(UNLOCKED_KEY);
  sessionStorage.removeItem(HIDDEN_AT_KEY);
}

export function isAppLockUnlocked(): boolean {
  if (typeof sessionStorage === "undefined") return true;
  return sessionStorage.getItem(UNLOCKED_KEY) === "1";
}

export function setAppLockUnlocked(unlocked: boolean) {
  if (unlocked) sessionStorage.setItem(UNLOCKED_KEY, "1");
  else sessionStorage.removeItem(UNLOCKED_KEY);
}

export function markAppHidden() {
  sessionStorage.setItem(HIDDEN_AT_KEY, String(Date.now()));
}

export function shouldRelockAfterBackground(
  now = Date.now(),
  thresholdMs = APP_LOCK_BACKGROUND_MS
): boolean {
  const raw = sessionStorage.getItem(HIDDEN_AT_KEY);
  if (!raw) return false;
  const hiddenAt = Number(raw);
  sessionStorage.removeItem(HIDDEN_AT_KEY);
  if (!Number.isFinite(hiddenAt)) return false;
  return now - hiddenAt >= thresholdMs;
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    if (
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
      "function"
    ) {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    return false;
  }
  return false;
}

export function biometricLabel(): string {
  if (typeof navigator === "undefined") return "biometria";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Macintosh/.test(ua)) return "Face ID / Touch ID";
  if (/Android/.test(ua)) return "impronta o sblocco schermo";
  if (/Windows/.test(ua)) return "Windows Hello";
  return "biometria del dispositivo";
}

export async function registerAppLockCredential(params: {
  userId: string;
  userName: string;
}): Promise<string> {
  if (!window.PublicKeyCredential) {
    throw new Error("Questo browser non supporta lo sblocco biometrico");
  }

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: {
        name: "MoneyFlow",
        id: window.location.hostname,
      },
      user: {
        id: new TextEncoder().encode(params.userId),
        name: params.userName,
        displayName: params.userName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Registrazione biometrica annullata");
  return bufferToBase64Url(credential.rawId);
}

export async function verifyAppLockCredential(credentialId: string): Promise<void> {
  if (!window.PublicKeyCredential) {
    throw new Error("Questo browser non supporta lo sblocco biometrico");
  }

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [
        {
          type: "public-key",
          id: base64UrlToBuffer(credentialId),
          transports: ["internal"],
        },
      ],
      userVerification: "required",
      timeout: 60_000,
    },
  });

  if (!assertion) throw new Error("Sblocco annullato");
}
