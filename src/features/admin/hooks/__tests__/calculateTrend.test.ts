/**
 * Tests for calculateTrend() — the pure trend-calculation helper exported from useAIStats.
 *
 * The function maps two numeric snapshots (current period vs previous period) to a
 * TrendData descriptor used in the AI Stats widget. It has five distinct branches:
 *
 *   1. Both zero         → { direction: 'stable', change: 0, percentage: 0 }
 *   2. previous is 0 and current is non-zero
 *                        → { direction: 'up', change: current, percentage: 100 }
 *   3. |percentage| < 1  → { direction: 'stable', change: 0, percentage: 0 }
 *      (sub-1% movement is treated as noise — coerced to stable)
 *   4. change > 0 and |%| >= 1 → { direction: 'up', change, percentage }
 *   5. change < 0 and |%| >= 1 → { direction: 'down', change, percentage }
 *
 * No mocks needed — the function has zero side-effects and no imports from network modules.
 *
 * Covered:
 *   branch 1 — both-zero identity
 *   branch 2 — zero-previous, non-zero current (always 'up' at 100%)
 *   branch 3 — sub-1% magnitude → coerced to stable (current=200, previous=201 ≈ -0.5%)
 *   branch 3 — exact boundary: 1.0% is NOT stable (current=101, previous=100)
 *   branch 4 — positive change ≥ 1% (current=110, previous=100 → 10%)
 *   branch 5 — negative change ≥ 1% (current=90,  previous=100 → -10%)
 *   branch 4 — large positive (current=200, previous=100 → 100%)
 *   branch 5 — large negative (current=0,   previous=100 → -100%)
 *   shape — direction, change, percentage fields are all present
 *   percentage formula — change/previous*100
 */
import { describe, it, expect } from 'vitest';
import { calculateTrend } from '../useAIStats';

// ── branch 1: both zero ───────────────────────────────────────────────────────
describe('calculateTrend — both zero', () => {
  it('returns stable with change=0 and percentage=0', () => {
    expect(calculateTrend(0, 0)).toEqual({ direction: 'stable', change: 0, percentage: 0 });
  });
});

// ── branch 2: previous is zero, current is non-zero ──────────────────────────
describe('calculateTrend — previous=0, current>0', () => {
  it('returns direction "up" with percentage 100', () => {
    const result = calculateTrend(5, 0);
    expect(result.direction).toBe('up');
    expect(result.percentage).toBe(100);
  });

  it('sets change to the current value', () => {
    expect(calculateTrend(5, 0).change).toBe(5);
  });

  it('works with current=1', () => {
    expect(calculateTrend(1, 0)).toEqual({ direction: 'up', change: 1, percentage: 100 });
  });
});

// ── branch 3: |percentage| < 1 — coerced to stable ───────────────────────────
describe('calculateTrend — sub-1% change coerced to stable', () => {
  it('returns stable for a ~-0.5% change (current=200, previous=201)', () => {
    // percentage = (200 - 201) / 201 * 100 ≈ -0.497% → |..| < 1 → stable
    expect(calculateTrend(200, 201)).toEqual({ direction: 'stable', change: 0, percentage: 0 });
  });

  it('returns stable for a ~0.1% positive change (current=1000, previous=999)', () => {
    // percentage = 1 / 999 * 100 ≈ 0.1% → stable
    expect(calculateTrend(1000, 999)).toEqual({ direction: 'stable', change: 0, percentage: 0 });
  });

  it('exactly 1.0% is NOT treated as stable (current=101, previous=100)', () => {
    // percentage = 1 / 100 * 100 = 1.0 — not < 1 — so direction is 'up'
    const result = calculateTrend(101, 100);
    expect(result.direction).toBe('up');
  });
});

// ── branch 4: positive change ≥ 1% ───────────────────────────────────────────
describe('calculateTrend — positive trend (up)', () => {
  it('returns direction "up" for current=110, previous=100', () => {
    const result = calculateTrend(110, 100);
    expect(result.direction).toBe('up');
    expect(result.change).toBe(10);
    expect(result.percentage).toBeCloseTo(10, 5);
  });

  it('returns direction "up" for a 100% increase (current=200, previous=100)', () => {
    const result = calculateTrend(200, 100);
    expect(result.direction).toBe('up');
    expect(result.change).toBe(100);
    expect(result.percentage).toBeCloseTo(100, 5);
  });

  it('returns direction "up" for a 50% increase', () => {
    const result = calculateTrend(150, 100);
    expect(result.direction).toBe('up');
    expect(result.change).toBe(50);
    expect(result.percentage).toBeCloseTo(50, 5);
  });
});

// ── branch 5: negative change ≥ 1% ───────────────────────────────────────────
describe('calculateTrend — negative trend (down)', () => {
  it('returns direction "down" for current=90, previous=100', () => {
    const result = calculateTrend(90, 100);
    expect(result.direction).toBe('down');
    expect(result.change).toBe(-10);
    expect(result.percentage).toBeCloseTo(-10, 5);
  });

  it('returns direction "down" for current=0, previous=100 (-100%)', () => {
    const result = calculateTrend(0, 100);
    expect(result.direction).toBe('down');
    expect(result.change).toBe(-100);
    expect(result.percentage).toBeCloseTo(-100, 5);
  });

  it('returns direction "down" for a 50% decrease', () => {
    const result = calculateTrend(50, 100);
    expect(result.direction).toBe('down');
    expect(result.change).toBe(-50);
    expect(result.percentage).toBeCloseTo(-50, 5);
  });
});

// ── result shape ──────────────────────────────────────────────────────────────
describe('calculateTrend — result shape', () => {
  it('always returns an object with direction, change, and percentage', () => {
    const result = calculateTrend(110, 100);
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('change');
    expect(result).toHaveProperty('percentage');
  });

  it('direction is one of the three allowed values', () => {
    const directions = new Set(['up', 'down', 'stable']);
    expect(directions.has(calculateTrend(0, 0).direction)).toBe(true);
    expect(directions.has(calculateTrend(5, 0).direction)).toBe(true);
    expect(directions.has(calculateTrend(110, 100).direction)).toBe(true);
    expect(directions.has(calculateTrend(90, 100).direction)).toBe(true);
  });
});
