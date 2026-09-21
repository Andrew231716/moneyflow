import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeTransactionFingerprint,
  normalizeProviderTransaction,
} from "../normalizer";
import type { ProviderTransaction } from "../types";

describe("normalizeProviderTransaction", () => {
  it("maps negative amounts to expense and builds fingerprint", () => {
    const tx: ProviderTransaction = {
      id: "tx-1",
      amount: -42.5,
      currency: "eur",
      bookingDate: "2026-03-01",
      description: "Esselunga Milano",
      merchantName: "Esselunga",
    };

    const n = normalizeProviderTransaction(tx, {
      provider: "gocardless",
      accountKey: "acc-1",
    });

    expect(n.type).toBe("expense");
    expect(n.amount).toBe(42.5);
    expect(n.currency).toBe("EUR");
    expect(n.providerTransactionId).toBe("tx-1");
    expect(n.merchant).toBe("Esselunga");
    expect(n.fingerprint).toHaveLength(64);
    expect(n.bookingStatus).toBe("booked");
  });

  it("maps pending booking status", () => {
    const tx: ProviderTransaction = {
      amount: -10,
      currency: "EUR",
      valueDate: "2026-03-02",
      description: "Pending card",
      bookingStatus: "pending",
    };
    const n = normalizeProviderTransaction(tx, {
      provider: "enablebanking",
      accountKey: "acc-1",
    });
    expect(n.bookingStatus).toBe("pending");
    expect(n.type).toBe("expense");
  });

  it("maps positive amounts to income", () => {
    const tx: ProviderTransaction = {
      amount: 1500,
      currency: "EUR",
      valueDate: "2026-03-02",
      remittanceInformation: "Stipendio",
    };
    const n = normalizeProviderTransaction(tx, {
      provider: "gocardless",
      accountKey: "acc-1",
    });
    expect(n.type).toBe("income");
    expect(n.providerTransactionId).toBeNull();
    expect(n.description).toBe("Stipendio");
  });
});

describe("computeTransactionFingerprint", () => {
  it("is stable for same economic event", () => {
    const a = computeTransactionFingerprint({
      accountKey: "a1",
      date: "2026-01-01",
      amount: 10,
      currency: "EUR",
      description: "Coffee Shop",
      merchant: "Coffee",
    });
    const b = computeTransactionFingerprint({
      accountKey: "a1",
      date: "2026-01-01",
      amount: 10,
      currency: "eur",
      description: "  Coffee   Shop ",
      merchant: "Coffee",
    });
    expect(a).toBe(b);
    expect(a).toBe(
      createHash("sha256")
        .update("a1|2026-01-01|10.00|EUR|coffee shop|coffee")
        .digest("hex")
    );
  });

  it("differs when amount or date changes", () => {
    const base = {
      accountKey: "a1",
      date: "2026-01-01",
      amount: 10,
      currency: "EUR",
      description: "X",
    };
    expect(computeTransactionFingerprint(base)).not.toBe(
      computeTransactionFingerprint({ ...base, amount: 11 })
    );
    expect(computeTransactionFingerprint(base)).not.toBe(
      computeTransactionFingerprint({ ...base, date: "2026-01-02" })
    );
  });
});
