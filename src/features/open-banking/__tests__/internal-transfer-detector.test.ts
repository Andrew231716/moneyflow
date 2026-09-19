import { describe, expect, it } from "vitest";
import { detectInternalTransfers } from "../internal-transfer-detector";

describe("detectInternalTransfers", () => {
  it("suggests opposite legs with same amount within ±1 day", () => {
    const suggestions = detectInternalTransfers([
      {
        id: "a",
        amount: 100,
        currency: "EUR",
        date: "2026-03-01",
        type: "expense",
        account_id: "acc-1",
      },
      {
        id: "b",
        amount: 100,
        currency: "EUR",
        date: "2026-03-02",
        type: "income",
        account_id: "acc-2",
      },
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].transactionId).toBe("a");
    expect(suggestions[0].matchedTransactionId).toBe("b");
  });

  it("does not match same account or same direction", () => {
    expect(
      detectInternalTransfers([
        {
          id: "a",
          amount: 50,
          currency: "EUR",
          date: "2026-03-01",
          type: "expense",
          account_id: "acc-1",
        },
        {
          id: "b",
          amount: 50,
          currency: "EUR",
          date: "2026-03-01",
          type: "expense",
          account_id: "acc-2",
        },
      ])
    ).toHaveLength(0);

    expect(
      detectInternalTransfers([
        {
          id: "a",
          amount: 50,
          currency: "EUR",
          date: "2026-03-01",
          type: "expense",
          account_id: "acc-1",
        },
        {
          id: "b",
          amount: 50,
          currency: "EUR",
          date: "2026-03-01",
          type: "income",
          account_id: "acc-1",
        },
      ])
    ).toHaveLength(0);
  });

  it("ignores pairs beyond 1 day", () => {
    expect(
      detectInternalTransfers([
        {
          id: "a",
          amount: 100,
          currency: "EUR",
          date: "2026-03-01",
          type: "expense",
          account_id: "acc-1",
        },
        {
          id: "b",
          amount: 100,
          currency: "EUR",
          date: "2026-03-05",
          type: "income",
          account_id: "acc-2",
        },
      ])
    ).toHaveLength(0);
  });
});
