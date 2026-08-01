import { expect, test, describe } from "bun:test";
import { getSuggestion } from "./check-design-system";

const ALLOWED_TOKENS = [
  "destructive", "warning", "primary", "secondary", "muted", "accent", 
  "background", "foreground", "border", "success", "info"
];

describe("Design System Safety & Integrity", () => {
  describe("Token Substitution Safety", () => {
    test("should only suggest approved semantic tokens", () => {
      const testColors = [
        "bg-red-500", "text-blue-600", "border-amber-200", 
        "bg-slate-100", "text-emerald-500", "hover:bg-purple-400"
      ];

      testColors.forEach(color => {
        const { replacement } = getSuggestion("Literal Color", color, "test.tsx");
        if (replacement) {
          const parts = replacement.split("-");
          const token = parts[parts.length - 1];
          // Remove variants if present (though split-pop handles the last part)
          const cleanToken = token.includes(':') ? token.split(':').pop() : token;
          if (!cleanToken) throw new Error(`token ausente em ${replacement}`);
          
          expect(ALLOWED_TOKENS).toContain(cleanToken);
        }
      });
    });

    test("should NOT provide a replacement for unknown arbitrary hex colors", () => {
      const unknownHex = "bg-[#123456]";
      const { replacement, suggestion } = getSuggestion("Arbitrary Color", unknownHex, "test.tsx");
      
      expect(replacement).toBeUndefined();
      expect(suggestion).toBe("Check design system tokens");
    });

    test("should provide replacement ONLY for mapped hex colors", () => {
      const knownHex = "bg-[#ef4444]"; // mapped to destructive
      const { replacement } = getSuggestion("Raw Hex", knownHex, "test.tsx");
      
      expect(replacement).toBe("bg-destructive");
    });
  });

  describe("Technical Justification Integrity", () => {
    test("should preserve brand colors with VALID justification", () => {
      const brandColors = [
        { match: "#f1592a", label: "PDF brand color" },
        { match: "#25d366", label: "WhatsApp Green" },
        { match: "#4285f4", label: "Google Blue" }
      ];

      brandColors.forEach(({ match, label }) => {
        const { suggestion, replacement, priority } = getSuggestion("Raw Hex", match, "test.tsx");
        expect(suggestion).toContain(`VALID: ${label}`);
        expect(replacement).toBeUndefined();
        expect(priority).toBe("Low");
      });
    });

    test("should preserve Recharts constants in chart files", () => {
      const { suggestion, priority } = getSuggestion("Raw Hex", "#ccc", "src/components/analytics/chart.tsx");
      expect(suggestion).toContain("VALID");
      expect(priority).toBe("Low");
    });

    test("should preserve OLED black in CSS files", () => {
      const { suggestion } = getSuggestion("Raw Hex", "#000000", "src/index.css");
      expect(suggestion).toBe("VALID: OLED Black (Intentional)");
    });
  });

  describe("Typography Rules", () => {
    test("should remove font-sans as it is redundant", () => {
      const { replacement, priority } = getSuggestion("Literal Font", "font-sans", "test.tsx");
      expect(replacement).toBe("");
      expect(priority).toBe("High");
    });

    test("should flag font-mono but NOT remove it automatically", () => {
      const { replacement, priority, suggestion } = getSuggestion("Literal Font", "font-mono", "test.tsx");
      expect(replacement).toBeUndefined();
      expect(priority).toBe("Medium");
      expect(suggestion).toContain("Ensure font-mono is only for technical data");
    });
  });

  describe("Regex Replacement Safety", () => {
    test("should not replace substrings incorrectly", () => {
      // This tests the logic that would be used in --apply-patch
      const content = "className='bg-red-500 bg-red-500-custom'";
      const match = "bg-red-500";
      const replacement = "bg-destructive";
      
      // Simulating the regex used in check-design-system.ts: 
      // const regex = new RegExp(`(?<!-)${escapedMatch}(?!-)`, 'g');
      const escapedMatch = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(?<!-)${escapedMatch}(?!-)`, 'g');
      
      const newContent = content.replace(regex, replacement);
      
      // Should replace "bg-red-500" but NOT the one that is a prefix of "bg-red-500-custom"
      expect(newContent).toBe("className='bg-destructive bg-red-500-custom'");
    });
  });
});
