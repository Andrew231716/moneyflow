import { describe, expect, it } from "vitest";
import {
  buildMonthlySummaryCsv,
  buildMonthlyTransactionsCsv,
  monthSlug,
} from "./monthly-report";
import type { Account, Transaction } from "@/types/database";

const account = {
  id: "a",
  user_id: "u",
  name: "Revolut",
  type: "bank",
  balance: 100,
  currency: "EUR",
  color: "#0d9488",
  icon: "wallet",
  is_archived: false,
  created_at: "",
  updated_at: "",
} as Account;

const baseTx = {
  id: "1",
  user_id: "u",
  account_id: "a",
  category_id: null,
  transfer_account_id: null,
  type: "expense",
  amount: 12.5,
  description: "Caffè, bar",
  date: "2026-11-05",
  notes: null,
  source: "manual",
  category_source: "manual",
  is_recurring_instance: false,
  recurring_id: null,
  bank_account_id: null,
  fingerprint: null,
  merchant: null,
  possible_transfer_match_id: null,
  manual_override_fields: null,
  booking_status: "booked",
  created_at: "",
  updated_at: "",
  category: { id: "c", name: "Bar", color: "#000", type: "expense" },
  account,
} as unknown as Transaction;

describe("monthly-report export", () => {
  it("builds CSV with escaped description and month slug", () => {
    const input = {
      month: new Date("2026-11-15T12:00:00Z"),
      summary: { income: 1000, expense: 12.5, savings: 987.5, savingsRate: 98.75 },
      previousSummary: { income: 900, expense: 20, savings: 880, savingsRate: 97.7 },
      transactions: [baseTx],
      accounts: [account],
      budgetProgress: [],
      goals: [],
      byCategory: [{ name: "Bar", total: 12.5 }],
    };
    const txCsv = buildMonthlyTransactionsCsv(input);
    expect(txCsv).toContain("Caffè, bar");
    expect(txCsv.split("\n").length).toBe(2);
    const summary = buildMonthlySummaryCsv(input);
    expect(summary).toContain("entrate");
    expect(summary).toContain("12.50");
    expect(monthSlug(input.month)).toBe("2026-11");
  });
});
