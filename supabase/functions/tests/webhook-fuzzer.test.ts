import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import fc from "npm:fast-check@^4.7.0";

const validateWebhookPayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (!p.id || typeof p.id !== "string") return false;
  const uuidParts = p.id.split("-");
  if (uuidParts.length !== 5) return false;
  if (
    uuidParts[0].length !== 8 ||
    uuidParts[1].length !== 4 ||
    uuidParts[2].length !== 4 ||
    uuidParts[3].length !== 4 ||
    uuidParts[4].length !== 12
  ) return false;
  const isHex = (h: string) => /^[0-9a-f]+$/i.test(h);
  return uuidParts.every(isHex);
};

Deno.test("Webhook Fuzzing: should handle thousands of random payloads without crashing", () => {
  fc.assert(
    fc.property(fc.anything(), (payload) => {
      try {
        validateWebhookPayload(payload);
        return true;
      } catch {
        return false;
      }
    }),
    { numRuns: 1000 },
  );
});

Deno.test("Webhook Fuzzing: should validate all forms of generated UUIDs", () => {
  fc.assert(
    fc.property(fc.uuid(), (id) => {
      const isValid = validateWebhookPayload({ id });
      if (!isValid) console.log(`Failed UUID: ${id}`);
      return isValid;
    }),
    { numRuns: 100 },
  );
});
