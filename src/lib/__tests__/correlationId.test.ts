import { describe, it, expect } from 'vitest';
import { generateCorrelationId, CORRELATION_HEADER } from '@/lib/correlationId';

describe('generateCorrelationId', () => {
  it('returns a string', () => {
    expect(typeof generateCorrelationId()).toBe('string');
  });

  it('returns exactly 8 characters', () => {
    expect(generateCorrelationId()).toHaveLength(8);
  });

  it('returns only lowercase hexadecimal characters', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('generates unique ids across multiple calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateCorrelationId()));
    // With 8 hex chars (16^8 = ~4B possibilities) all 50 should be unique
    expect(ids.size).toBe(50);
  });

  it('never returns an empty string', () => {
    for (let i = 0; i < 20; i++) {
      expect(generateCorrelationId().length).toBeGreaterThan(0);
    }
  });

  it('is safe to call repeatedly without throwing', () => {
    expect(() => {
      for (let i = 0; i < 100; i++) generateCorrelationId();
    }).not.toThrow();
  });
});

describe('CORRELATION_HEADER', () => {
  it('is the expected header name', () => {
    expect(CORRELATION_HEADER).toBe('x-correlation-id');
  });

  it('is lowercase (HTTP/2 header convention)', () => {
    expect(CORRELATION_HEADER).toBe(CORRELATION_HEADER.toLowerCase());
  });
});
