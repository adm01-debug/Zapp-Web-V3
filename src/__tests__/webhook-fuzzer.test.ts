import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Simulating a webhook handler validation logic
const validateWebhookPayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (!p.id || typeof p.id !== 'string') return false;
  // Use the most basic UUID format check (hex-hex-hex-hex-hex)
  const uuidParts = p.id.split('-');
  if (uuidParts.length !== 5) return false;
  if (uuidParts[0].length !== 8 || uuidParts[1].length !== 4 || uuidParts[2].length !== 4 || uuidParts[3].length !== 4 || uuidParts[4].length !== 12) return false;
  
  const isHex = (h: string) => /^[0-9a-f]+$/i.test(h);
  return uuidParts.every(isHex);
};

describe('Webhook Fuzzing', () => {
  it('should handle thousands of random payloads without crashing', () => {
    fc.assert(
      fc.property(fc.anything(), (payload) => {
        try {
          validateWebhookPayload(payload);
          return true;
        } catch (e) {
          return false;
        }
      }),
      { numRuns: 1000 }
    );
  });

  it('should validate all forms of generated UUIDs', () => {
    fc.assert(
      fc.property(fc.uuid(), (id) => {
        const isValid = validateWebhookPayload({ id });
        if (!isValid) console.log(`Failed UUID: ${id}`);
        return isValid;
      }),
      { numRuns: 100 }
    );
  });
});
