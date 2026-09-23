import { describe, expect, it } from "vitest";
import {
  parseAssistantCommand,
  parseItalianDate,
  runQueryBalance,
} from "@/features/assistant/parser";
import type { Account } from "@/types/database";

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

  it("parses aggiungi spesa with ieri", () => {
    const intent = parseAssistantCommand(
      "Aggiungi spesa 35 euro ristorante ieri"
    );
    expect(intent.type).toBe("create_transaction");
    if (intent.type === "create_transaction") {
      expect(intent.payload.amount).toBe(35);
      expect(intent.payload.description.toLowerCase()).toContain("ristorante");
      expect(intent.payload.date).toBe(
        parseItalianDate("ieri")
      );
    }
  });

  it("parses salvadanaio deposit", () => {
    const intent = parseAssistantCommand("Metti 300 euro nel salvadanaio");
    expect(intent.type).toBe("deposit_savings");
    if (intent.type === "deposit_savings") {
      expect(intent.payload.amount).toBe(300);
    }
  });

  it("parses create goal already reached", () => {
    const intent = parseAssistantCommand(
      "Crea obiettivo Matrimonio Giulia e Ruben a 200 euro già raggiunto"
    );
    expect(intent.type).toBe("create_goal");
    if (intent.type === "create_goal") {
      expect(intent.payload.name.toLowerCase()).toContain("matrimonio");
      expect(intent.payload.targetAmount).toBe(200);
      expect(intent.payload.currentAmount).toBe(200);
      expect(intent.payload.completed).toBe(true);
    }
  });

  it("parses balance query", () => {
    expect(parseAssistantCommand("Quanto ho sul conto?").type).toBe(
      "query_balance"
    );
  });

  it("parses sync bank", () => {
    const intent = parseAssistantCommand("Sincronizza Intesa");
    expect(intent.type).toBe("sync_bank");
    if (intent.type === "sync_bank") {
      expect(intent.payload.institutionHint.toLowerCase()).toContain("intesa");
    }
  });

  it("parses budget remaining", () => {
    expect(parseAssistantCommand("Budget rimanente").type).toBe("query_budget");
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

  it("parses cut potential query", () => {
    expect(parseAssistantCommand("Dove posso risparmiare?").type).toBe(
      "query_cut_potential"
    );
  });

  it("parses insights", () => {
    expect(parseAssistantCommand("consigli finanziari").type).toBe(
      "query_insights"
    );
  });

  it("parses goal what-if with salvadanaio contribution and February deadline", () => {
    const intent = parseAssistantCommand(
      "Se inserisco oggi nell'obiettivo Vacanza Islanda i 300 euro del Salvadanaio, quanto dovrei mettere da parte nei prossimi mesi per arrivare a raggiungere l'obiettivo entro il 15 febbraio?"
    );
    expect(intent.type).toBe("goal_what_if");
    if (intent.type === "goal_what_if") {
      expect(intent.payload.goalHint.toLowerCase()).toMatch(/islanda|vacanza/);
      expect(intent.payload.contributeAmount).toBe(300);
      expect(intent.payload.deadline).toMatch(/^\d{4}-02-15$/);
    }
  });

  it("still parses plain salvadanaio deposit", () => {
    expect(parseAssistantCommand("Metti 300 euro nel salvadanaio").type).toBe(
      "deposit_savings"
    );
  });

  it("returns unknown for gibberish", () => {
    expect(parseAssistantCommand("bla bla xyz").type).toBe("unknown");
  });

  it("runQueryBalance sums accounts", () => {
    const accounts = [
      {
        id: "1",
        name: "Intesa",
        type: "bank",
        balance: 1000,
        is_archived: false,
      },
      {
        id: "2",
        name: "Salvadanaio",
        type: "savings",
        balance: 300,
        is_archived: false,
      },
    ] as Account[];
    const result = runQueryBalance(accounts);
    expect(result.total).toBe(1300);
    expect(result.summaryText).toMatch(/1[.\s]?300/);
  });
});
