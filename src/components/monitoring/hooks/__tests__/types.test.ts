import { describe, it, expect } from 'vitest';
import { periodMs, periodBuckets } from '../types';

// ── periodMs — structure ──────────────────────────────────────────────────────

describe('periodMs — structure', () => {
  it('is a non-null object', () => {
    expect(typeof periodMs).toBe('object');
    expect(periodMs).not.toBeNull();
  });

  it('has exactly 5 keys', () => {
    expect(Object.keys(periodMs)).toHaveLength(5);
  });

  it('all values are positive integers', () => {
    Object.values(periodMs).forEach((v) => {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
      expect(Number.isInteger(v)).toBe(true);
    });
  });

  it('all values are unique', () => {
    const values = Object.values(periodMs);
    expect(new Set(values).size).toBe(values.length);
  });

  it('values are in ascending order (1h < 6h < 12h < 24h < 7d)', () => {
    const keys: (keyof typeof periodMs)[] = ['1h', '6h', '12h', '24h', '7d'];
    for (let i = 1; i < keys.length; i++) {
      expect(periodMs[keys[i]]).toBeGreaterThan(periodMs[keys[i - 1]]);
    }
  });
});

// ── periodMs — exact values ───────────────────────────────────────────────────

describe('periodMs — exact values', () => {
  it('"1h" = 3_600_000 ms (1 hour)', () => {
    expect(periodMs['1h']).toBe(60 * 60 * 1000);
  });

  it('"6h" = 21_600_000 ms (6 hours)', () => {
    expect(periodMs['6h']).toBe(6 * 60 * 60 * 1000);
  });

  it('"12h" = 43_200_000 ms (12 hours)', () => {
    expect(periodMs['12h']).toBe(12 * 60 * 60 * 1000);
  });

  it('"24h" = 86_400_000 ms (24 hours)', () => {
    expect(periodMs['24h']).toBe(24 * 60 * 60 * 1000);
  });

  it('"7d" = 604_800_000 ms (7 days)', () => {
    expect(periodMs['7d']).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

// ── periodMs — derived relationships ─────────────────────────────────────────

describe('periodMs — derived relationships', () => {
  it('6h is exactly 6× 1h', () => {
    expect(periodMs['6h']).toBe(6 * periodMs['1h']);
  });

  it('12h is exactly 2× 6h', () => {
    expect(periodMs['12h']).toBe(2 * periodMs['6h']);
  });

  it('24h is exactly 2× 12h', () => {
    expect(periodMs['24h']).toBe(2 * periodMs['12h']);
  });

  it('7d is exactly 7× 24h', () => {
    expect(periodMs['7d']).toBe(7 * periodMs['24h']);
  });
});

// ── periodBuckets — structure ─────────────────────────────────────────────────

describe('periodBuckets — structure', () => {
  it('is a non-null object', () => {
    expect(typeof periodBuckets).toBe('object');
    expect(periodBuckets).not.toBeNull();
  });

  it('has exactly 5 keys', () => {
    expect(Object.keys(periodBuckets)).toHaveLength(5);
  });

  it('has the same keys as periodMs', () => {
    expect(Object.keys(periodBuckets).sort()).toEqual(Object.keys(periodMs).sort());
  });

  it('all values are positive integers', () => {
    Object.values(periodBuckets).forEach((v) => {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThan(0);
      expect(Number.isInteger(v)).toBe(true);
    });
  });
});

// ── periodBuckets — exact values ──────────────────────────────────────────────

describe('periodBuckets — exact values', () => {
  it('"1h" = 6 buckets', () => {
    expect(periodBuckets['1h']).toBe(6);
  });

  it('"6h" = 6 buckets', () => {
    expect(periodBuckets['6h']).toBe(6);
  });

  it('"12h" = 12 buckets', () => {
    expect(periodBuckets['12h']).toBe(12);
  });

  it('"24h" = 24 buckets', () => {
    expect(periodBuckets['24h']).toBe(24);
  });

  it('"7d" = 7 buckets', () => {
    expect(periodBuckets['7d']).toBe(7);
  });
});

// ── periodBuckets — bucket size consistency ───────────────────────────────────

describe('periodBuckets — bucket size (periodMs / periodBuckets)', () => {
  it('"1h" bucket size is 10 min (600_000 ms)', () => {
    expect(periodMs['1h'] / periodBuckets['1h']).toBe(10 * 60 * 1000);
  });

  it('"6h" bucket size is 1 hour (3_600_000 ms)', () => {
    expect(periodMs['6h'] / periodBuckets['6h']).toBe(60 * 60 * 1000);
  });

  it('"12h" bucket size is 1 hour (3_600_000 ms)', () => {
    expect(periodMs['12h'] / periodBuckets['12h']).toBe(60 * 60 * 1000);
  });

  it('"24h" bucket size is 1 hour (3_600_000 ms)', () => {
    expect(periodMs['24h'] / periodBuckets['24h']).toBe(60 * 60 * 1000);
  });

  it('"7d" bucket size is 1 day (86_400_000 ms)', () => {
    expect(periodMs['7d'] / periodBuckets['7d']).toBe(24 * 60 * 60 * 1000);
  });

  it('all bucket sizes evenly divide their period (no fractional buckets)', () => {
    (Object.keys(periodMs) as (keyof typeof periodMs)[]).forEach((key) => {
      expect(periodMs[key] % periodBuckets[key]).toBe(0);
    });
  });
});
