import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_LOCK_BACKGROUND_MS,
  base64UrlToBuffer,
  bufferToBase64Url,
  clearAppLockConfig,
  isAppLockUnlocked,
  isValidPin,
  markAppHidden,
  readAppLockConfig,
  setAppLockUnlocked,
  shouldRelockAfterBackground,
  writeAppLockConfig,
} from "./app-lock";

function installMemoryStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
}

describe("app-lock helpers", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips base64url buffers", () => {
    const bytes = new Uint8Array([1, 2, 250, 255, 0, 42]);
    const encoded = bufferToBase64Url(bytes.buffer);
    expect(encoded).not.toMatch(/[+/=]/);
    const decoded = new Uint8Array(base64UrlToBuffer(encoded));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("persists and clears lock config", () => {
    writeAppLockConfig({
      enabled: true,
      credentialId: "cred-1",
      userId: "user-1",
    });
    expect(readAppLockConfig()).toEqual({
      enabled: true,
      credentialId: "cred-1",
      userId: "user-1",
      hasPin: false,
      hasBiometric: true,
    });
    setAppLockUnlocked(true);
    expect(isAppLockUnlocked()).toBe(true);
    clearAppLockConfig();
    expect(readAppLockConfig()).toEqual({
      enabled: false,
      credentialId: null,
      userId: null,
      hasPin: false,
      hasBiometric: false,
    });
    expect(isAppLockUnlocked()).toBe(false);
  });

  it("validates PIN shape", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12")).toBe(false);
    expect(isValidPin("abcdef")).toBe(false);
  });

  it("relocks after background threshold", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    markAppHidden();
    expect(shouldRelockAfterBackground(Date.now(), APP_LOCK_BACKGROUND_MS)).toBe(
      false
    );

    markAppHidden();
    vi.setSystemTime(new Date("2026-11-02T12:00:31Z"));
    expect(shouldRelockAfterBackground(Date.now(), APP_LOCK_BACKGROUND_MS)).toBe(
      true
    );
    expect(shouldRelockAfterBackground(Date.now(), APP_LOCK_BACKGROUND_MS)).toBe(
      false
    );
    vi.useRealTimers();
  });
});
