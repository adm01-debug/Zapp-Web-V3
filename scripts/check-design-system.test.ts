import { expect, test, describe } from "bun:test";
import { getSuggestion } from "./check-design-system";

describe("Design System Auditor", () => {
  test("should map literal colors to semantic tokens safely", () => {
    const { replacement } = getSuggestion("Literal Color", "bg-red-500");
    expect(replacement).toBe("bg-destructive");
  });

  test("should map hex colors to semantic tokens", () => {
    const { replacement } = getSuggestion("Raw Hex", "#ef4444");
    expect(replacement).toBe("bg-destructive");
  });

  test("should justify known technical cases as VALID", () => {
    const { suggestion } = getSuggestion("Raw Hex", "#f1592a");
    expect(suggestion).toContain("VALID: PDF brand color");
  });

  test("should handle variants correctly", () => {
    const { replacement } = getSuggestion("Literal Color", "hover:bg-blue-600");
    expect(replacement).toBe("hover:bg-primary");
  });

  test("should identify redundant font-sans", () => {
    const { replacement } = getSuggestion("Literal Font", "font-sans");
    expect(replacement).toBe("");
  });

  test("should flag font-mono as medium priority for review", () => {
    const { priority } = getSuggestion("Literal Font", "font-mono");
    expect(priority).toBe("Medium");
  });

  test("should not create new tokens without approval", () => {
    // This test ensures that the replacement logic only uses tokens defined in our strategy
    const testCases = ["bg-amber-100", "text-slate-500", "border-gray-200"];
    const allowedSemanticSuffixes = ["destructive", "warning", "primary", "secondary", "muted", "accent", "background", "foreground", "border", "success", "info"];
    
    testCases.forEach(match => {
      const { replacement } = getSuggestion("Literal Color", match);
      if (replacement) {
        const token = replacement.split("-").pop();
        if (!token) throw new Error(`token ausente em ${replacement}`);
        expect(allowedSemanticSuffixes).toContain(token);
      }
    });
  });
});
