import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  FILTER_STORAGE_KEY,
  ALL_STATUSES,
  PERIOD_MS,
  STATUS_STYLES,
  SCOPE_LABELS,
  getSLAStatus,
  isWithinPeriod,
  formatDurationMs,
  formatTs,
  loadFilters,
} from '../types';

// ── FILTER_STORAGE_KEY ────────────────────────────────────────────────────────

describe('FILTER_STORAGE_KEY', () => {
  it('is a non-empty string', () => {
    expect(typeof FILTER_STORAGE_KEY).toBe('string');
    expect(FILTER_STORAGE_KEY.length).toBeGreaterThan(0);
  });

  it('equals "sla-timeline-filters"', () => {
    expect(FILTER_STORAGE_KEY).toBe('sla-timeline-filters');
  });
});

// ── ALL_STATUSES ──────────────────────────────────────────────────────────────

describe('ALL_STATUSES', () => {
  it('is an array', () => {
    expect(Array.isArray(ALL_STATUSES)).toBe(true);
  });

  it('has exactly 4 entries', () => {
    expect(ALL_STATUSES).toHaveLength(4);
  });

  it('contains "ok", "warning", "breached", "na"', () => {
    expect(ALL_STATUSES).toContain('ok');
    expect(ALL_STATUSES).toContain('warning');
    expect(ALL_STATUSES).toContain('breached');
    expect(ALL_STATUSES).toContain('na');
  });

  it('all entries are unique', () => {
    expect(new Set(ALL_STATUSES).size).toBe(ALL_STATUSES.length);
  });
});

// ── PERIOD_MS ─────────────────────────────────────────────────────────────────

describe('PERIOD_MS — structure', () => {
  it('is a non-null object', () => {
    expect(typeof PERIOD_MS).toBe('object');
    expect(PERIOD_MS).not.toBeNull();
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(PERIOD_MS)).toHaveLength(4);
  });
});

describe('PERIOD_MS — exact values', () => {
  it('"24h" = 86_400_000 ms', () => {
    expect(PERIOD_MS['24h']).toBe(86_400_000);
  });

  it('"7d" = 604_800_000 ms', () => {
    expect(PERIOD_MS['7d']).toBe(604_800_000);
  });

  it('"30d" = 2_592_000_000 ms', () => {
    expect(PERIOD_MS['30d']).toBe(2_592_000_000);
  });

  it('"all" = Infinity', () => {
    expect(PERIOD_MS['all']).toBe(Infinity);
  });

  it('24h < 7d < 30d < Infinity', () => {
    expect(PERIOD_MS['24h']).toBeLessThan(PERIOD_MS['7d']);
    expect(PERIOD_MS['7d']).toBeLessThan(PERIOD_MS['30d']);
    expect(PERIOD_MS['30d']).toBeLessThan(PERIOD_MS['all']);
  });
});

// ── STATUS_STYLES ─────────────────────────────────────────────────────────────

describe('STATUS_STYLES — structure', () => {
  it('is a non-null object', () => {
    expect(typeof STATUS_STYLES).toBe('object');
    expect(STATUS_STYLES).not.toBeNull();
  });

  it('has exactly 4 keys (one per SLAStatus)', () => {
    expect(Object.keys(STATUS_STYLES)).toHaveLength(4);
  });

  it('every value has a non-empty label string', () => {
    Object.values(STATUS_STYLES).forEach((v) => {
      expect(typeof v.label).toBe('string');
      expect(v.label.length).toBeGreaterThan(0);
    });
  });

  it('every value has a non-empty className string', () => {
    Object.values(STATUS_STYLES).forEach((v) => {
      expect(typeof v.className).toBe('string');
      expect(v.className.length).toBeGreaterThan(0);
    });
  });

  it('all labels are unique', () => {
    const labels = Object.values(STATUS_STYLES).map((v) => v.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('STATUS_STYLES — known entries', () => {
  it('"ok" label is "Dentro do SLA"', () => {
    expect(STATUS_STYLES.ok.label).toBe('Dentro do SLA');
  });

  it('"warning" label is "Em risco"', () => {
    expect(STATUS_STYLES.warning.label).toBe('Em risco');
  });

  it('"breached" label is "Violado"', () => {
    expect(STATUS_STYLES.breached.label).toBe('Violado');
  });

  it('"na" label is "—"', () => {
    expect(STATUS_STYLES.na.label).toBe('—');
  });
});

// ── SCOPE_LABELS ──────────────────────────────────────────────────────────────

describe('SCOPE_LABELS — structure', () => {
  it('is a non-null object', () => {
    expect(typeof SCOPE_LABELS).toBe('object');
    expect(SCOPE_LABELS).not.toBeNull();
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(SCOPE_LABELS)).toHaveLength(4);
  });

  it('all values are non-empty strings', () => {
    Object.values(SCOPE_LABELS).forEach((v) => {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    });
  });
});

describe('SCOPE_LABELS — exact values', () => {
  it('"current" = "Atual (fila + agente)"', () => {
    expect(SCOPE_LABELS.current).toBe('Atual (fila + agente)');
  });

  it('"queue" = "Por fila"', () => {
    expect(SCOPE_LABELS.queue).toBe('Por fila');
  });

  it('"agent" = "Por agente"', () => {
    expect(SCOPE_LABELS.agent).toBe('Por agente');
  });

  it('"none" = "Sem SLA"', () => {
    expect(SCOPE_LABELS.none).toBe('Sem SLA');
  });
});

// ── getSLAStatus ──────────────────────────────────────────────────────────────

describe('getSLAStatus — null input', () => {
  it('returns "na" when durationMs is null', () => {
    expect(getSLAStatus(null, 30)).toBe('na');
  });

  it('returns "na" regardless of limitMinutes when null', () => {
    expect(getSLAStatus(null, 0)).toBe('na');
    expect(getSLAStatus(null, 1000)).toBe('na');
  });
});

describe('getSLAStatus — breached', () => {
  it('returns "breached" when duration exceeds limit', () => {
    expect(getSLAStatus(31 * 60_000, 30)).toBe('breached');
  });

  it('returns "breached" when duration is exactly one ms above limit', () => {
    expect(getSLAStatus(30 * 60_000 + 1, 30)).toBe('breached');
  });

  it('returns "breached" for large overrun', () => {
    expect(getSLAStatus(120 * 60_000, 60)).toBe('breached');
  });
});

describe('getSLAStatus — warning', () => {
  it('returns "warning" when duration is above 70% of limit but ≤ limit', () => {
    // limit 30 min → 70% = 21 min; 25 min is in the warning zone
    expect(getSLAStatus(25 * 60_000, 30)).toBe('warning');
  });

  it('returns "warning" at exactly 70% + 1ms', () => {
    const limit = 60 * 60_000;
    expect(getSLAStatus(Math.floor(limit * 0.7) + 1, 60)).toBe('warning');
  });

  it('returns "warning" one ms below the limit', () => {
    expect(getSLAStatus(30 * 60_000 - 1, 30)).toBe('warning');
  });
});

describe('getSLAStatus — ok', () => {
  it('returns "ok" when duration is at exactly 70% of limit', () => {
    const limit = 100 * 60_000;
    expect(getSLAStatus(70 * 60_000, 100)).toBe('ok');
  });

  it('returns "ok" when duration is well below limit', () => {
    expect(getSLAStatus(5 * 60_000, 30)).toBe('ok');
  });

  it('returns "ok" for zero duration', () => {
    expect(getSLAStatus(0, 30)).toBe('ok');
  });
});

// ── isWithinPeriod ────────────────────────────────────────────────────────────

describe('isWithinPeriod', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns true for period "all" regardless of date', () => {
    expect(isWithinPeriod(null, 'all')).toBe(true);
    expect(isWithinPeriod(new Date(0), 'all')).toBe(true);
  });

  it('returns false for null date when period is not "all"', () => {
    expect(isWithinPeriod(null, '24h')).toBe(false);
    expect(isWithinPeriod(null, '7d')).toBe(false);
    expect(isWithinPeriod(null, '30d')).toBe(false);
  });

  it('returns true for a very recent date within 24h window', () => {
    const now = 1_000_000;
    vi.setSystemTime(now);
    const recent = new Date(now - 60_000); // 1 minute ago
    expect(isWithinPeriod(recent, '24h')).toBe(true);
  });

  it('returns false for a date older than the 24h window', () => {
    const now = 86_400_000 * 2;
    vi.setSystemTime(now);
    const old = new Date(now - 86_400_001); // 1 ms past 24h
    expect(isWithinPeriod(old, '24h')).toBe(false);
  });

  it('returns true for a date exactly at the 24h boundary', () => {
    const now = 86_400_000 * 2;
    vi.setSystemTime(now);
    const boundary = new Date(now - PERIOD_MS['24h']);
    expect(isWithinPeriod(boundary, '24h')).toBe(true);
  });

  it('returns true within 7d window', () => {
    const now = PERIOD_MS['7d'] * 2;
    vi.setSystemTime(now);
    const sixDaysAgo = new Date(now - 6 * 86_400_000);
    expect(isWithinPeriod(sixDaysAgo, '7d')).toBe(true);
  });

  it('returns false outside 7d window', () => {
    const now = PERIOD_MS['7d'] * 2;
    vi.setSystemTime(now);
    const eightDaysAgo = new Date(now - 8 * 86_400_000);
    expect(isWithinPeriod(eightDaysAgo, '7d')).toBe(false);
  });
});

// ── formatDurationMs ──────────────────────────────────────────────────────────

describe('formatDurationMs — null', () => {
  it('returns "—" for null', () => {
    expect(formatDurationMs(null)).toBe('—');
  });
});

describe('formatDurationMs — seconds', () => {
  it('formats 0 ms as "0s"', () => {
    expect(formatDurationMs(0)).toBe('0s');
  });

  it('formats 30_000 ms as "30s"', () => {
    expect(formatDurationMs(30_000)).toBe('30s');
  });

  it('formats 59_999 ms as "60s" (rounds up)', () => {
    expect(formatDurationMs(59_999)).toBe('60s');
  });

  it('formats 1_000 ms as "1s"', () => {
    expect(formatDurationMs(1_000)).toBe('1s');
  });
});

describe('formatDurationMs — minutes', () => {
  it('formats 60_000 ms as "1min"', () => {
    expect(formatDurationMs(60_000)).toBe('1min');
  });

  it('formats 90_000 ms as "2min" (rounds)', () => {
    expect(formatDurationMs(90_000)).toBe('2min');
  });

  it('formats 3_599_999 ms as "60min" (rounds up from ~59.99 min)', () => {
    expect(formatDurationMs(3_599_999)).toBe('60min');
  });

  it('formats 300_000 ms as "5min"', () => {
    expect(formatDurationMs(300_000)).toBe('5min');
  });
});

describe('formatDurationMs — hours', () => {
  it('formats 3_600_000 ms as "1h"', () => {
    expect(formatDurationMs(3_600_000)).toBe('1h');
  });

  it('formats 7_200_000 ms as "2h"', () => {
    expect(formatDurationMs(7_200_000)).toBe('2h');
  });

  it('formats 85_999_999 ms as "24h" (rounds to 24)', () => {
    expect(formatDurationMs(86_399_999)).toBe('24h');
  });
});

describe('formatDurationMs — days', () => {
  it('formats 86_400_000 ms as "1d"', () => {
    expect(formatDurationMs(86_400_000)).toBe('1d');
  });

  it('formats 7 * 86_400_000 ms as "7d"', () => {
    expect(formatDurationMs(7 * 86_400_000)).toBe('7d');
  });

  it('formats 30 * 86_400_000 ms as "30d"', () => {
    expect(formatDurationMs(30 * 86_400_000)).toBe('30d');
  });
});

// ── formatTs ──────────────────────────────────────────────────────────────────

describe('formatTs', () => {
  it('returns "—" for null', () => {
    expect(formatTs(null)).toBe('—');
  });

  it('returns a non-empty string for a valid date', () => {
    const result = formatTs(new Date(2024, 0, 15, 9, 5));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe('—');
  });

  it('output contains "/" separator between day and month', () => {
    const result = formatTs(new Date(2024, 0, 15, 9, 5));
    expect(result).toContain('/');
  });

  it('output contains ":" separator between hours and minutes', () => {
    const result = formatTs(new Date(2024, 0, 15, 9, 5));
    expect(result).toContain(':');
  });

  it('output matches dd/MM HH:mm pattern', () => {
    const result = formatTs(new Date(2024, 5, 4, 14, 30));
    expect(result).toMatch(/^\d{2}\/\d{2} \d{2}:\d{2}$/);
  });
});

// ── loadFilters ───────────────────────────────────────────────────────────────

describe('loadFilters — defaults', () => {
  beforeEach(() => localStorage.clear());

  it('returns all statuses when storage is empty', () => {
    const { status } = loadFilters();
    expect(status).toEqual(ALL_STATUSES);
  });

  it('returns period "all" when storage is empty', () => {
    expect(loadFilters().period).toBe('all');
  });

  it('returns scope "current" when storage is empty', () => {
    expect(loadFilters().scope).toBe('current');
  });
});

describe('loadFilters — valid saved data', () => {
  beforeEach(() => localStorage.clear());

  it('reads saved period correctly', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: ALL_STATUSES, period: '7d', scope: 'current' }),
    );
    expect(loadFilters().period).toBe('7d');
  });

  it('reads saved scope correctly', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: ALL_STATUSES, period: 'all', scope: 'agent' }),
    );
    expect(loadFilters().scope).toBe('agent');
  });

  it('reads a filtered status list correctly', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: ['ok', 'warning'], period: 'all', scope: 'current' }),
    );
    expect(loadFilters().status).toEqual(['ok', 'warning']);
  });

  it('strips unknown statuses from saved list', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: ['ok', 'alien', 'warning'], period: 'all', scope: 'current' }),
    );
    const { status } = loadFilters();
    expect(status).toContain('ok');
    expect(status).toContain('warning');
    expect(status).not.toContain('alien');
  });

  it('falls back to ALL_STATUSES when saved status list is empty after filtering', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: ['alien'], period: 'all', scope: 'current' }),
    );
    expect(loadFilters().status).toEqual(ALL_STATUSES);
  });
});

describe('loadFilters — invalid data', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults on invalid JSON', () => {
    localStorage.setItem(FILTER_STORAGE_KEY, 'not-json{{{');
    const result = loadFilters();
    expect(result.period).toBe('all');
    expect(result.scope).toBe('current');
    expect(result.status).toEqual(ALL_STATUSES);
  });

  it('falls back to "all" for unrecognised period value', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: ALL_STATUSES, period: 'yesterday', scope: 'current' }),
    );
    expect(loadFilters().period).toBe('all');
  });

  it('falls back to "current" for unrecognised scope value', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: ALL_STATUSES, period: 'all', scope: 'unknown' }),
    );
    expect(loadFilters().scope).toBe('current');
  });

  it('falls back to ALL_STATUSES when status is not an array', () => {
    localStorage.setItem(
      FILTER_STORAGE_KEY,
      JSON.stringify({ status: 'ok', period: 'all', scope: 'current' }),
    );
    expect(loadFilters().status).toEqual(ALL_STATUSES);
  });
});
