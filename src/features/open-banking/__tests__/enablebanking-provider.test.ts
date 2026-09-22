import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenBankingConfigError } from "../errors";
import {
  clearEnableBankingKeyCache,
  createEnableBankingJwt,
  decodeInstitutionId,
  encodeInstitutionId,
  EnableBankingProvider,
  parseEbAmount,
} from "../enablebanking-provider";

/** Deterministic PKCS8 RSA key for unit tests only (not a real secret). */
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC2XoebPW5yMX6Z
HoRsXqZBc3cyGYHUdykAOgg4Wo4uZC2gmXfHR5SMAzr5deuJ2YuYsymE39syrQlg
2NCxpRLx+4JYOpRMju1qA9jmsk+2nmpyKtk5WpI95Zjs882y7Wt12Bn29EVTQsyv
5zz+KbijeEnvfuK6i0t6O4aXWsVqrhpG3U7qtevIPs3y0rNRQA9ocwD856eoDVtx
NAusZSXcjiIbu8DEVyWM7pjEPSWzY7s76FlDrci6cXzk20JgSXe6RXrHq1ROL971
gdbNUrOaHOBQO2s1qH3kLikfQId7sanfhDGKnMOg31zlx9z/OmQl4FKNCVOuDcmD
BcoVXSL1AgMBAAECggEAE3OjPq9vfZ4iXPYolT+GN7J3awBV/QHFvYizEkG0ayXT
yQ69fCO6KDH7AxstB5vM3Dl16v6OjInw12Pg5KXRDr7vIPaElWLkV1u4Makgv/+H
JozD9S5gLVp1NIbvsI9K2Du3z0OwNkiIeRWux4RPNZ5xsmokCFYts4iwWyn7Jxzj
JXYqHBqqyFfyYHk6f6mI7NgHiNbZara0wrtdJJ9gvMFzOc7fpYKAhWRThZpLMx0R
VGL62GX8ABXFGUAOwvk3xjSO44parcR4qy4dxqh9AN56xZ4wprwwXdMRgHPvenUQ
d8mkmSKHgfoCoaUITSEgDoORVEyxOGdrCrcb1UqxkQKBgQDpTU6cHFExN/VA8yGM
uuZ4cF7Ltt8YQ93rGxXjvbJG+KwAP/PIWo7KZcYAFDVoje0HwMyWuvmeSzaWXavC
EZtKOQK7GaPItFCEg6rYp2LINa1gAFQ5uKe41GKt9btqDRc1xD+biwCfeV5xiPAJ
ct2tW2i8/e+6HShJkmaYfvgNkQKBgQDIHK0VVD0EEIDTA8DTfrfVmQ31ktpvFoqO
buNotXda7OwVyC86nyeHCijBV1QKL16RqWf7I3CXh7rQ4isUH58NgkYkXEUnj/qa
TK0Iwja5GxTYq1nIwpBj3YFmeEBZhjR2eV1+TYBNjkZPdIzTWZ/dFW2/Z6zW82o4
sfuZeH3dJQKBgD74X8RhHEUVnnvWY/LRK43MfrmrdVHeV5Kyr9jVhb4ENqCmok0s
rCfTCntQ+Q1saVLTZiU0+FUSZfx18fsit3B0LNmFVSDCEo2B4GYz38S8QDyOOi2O
Oq73nF7p2ZkJSX94pdZ80UE6CBTK6kcSmuTErGN+gusQHaSmAE0e0CMRAoGANgJH
VLJfpXEu08T3jh1tUGD2u4jfG4xh6P9UsTYI+KlpLpfQ52l9KZ08UrJXJEiUpYur
XMS75qnjae0g41WFgAfhFn8wyvS5FlwLd4mza1I71h6pJN4eSlXGTvm1pHPsRO2M
pkIUltoHb/ps574Qv4LBFB/PLlSUHqkq1skGb2ECgYBsbbQZtZfekr/Sn3eXlCUN
BxRTSHgoNQXSzWqVakkizp3QzVZjjyMmiM1VUBNwSwDuycxVsHFA8+a1Vw/fXvGh
jrlnfGCuYR5mSzuV1qdhJhxONaF+vuxslf2AiZ8ZIkVQ8yImzaL2xiFnIrCYGWrx
JgElCfenTbUewr1QHEkFDQ==
-----END PRIVATE KEY-----`;

describe("Enable Banking institution id encode/decode", () => {
  it("round-trips country::name", () => {
    const id = encodeInstitutionId("it", "Intesa Sanpaolo");
    expect(id).toBe("IT::Intesa Sanpaolo");
    expect(decodeInstitutionId(id)).toEqual({
      country: "IT",
      name: "Intesa Sanpaolo",
    });
  });

  it("rejects malformed ids", () => {
    expect(() => decodeInstitutionId("no-separator")).toThrow(
      OpenBankingConfigError
    );
    expect(() => decodeInstitutionId("::name")).toThrow(OpenBankingConfigError);
  });
});

describe("Enable Banking JWT config", () => {
  afterEach(() => {
    clearEnableBankingKeyCache();
    delete process.env.ENABLEBANKING_APPLICATION_ID;
    delete process.env.ENABLEBANKING_PRIVATE_KEY;
  });

  it("throws OpenBankingConfigError when credentials are missing", async () => {
    delete process.env.ENABLEBANKING_APPLICATION_ID;
    delete process.env.ENABLEBANKING_PRIVATE_KEY;
    await expect(createEnableBankingJwt()).rejects.toThrow(OpenBankingConfigError);
    await expect(createEnableBankingJwt()).rejects.toThrow(/ENABLEBANKING/);
  });

  it("signs a JWT when application id + private key are set", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;
    const jwt = await createEnableBankingJwt();
    expect(jwt.split(".")).toHaveLength(3);
  });
});

describe("parseEbAmount", () => {
  it("parses plain and European decimal formats", () => {
    expect(parseEbAmount("10.00")).toBe(10);
    expect(parseEbAmount("12,50")).toBe(12.5);
    expect(parseEbAmount("1.234,56")).toBe(1234.56);
    expect(parseEbAmount(-42)).toBe(-42);
    expect(Number.isNaN(parseEbAmount(""))).toBe(true);
  });
});

describe("Enable Banking booked + pending transactions", () => {
  afterEach(() => {
    clearEnableBankingKeyCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ENABLEBANKING_APPLICATION_ID;
    delete process.env.ENABLEBANKING_PRIVATE_KEY;
  });

  it("keeps booked rows and fetches pending via dedicated PDNG call", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      _ms?: number,
      ...args: unknown[]
    ) => {
      if (typeof handler === "function") handler(...(args as never[]));
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/accounts/acc-1/transactions");
      if (url.includes("transaction_status=PDNG")) {
        return new Response(
          JSON.stringify({
            transactions: [
              {
                entry_reference: "p2",
                status: "PDNG",
                value_date: "2026-03-03",
                credit_debit_indicator: "DBIT",
                transaction_amount: { amount: "5.00", currency: "EUR" },
                remittance_information: ["Pending dedicated"],
              },
            ],
          }),
          { status: 200 }
        );
      }
      expect(url).not.toContain("transaction_status=");
      return new Response(
        JSON.stringify({
          transactions: [
            {
              entry_reference: "b1",
              status: "BOOK",
              booking_date: "2026-03-01",
              credit_debit_indicator: "DBIT",
              transaction_amount: { amount: "10.00", currency: "EUR" },
              remittance_information: ["Booked"],
            },
            {
              entry_reference: "b2",
              status: "BOOKED",
              booking_date: "2026-03-01",
              credit_debit_indicator: "CRDT",
              transaction_amount: { amount: "12,50", currency: "EUR" },
              remittance_information: ["Booked EU amount"],
            },
            {
              entry_reference: "p1",
              status: "PDNG",
              value_date: "2026-03-02",
              credit_debit_indicator: "DBIT",
              transaction_amount: { amount: "10.00", currency: "EUR" },
              remittance_information: ["Pending"],
            },
            {
              entry_reference: "i1",
              status: "INFO",
              value_date: "2026-03-02",
              credit_debit_indicator: "DBIT",
              transaction_amount: { amount: "1.00", currency: "EUR" },
              remittance_information: ["Info only"],
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new EnableBankingProvider();
    const txs = await provider.getTransactions({ accountId: "acc-1" });
    expect(txs).toHaveLength(4);
    expect(txs[0].id).toBe("b1");
    expect(txs[0].bookingStatus).toBe("booked");
    expect(txs[2].id).toBe("p1");
    expect(txs[2].bookingStatus).toBe("pending");
    expect(txs[3].id).toBe("p2");
    expect(txs[3].bookingStatus).toBe("pending");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("transaction_status=PDNG"))).toBe(
      true
    );
    const pdngUrl = String(
      fetchMock.mock.calls.find((c) => String(c[0]).includes("transaction_status=PDNG"))?.[0]
    );
    expect(pdngUrl).not.toContain("date_from=");
    expect(pdngUrl).not.toContain("date_to=");
  });

  it("parses European balance amounts via getBalances", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          balances: [
            {
              balance_type: "closingBooked",
              balance_amount: { amount: "1.234,56", currency: "EUR" },
            },
            {
              balance_type: "interimAvailable",
              balance_amount: { amount: "1.200,00", currency: "EUR" },
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new EnableBankingProvider();
    const balances = await provider.getBalances("acc-1");
    expect(balances).toEqual([
      {
        amount: 1234.56,
        currency: "EUR",
        type: "closingBooked",
        referenceDate: null,
      },
      {
        amount: 1200,
        currency: "EUR",
        type: "interimAvailable",
        referenceDate: null,
      },
    ]);
  });

  it("keeps first page when continuation page returns 422", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      _ms?: number,
      ...args: unknown[]
    ) => {
      if (typeof handler === "function") handler(...(args as never[]));
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    let calls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls += 1;
      const url = String(input);
      if (calls === 1) {
        expect(url).not.toContain("transaction_status=");
        expect(url).not.toContain("continuation_key=");
        return new Response(
          JSON.stringify({
            transactions: [
              {
                entry_reference: "b1",
                status: "BOOK",
                booking_date: "2026-03-01",
                credit_debit_indicator: "DBIT",
                transaction_amount: { amount: "10.00", currency: "EUR" },
              },
            ],
            continuation_key: "page-2",
          }),
          { status: 200 }
        );
      }
      expect(url).toContain("continuation_key=page-2");
      expect(url).not.toContain("transaction_status=");
      return new Response(
        JSON.stringify({
          code: 422,
          error: "WRONG_REQUEST_PARAMETERS",
          message: "dateFrom mismatch",
        }),
        { status: 422 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new EnableBankingProvider();
    const { IncompleteTransactionsError } = await import("../errors");
    await expect(
      provider.getTransactions({
        accountId: "acc-1",
        dateFrom: "2026-01-01",
      })
    ).rejects.toMatchObject({
      name: "IncompleteTransactionsError",
      transactions: [expect.objectContaining({ id: "b1" })],
    });
    expect(IncompleteTransactionsError).toBeDefined();
  });

  it("maps session accounts from UUID strings or objects", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          session_id: "sess-1",
          accounts: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
          aspsp: { name: "Intesa Sanpaolo", country: "IT" },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new EnableBankingProvider();
    const connection = await provider.getConnection("sess-1");
    expect(connection.accounts).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ]);
  });
});

describe("Enable Banking rate-limit retries", () => {
  afterEach(() => {
    clearEnableBankingKeyCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ENABLEBANKING_APPLICATION_ID;
    delete process.env.ENABLEBANKING_PRIVATE_KEY;
  });

  it("does not retry on ASPSP rate limit (protects daily multiplicity)", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          error: "ASPSP_RATE_LIMIT_EXCEEDED",
          message: "The access on the account has been exceeding the consented multiplicity per day.",
        }),
        { status: 429 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { RATE_LIMIT_DAILY_MESSAGE } = await import("../errors");
    const provider = new EnableBankingProvider();
    await expect(provider.getBalances("acc-1")).rejects.toMatchObject({
      name: "OpenBankingProviderError",
      status: 429,
      message: RATE_LIMIT_DAILY_MESSAGE,
    });
    expect(calls).toBe(1);
  });

  it("returns partial txs with Italian rate-limit message on 429 mid-pagination", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      _ms?: number,
      ...args: unknown[]
    ) => {
      if (typeof handler === "function") handler(...(args as never[]));
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);

    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            transactions: [
              {
                entry_reference: "b1",
                status: "BOOK",
                booking_date: "2026-03-01",
                credit_debit_indicator: "CRDT",
                transaction_amount: { amount: "5.00", currency: "EUR" },
              },
            ],
            continuation_key: "page-2",
          }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ error: "ASPSP_RATE_LIMIT_EXCEEDED" }),
        { status: 429 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { RATE_LIMIT_PARTIAL_MESSAGE } = await import("../enablebanking-provider");
    const provider = new EnableBankingProvider();
    await expect(
      provider.getTransactions({ accountId: "acc-1", dateFrom: "2026-01-01" })
    ).rejects.toMatchObject({
      name: "IncompleteTransactionsError",
      message: RATE_LIMIT_PARTIAL_MESSAGE,
      transactions: [expect.objectContaining({ id: "b1" })],
    });
  });
});
