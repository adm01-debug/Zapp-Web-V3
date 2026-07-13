/**
 * Tests for the three pure helper functions exported from useSentimentData:
 *   - getSentimentColor(score): maps numeric score → Tailwind text-* class
 *   - getSentimentBg(score):    maps numeric score → Tailwind bg-* class
 *   - getSentimentLabel(sentiment): maps PT-BR sentiment string → display label
 *
 * Both score functions share the same two thresholds:
 *   score < 30  → destructive  (bad)
 *   score < 70  → warning      (neutral-ish)
 *   score >= 70 → success      (good)
 *
 * No mocks needed — all three functions are deterministic string transforms.
 *
 * Covered:
 *   getSentimentColor
 *     - score 0   → 'text-destructive'
 *     - score 29  → 'text-destructive'  (boundary: last value below 30)
 *     - score 30  → 'text-warning'      (boundary: first value >= 30)
 *     - score 50  → 'text-warning'      (mid-range)
 *     - score 69  → 'text-warning'      (boundary: last value below 70)
 *     - score 70  → 'text-success'      (boundary: first value >= 70)
 *     - score 100 → 'text-success'      (maximum)
 *   getSentimentBg
 *     - score 0   → 'bg-destructive'
 *     - score 29  → 'bg-destructive'
 *     - score 30  → 'bg-warning'
 *     - score 50  → 'bg-warning'
 *     - score 69  → 'bg-warning'
 *     - score 70  → 'bg-success'
 *     - score 100 → 'bg-success'
 *   getSentimentLabel
 *     - 'positivo' → 'Positivo'
 *     - 'negativo' → 'Negativo'
 *     - 'neutro'   → 'Neutro'
 *     - unknown string passes through unchanged
 *     - empty string passes through unchanged
 */
import { describe, it, expect } from 'vitest';
import {
  getSentimentColor,
  getSentimentBg,
  getSentimentLabel,
} from '../useSentimentData';

// ── getSentimentColor ─────────────────────────────────────────────────────────
describe('getSentimentColor', () => {
  it('returns "text-destructive" for score 0', () => {
    expect(getSentimentColor(0)).toBe('text-destructive');
  });

  it('returns "text-destructive" for score 29 (last value < 30)', () => {
    expect(getSentimentColor(29)).toBe('text-destructive');
  });

  it('returns "text-warning" for score 30 (first value >= 30)', () => {
    expect(getSentimentColor(30)).toBe('text-warning');
  });

  it('returns "text-warning" for score 50 (mid-range)', () => {
    expect(getSentimentColor(50)).toBe('text-warning');
  });

  it('returns "text-warning" for score 69 (last value < 70)', () => {
    expect(getSentimentColor(69)).toBe('text-warning');
  });

  it('returns "text-success" for score 70 (first value >= 70)', () => {
    expect(getSentimentColor(70)).toBe('text-success');
  });

  it('returns "text-success" for score 100', () => {
    expect(getSentimentColor(100)).toBe('text-success');
  });
});

// ── getSentimentBg ────────────────────────────────────────────────────────────
describe('getSentimentBg', () => {
  it('returns "bg-destructive" for score 0', () => {
    expect(getSentimentBg(0)).toBe('bg-destructive');
  });

  it('returns "bg-destructive" for score 29 (last value < 30)', () => {
    expect(getSentimentBg(29)).toBe('bg-destructive');
  });

  it('returns "bg-warning" for score 30 (first value >= 30)', () => {
    expect(getSentimentBg(30)).toBe('bg-warning');
  });

  it('returns "bg-warning" for score 50 (mid-range)', () => {
    expect(getSentimentBg(50)).toBe('bg-warning');
  });

  it('returns "bg-warning" for score 69 (last value < 70)', () => {
    expect(getSentimentBg(69)).toBe('bg-warning');
  });

  it('returns "bg-success" for score 70 (first value >= 70)', () => {
    expect(getSentimentBg(70)).toBe('bg-success');
  });

  it('returns "bg-success" for score 100', () => {
    expect(getSentimentBg(100)).toBe('bg-success');
  });
});

// ── getSentimentLabel ─────────────────────────────────────────────────────────
describe('getSentimentLabel', () => {
  it('maps "positivo" → "Positivo"', () => {
    expect(getSentimentLabel('positivo')).toBe('Positivo');
  });

  it('maps "negativo" → "Negativo"', () => {
    expect(getSentimentLabel('negativo')).toBe('Negativo');
  });

  it('maps "neutro" → "Neutro"', () => {
    expect(getSentimentLabel('neutro')).toBe('Neutro');
  });

  it('passes unknown strings through unchanged', () => {
    expect(getSentimentLabel('unknown_sentiment')).toBe('unknown_sentiment');
  });

  it('passes an empty string through unchanged', () => {
    expect(getSentimentLabel('')).toBe('');
  });

  it('is case-sensitive — "Positivo" (capitalised input) passes through unchanged', () => {
    expect(getSentimentLabel('Positivo')).toBe('Positivo');
  });
});
