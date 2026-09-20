import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenBankingConfigError } from "../errors";
import {
  clearEnableBankingKeyCache,
  createEnableBankingJwt,
  decodeInstitutionId,
  encodeInstitutionId,
  EnableBankingProvider,
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

describe("Enable Banking booked-only transactions", () => {
  afterEach(() => {
    clearEnableBankingKeyCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ENABLEBANKING_APPLICATION_ID;
    delete process.env.ENABLEBANKING_PRIVATE_KEY;
  });

  it("requests BOOK status and drops non-booked rows", async () => {
    process.env.ENABLEBANKING_APPLICATION_ID = "app-test-id";
    process.env.ENABLEBANKING_PRIVATE_KEY = TEST_PRIVATE_KEY;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("transaction_status=BOOK");
      expect(url).toContain("/accounts/acc-1/transactions");
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
              entry_reference: "p1",
              status: "PDNG",
              value_date: "2026-03-02",
              credit_debit_indicator: "DBIT",
              transaction_amount: { amount: "10.00", currency: "EUR" },
              remittance_information: ["Pending"],
            },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new EnableBankingProvider();
    const txs = await provider.getTransactions({ accountId: "acc-1" });
    expect(txs).toHaveLength(1);
    expect(txs[0].id).toBe("b1");
    expect(txs[0].description).toBe("Booked");
    expect(txs[0].amount).toBe(-10);
  });
});
