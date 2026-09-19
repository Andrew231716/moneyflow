import { describe, expect, it } from "vitest";
import { parseAssistantCommand } from "@/features/assistant/parser";

describe("assistant parser", () => {
  it("parses expense command", () => {
    const intent = parseAssistantCommand("spesa 25,50 esselunga");
    expect(intent.type).toBe("create_transaction");
    if (intent.type === "create_transaction") {
      expect(intent.payload.txType).toBe("expense");
      expect(intent.payload.amount).toBe(25.5);
      expect(intent.payload.description.toLowerCase()).toContain("esselunga");
    }
  });

  it("parses bulk categorize", () => {
    const intent = parseAssistantCommand("categorizza coop come alimentari");
    expect(intent.type).toBe("bulk_categorize");
    if (intent.type === "bulk_categorize") {
      expect(intent.payload.pattern).toBe("coop");
      expect(intent.payload.categoryName).toBe("alimentari");
    }
  });

  it("parses forecast", () => {
    expect(parseAssistantCommand("previsione fine mese").type).toBe(
      "financial_projection"
    );
  });

  it("returns unknown for gibberish", () => {
    expect(parseAssistantCommand("bla bla xyz").type).toBe("unknown");
  });
});
