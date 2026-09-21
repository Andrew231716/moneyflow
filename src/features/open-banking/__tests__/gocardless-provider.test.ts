import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GoCardlessProvider,
  clearTokenCache,
} from "../gocardless-provider";

describe("GoCardlessProvider transactions & auth", () => {
  afterEach(() => {
    clearTokenCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GOCARDLESS_SECRET_ID;
    delete process.env.GOCARDLESS_SECRET_KEY;
  });

  it("returns booked and pending with bookingStatus", async () => {
    process.env.GOCARDLESS_SECRET_ID = "sid";
    process.env.GOCARDLESS_SECRET_KEY = "skey";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token/new/")) {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            access: "access-token",
            access_expires: 86400,
            refresh: "refresh-token",
            refresh_expires: 2592000,
          }),
          { status: 200 }
        );
      }
      if (url.includes("/transactions/")) {
        return new Response(
          JSON.stringify({
            transactions: {
              booked: [
                {
                  transactionId: "b1",
                  bookingDate: "2026-03-01",
                  transactionAmount: { amount: "-10.00", currency: "EUR" },
                  remittanceInformationUnstructured: "Booked",
                },
              ],
              pending: [
                {
                  transactionId: "p1",
                  valueDate: "2026-03-02",
                  transactionAmount: { amount: "-10.00", currency: "EUR" },
                  remittanceInformationUnstructured: "Pending",
                },
              ],
            },
          }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoCardlessProvider();
    const txs = await provider.getTransactions({ accountId: "acc-1" });
    expect(txs).toHaveLength(2);
    expect(txs[0].id).toBe("b1");
    expect(txs[0].bookingStatus).toBe("booked");
    expect(txs[0].description).toBe("Booked");
    expect(txs[1].id).toBe("p1");
    expect(txs[1].bookingStatus).toBe("pending");
  });

  it("uses /token/new/ then /token/refresh/ per current Bank Account Data docs", async () => {
    process.env.GOCARDLESS_SECRET_ID = "sid";
    process.env.GOCARDLESS_SECRET_KEY = "skey";

    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/token/new/")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({ secret_id: "sid", secret_key: "skey" });
        return new Response(
          JSON.stringify({
            access: "a1",
            access_expires: 1,
            refresh: "r1",
            refresh_expires: 2592000,
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/token/refresh/")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({ refresh: "r1" });
        // Current docs: refresh returns access + access_expires only
        return new Response(
          JSON.stringify({ access: "a2", access_expires: 86400 }),
          { status: 200 }
        );
      }
      if (url.includes("/institutions/")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoCardlessProvider();
    await provider.getInstitutions("IT");
    // Force access expiry and refresh path
    await provider.getInstitutions("IT");

    expect(calls.some((c) => c.endsWith("/token/new/"))).toBe(true);
    expect(calls.some((c) => c.endsWith("/token/refresh/"))).toBe(true);
  });

  it("propagates provider timeouts via request AbortSignal", async () => {
    process.env.GOCARDLESS_SECRET_ID = "sid";
    process.env.GOCARDLESS_SECRET_KEY = "skey";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/token/new/")) {
        return new Response(
          JSON.stringify({
            access: "a1",
            access_expires: 86400,
            refresh: "r1",
            refresh_expires: 2592000,
          }),
          { status: 200 }
        );
      }
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const realSetTimeout = global.setTimeout.bind(global);
    vi.spyOn(global, "setTimeout").mockImplementation((
      ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        // Fire the 15s provider timeout immediately; keep other timers real.
        if (typeof fn === "function" && ms === 15_000) {
          queueMicrotask(() => {
            (fn as (...a: unknown[]) => void)(...args);
          });
          return realSetTimeout(() => undefined, 0);
        }
        return realSetTimeout(fn as never, ms as never, ...(args as never[]));
      }) as unknown as typeof setTimeout
    ));

    const provider = new GoCardlessProvider();
    await expect(provider.getInstitutions("IT")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });
});
