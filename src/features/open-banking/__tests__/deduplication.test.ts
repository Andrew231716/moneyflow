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
