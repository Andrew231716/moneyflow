import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

describe("safeRedirect", () => {
  it("allows relative app paths including open-banking callback query", () => {
    expect(safeRedirect("/api/open-banking/callback?ref=mf_abc")).toBe(
      "/api/open-banking/callback?ref=mf_abc"
    );
    expect(safeRedirect("/accounts")).toBe("/accounts");
  });

  it("blocks external / protocol-relative / auth loops", () => {
    expect(safeRedirect("https://evil.example/phish")).toBe("/");
    expect(safeRedirect("//evil.example")).toBe("/");
    expect(safeRedirect("/\\evil")).toBe("/");
    expect(safeRedirect("/login")).toBe("/");
    expect(safeRedirect("/register?x=1")).toBe("/");
    expect(safeRedirect(null)).toBe("/");
    expect(safeRedirect("")).toBe("/");
  });
});
