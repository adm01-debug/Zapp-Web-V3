/**
 * Tests for the pure utility exports from useGoalsDashboard:
 *   getProgressColor()  — text CSS class based on completion percentage
 *   getProgressBgColor() — bg CSS class based on completion percentage
 *
 * The React hook itself is not tested here (requires heavy mocking of
 * supabase, react-query, and date-fns). These two functions are pure
 * and fully testable without any dependencies.
 */
import { describe, it, expect } from 'vitest';
import { getProgressColor, getProgressBgColor } from '../useGoalsDashboard';

// ── getProgressColor ──────────────────────────────────────────────────────────
describe('getProgressColor', () => {
  it('returns "text-success" at exactly 100%', () => {
    expect(getProgressColor(100)).toBe('text-success');
  });

  it('returns "text-success" above 100%', () => {
    expect(getProgressColor(120)).toBe('text-success');
  });

  it('returns "text-primary" at exactly 75%', () => {
    expect(getProgressColor(75)).toBe('text-primary');
  });

  it('returns "text-primary" between 75 and 99%', () => {
    expect(getProgressColor(99)).toBe('text-primary');
    expect(getProgressColor(80)).toBe('text-primary');
  });

  it('returns "text-warning" at exactly 50%', () => {
    expect(getProgressColor(50)).toBe('text-warning');
  });

  it('returns "text-warning" between 50 and 74%', () => {
    expect(getProgressColor(74)).toBe('text-warning');
    expect(getProgressColor(60)).toBe('text-warning');
  });

  it('returns "text-destructive" below 50%', () => {
    expect(getProgressColor(49)).toBe('text-destructive');
    expect(getProgressColor(0)).toBe('text-destructive');
  });
});

// ── getProgressBgColor ────────────────────────────────────────────────────────
describe('getProgressBgColor', () => {
  it('returns "bg-success" at exactly 100%', () => {
    expect(getProgressBgColor(100)).toBe('bg-success');
  });

  it('returns "bg-success" above 100%', () => {
    expect(getProgressBgColor(110)).toBe('bg-success');
  });

  it('returns "bg-primary" at exactly 75%', () => {
    expect(getProgressBgColor(75)).toBe('bg-primary');
  });

  it('returns "bg-primary" between 75 and 99%', () => {
    expect(getProgressBgColor(90)).toBe('bg-primary');
  });

  it('returns "bg-warning" at exactly 50%', () => {
    expect(getProgressBgColor(50)).toBe('bg-warning');
  });

  it('returns "bg-warning" between 50 and 74%', () => {
    expect(getProgressBgColor(65)).toBe('bg-warning');
  });

  it('returns "bg-destructive" below 50%', () => {
    expect(getProgressBgColor(25)).toBe('bg-destructive');
    expect(getProgressBgColor(0)).toBe('bg-destructive');
  });
});
