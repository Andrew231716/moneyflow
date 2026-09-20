/**
 * Optional LLM bridge — OFF by default (no paid AI APIs).
 * When enabled later, parseAssistantCommand can fall back to this
 * after the deterministic parser returns "unknown".
 */
export const ASSISTANT_LLM_ENABLED =
  process.env.NEXT_PUBLIC_ASSISTANT_LLM === "true";

export type LlmAssistResult = {
  ok: false;
  reason: "disabled" | "unavailable";
  message: string;
};

export async function tryLlmAssist(input: string): Promise<LlmAssistResult> {
  void input;
  if (!ASSISTANT_LLM_ENABLED) {
    return {
      ok: false,
      reason: "disabled",
      message:
        "LLM disabilitato. Usa i comandi strutturati (nessuna API a pagamento).",
    };
  }
  return {
    ok: false,
    reason: "unavailable",
    message: "Nessun provider LLM configurato.",
  };
}
