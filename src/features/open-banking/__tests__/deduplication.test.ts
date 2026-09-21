import { describe, expect, it } from "vitest";
import {
  addManualOverrides,
  decideDedup,
  mergeWithManualOverrides,
} from "../deduplication";
import type { NormalizedBankTransaction } from "../types";

const incoming: NormalizedBankTransaction = {
  provider: "gocardless",
  providerTransactionId: "p-1",
  fingerprint: "fp-1",
  amount: 20,
  currency: "EUR",
  type: "expense",
  date: "2026-03-01",
  description: "Nuova descr",
  merchant: "Nuovo merchant",
  notes: null,
  bookingStatus: "booked",
  raw: {},
};

describe("decideDedup", () => {
  it("skips when provider_transaction_id matches and no field changes", () => {
    const existing = {
      id: "e1",
      provider: "gocardless",
      provider_transaction_id: "p-1",
      fingerprint: "fp-old",
      category_id: null,
      description: "Nuova descr",
      merchant: "Nuovo merchant",
      notes: null,
      manual_override_fields: [],
    };
    const decision = decideDedup(
      incoming,
      new Map([["p-1", existing]]),
      new Map()
    );
    // description/merchant same → empty patch → skip
    expect(decision.action).toBe("skip");
  });

  it("updates non-overridden fields on provider id match", () => {
    const existing = {
      id: "e1",
      provider: "gocardless",
      provider_transaction_id: "p-1",
      fingerprint: "fp-old",
      category_id: "cat-1",
      description: "Vecchia",
      merchant: "Old",
      notes: "nota utente",
      manual_override_fields: ["notes", "category_id"],
    };
    const decision = decideDedup(
      incoming,
      new Map([["p-1", existing]]),
      new Map()
    );
    expect(decision.action).toBe("update");
    if (decision.action === "update") {
      expect(decision.fields.description).toBe("Nuova descr");
      expect(decision.fields.merchant).toBe("Nuovo merchant");
      expect(decision.fields).not.toHaveProperty("notes");
      expect(decision.fields).not.toHaveProperty("category_id");
    }
  });

  it("falls back to fingerprint when no provider id", () => {
    const noId = { ...incoming, providerTransactionId: null };
    const existing = {
      id: "e2",
      provider: "gocardless",
      provider_transaction_id: null,
      fingerprint: "fp-1",
      category_id: null,
      description: "Vecchia",
      merchant: null,
      notes: null,
      manual_override_fields: [],
    };
    const decision = decideDedup(noId, new Map(), new Map([["fp-1", existing]]));
    expect(decision.action).toBe("update");
  });

  it("inserts when unknown", () => {
    expect(decideDedup(incoming, new Map(), new Map()).action).toBe("insert");
  });

  it("promotes a matching pending row when booked arrives", () => {
    const pending = {
      id: "pend-1",
      provider: "enablebanking",
      provider_transaction_id: null,
      fingerprint: "fp-pending",
      category_id: "cat-kept",
      description: "Esselunga Milano",
      merchant: "Esselunga",
      notes: null,
      amount: 42.5,
      date: "2026-03-01",
      type: "expense",
      booking_status: "pending" as const,
      manual_override_fields: ["category_id"],
    };
    const booked: NormalizedBankTransaction = {
      ...incoming,
      provider: "enablebanking",
      providerTransactionId: "book-99",
      fingerprint: "fp-booked",
      amount: 42.5,
      date: "2026-03-02",
      description: "Esselunga Milano",
      merchant: "Esselunga",
      bookingStatus: "booked",
    };
    const decision = decideDedup(
      booked,
      new Map(),
      new Map(),
      [pending]
    );
    expect(decision.action).toBe("promote");
    if (decision.action === "promote") {
      expect(decision.existingId).toBe("pend-1");
      expect(decision.fields.booking_status).toBe("booked");
      expect(decision.fields.provider_transaction_id).toBe("book-99");
      expect(decision.fields.date).toBe("2026-03-02");
    }
  });

  it("skips pending when the same provider id is already booked", () => {
    const bookedExisting = {
      id: "e-booked",
      provider: "enablebanking",
      provider_transaction_id: "same-id",
      fingerprint: "fp",
      category_id: null,
      description: "X",
      merchant: null,
      notes: null,
      booking_status: "booked" as const,
      manual_override_fields: [],
    };
    const pendingIncoming: NormalizedBankTransaction = {
      ...incoming,
      providerTransactionId: "same-id",
      bookingStatus: "pending",
    };
    const decision = decideDedup(
      pendingIncoming,
      new Map([["same-id", bookedExisting]]),
      new Map()
    );
    expect(decision.action).toBe("skip");
  });
});

describe("mergeWithManualOverrides", () => {
  it("preserves overridden description", () => {
    const patch = mergeWithManualOverrides(
      {
        id: "e1",
        provider: "gocardless",
        provider_transaction_id: "p-1",
        fingerprint: "fp",
        category_id: null,
        description: "Manuale",
        merchant: "M",
        notes: null,
        manual_override_fields: ["description"],
      },
      incoming
    );
    expect(patch).not.toHaveProperty("description");
    expect(patch.merchant).toBe("Nuovo merchant");
  });
});

describe("addManualOverrides", () => {
  it("unions fields", () => {
    expect(addManualOverrides(["notes"], ["description", "notes"])).toEqual([
      "notes",
      "description",
    ]);
  });
});
