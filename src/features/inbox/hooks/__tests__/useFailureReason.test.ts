/**
 * Tests for formatFailureReason() — the pure display-text formatter exported
 * alongside the useFailureReason hook.
 *
 * The function maps internal reason codes to short human-readable strings
 * that appear in message-status tooltips. No mocks needed — it is a
 * deterministic string transform with no side-effects.
 *
 * Covered:
 *   - http_* codes → "HTTP <code>"
 *   - 'timeout'      → 'Tempo esgotado'
 *   - 'network_error' → 'Erro de rede'
 *   - 'auth_failed'  → 'Falha de autenticação'
 *   - unknown strings pass through unchanged
 *   - edge cases: empty string, whitespace, partial prefix matches
 */
import { describe, it, expect } from 'vitest';
import { formatFailureReason } from '../useFailureReason';

// ── http_* codes ───────────────────────────────────────────────────────────────
describe('formatFailureReason — http_* codes', () => {
  it('formats http_200 as "HTTP 200"', () => {
    expect(formatFailureReason('http_200')).toBe('HTTP 200');
  });

  it('formats http_400 as "HTTP 400"', () => {
    expect(formatFailureReason('http_400')).toBe('HTTP 400');
  });

  it('formats http_401 as "HTTP 401"', () => {
    expect(formatFailureReason('http_401')).toBe('HTTP 401');
  });

  it('formats http_403 as "HTTP 403"', () => {
    expect(formatFailureReason('http_403')).toBe('HTTP 403');
  });

  it('formats http_404 as "HTTP 404"', () => {
    expect(formatFailureReason('http_404')).toBe('HTTP 404');
  });

  it('formats http_429 as "HTTP 429"', () => {
    expect(formatFailureReason('http_429')).toBe('HTTP 429');
  });

  it('formats http_500 as "HTTP 500"', () => {
    expect(formatFailureReason('http_500')).toBe('HTTP 500');
  });

  it('formats http_503 as "HTTP 503"', () => {
    expect(formatFailureReason('http_503')).toBe('HTTP 503');
  });

  it('formats http_error (fallback code) as "HTTP error"', () => {
    expect(formatFailureReason('http_error')).toBe('HTTP error');
  });
});

// ── named codes ────────────────────────────────────────────────────────────────
describe('formatFailureReason — named reason codes', () => {
  it('"timeout" → "Tempo esgotado"', () => {
    expect(formatFailureReason('timeout')).toBe('Tempo esgotado');
  });

  it('"network_error" → "Erro de rede"', () => {
    expect(formatFailureReason('network_error')).toBe('Erro de rede');
  });

  it('"auth_failed" → "Falha de autenticação"', () => {
    expect(formatFailureReason('auth_failed')).toBe('Falha de autenticação');
  });
});

// ── unknown / pass-through ─────────────────────────────────────────────────────
describe('formatFailureReason — unknown codes pass through unchanged', () => {
  it('returns the original string for an unknown code', () => {
    expect(formatFailureReason('unknown_reason')).toBe('unknown_reason');
  });

  it('returns an empty string when passed an empty string', () => {
    expect(formatFailureReason('')).toBe('');
  });

  it('returns whitespace unchanged (no trimming)', () => {
    expect(formatFailureReason('  ')).toBe('  ');
  });

  it('does not match "http" without underscore as an http code', () => {
    expect(formatFailureReason('http')).toBe('http');
  });

  it('does not match "HTTP_200" (uppercase prefix)', () => {
    expect(formatFailureReason('HTTP_200')).toBe('HTTP_200');
  });

  it('returns custom reason strings unchanged', () => {
    expect(formatFailureReason('connection_reset')).toBe('connection_reset');
  });

  it('returns numeric-looking strings unchanged', () => {
    expect(formatFailureReason('503')).toBe('503');
  });
});
