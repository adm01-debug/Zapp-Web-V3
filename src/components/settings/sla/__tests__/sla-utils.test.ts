import { describe, it, expect } from 'vitest';
import {
  formatSLAMinutes,
  SCOPE_TABS,
  CONTACT_TYPES,
  SCOPE_LABELS,
} from '../sla-utils';

// ── formatSLAMinutes ──────────────────────────────────────────────────────────

describe('formatSLAMinutes — minutes only (< 60)', () => {
  it('formats 0 minutes', () => {
    expect(formatSLAMinutes(0)).toBe('0min');
  });

  it('formats 1 minute', () => {
    expect(formatSLAMinutes(1)).toBe('1min');
  });

  it('formats 30 minutes', () => {
    expect(formatSLAMinutes(30)).toBe('30min');
  });

  it('formats 59 minutes (max below 1 hour)', () => {
    expect(formatSLAMinutes(59)).toBe('59min');
  });
});

describe('formatSLAMinutes — exact hours (remainder = 0)', () => {
  it('formats 60 minutes as 1h', () => {
    expect(formatSLAMinutes(60)).toBe('1h');
  });

  it('formats 120 minutes as 2h', () => {
    expect(formatSLAMinutes(120)).toBe('2h');
  });

  it('formats 480 minutes as 8h', () => {
    expect(formatSLAMinutes(480)).toBe('8h');
  });

  it('formats 1440 minutes as 24h', () => {
    expect(formatSLAMinutes(1440)).toBe('24h');
  });
});

describe('formatSLAMinutes — hours with remainder', () => {
  it('formats 61 minutes as 1h 1min', () => {
    expect(formatSLAMinutes(61)).toBe('1h 1min');
  });

  it('formats 90 minutes as 1h 30min', () => {
    expect(formatSLAMinutes(90)).toBe('1h 30min');
  });

  it('formats 125 minutes as 2h 5min', () => {
    expect(formatSLAMinutes(125)).toBe('2h 5min');
  });

  it('formats 1500 minutes as 25h', () => {
    expect(formatSLAMinutes(1500)).toBe('25h');
  });

  it('formats 1501 minutes as 25h 1min', () => {
    expect(formatSLAMinutes(1501)).toBe('25h 1min');
  });
});

// ── SCOPE_TABS ────────────────────────────────────────────────────────────────

describe('SCOPE_TABS', () => {
  const EXPECTED_VALUES = ['contact', 'company', 'job_title', 'contact_type', 'queue', 'agent'];

  it('has exactly 6 tabs', () => {
    expect(SCOPE_TABS).toHaveLength(6);
  });

  it.each(EXPECTED_VALUES)('contains tab with value "%s"', (val) => {
    expect(SCOPE_TABS.some((t) => t.value === val)).toBe(true);
  });

  it('every tab has a non-empty label', () => {
    SCOPE_TABS.forEach((t) => {
      expect(t.label.length).toBeGreaterThan(0);
    });
  });

  it('every tab has a truthy icon', () => {
    SCOPE_TABS.forEach((t) => {
      expect(t.icon).toBeTruthy();
    });
  });
});

// ── CONTACT_TYPES ─────────────────────────────────────────────────────────────

describe('CONTACT_TYPES', () => {
  it('is a non-empty array', () => {
    expect(CONTACT_TYPES.length).toBeGreaterThan(0);
  });

  it('contains "cliente"', () => {
    expect(CONTACT_TYPES).toContain('cliente');
  });

  it('contains "lead"', () => {
    expect(CONTACT_TYPES).toContain('lead');
  });

  it('contains "vip"', () => {
    expect(CONTACT_TYPES).toContain('vip');
  });

  it('all entries are non-empty strings', () => {
    CONTACT_TYPES.forEach((t) => {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    });
  });
});

// ── SCOPE_LABELS ──────────────────────────────────────────────────────────────

describe('SCOPE_LABELS', () => {
  it('has a label for "contact"', () => {
    expect(SCOPE_LABELS.contact).toBe('Cliente');
  });

  it('has a label for "company"', () => {
    expect(SCOPE_LABELS.company).toBe('Empresa');
  });

  it('has a label for "job_title"', () => {
    expect(SCOPE_LABELS.job_title).toBe('Cargo');
  });

  it('has a label for "contact_type"', () => {
    expect(SCOPE_LABELS.contact_type).toBe('Tipo de Contato');
  });

  it('has a label for "queue"', () => {
    expect(SCOPE_LABELS.queue).toBe('Fila');
  });

  it('has a label for "agent"', () => {
    expect(SCOPE_LABELS.agent).toBe('Agente');
  });

  it('all 6 scope labels are non-empty strings', () => {
    Object.values(SCOPE_LABELS).forEach((label) => {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });
  });
});
