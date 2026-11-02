import { describe, expect, it } from "vitest";
import {
  groupBalancesByCurrency,
  primaryCurrencyTotal,
} from "./currency";
import type { Account } from "@/types/database";

function account(partial: Partial<Account> & Pick<Account, "balance" | "currency">): Account {
  return {
    id: partial.id ?? "1",
    user_id: "u",
    name: partial.name ?? "A",
    type: partial.type ?? "bank",
    balance: partial.balance,
    currency: partial.currency,
    color: "#000",
    icon: "wallet",
    is_archived: partial.is_archived ?? false,
    created_at: "",
    updated_at: "",
  };
}

describe("currency grouping", () => {
  it("keeps currencies separate and prefers EUR as primary", () => {
    const accounts = [
      account({ balance: 100, currency: "EUR" }),
      account({ id: "2", balance: 50, currency: "USD" }),
      account({ id: "3", balance: 20, currency: "eur" }),
    ];
    expect(groupBalancesByCurrency(accounts)).toEqual([
      { currency: "EUR", total: 120, count: 2 },
      { currency: "USD", total: 50, count: 1 },
    ]);
    expect(primaryCurrencyTotal(accounts)).toEqual({
      currency: "EUR",
      total: 120,
      mixed: true,
    });
  });
});
