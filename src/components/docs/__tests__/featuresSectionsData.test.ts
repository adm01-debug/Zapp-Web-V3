import { describe, it, expect } from 'vitest';
import { sections, totalFeatures } from '../featuresSectionsData';

// ── sections — completeness ───────────────────────────────────────────────────

describe('sections — completeness', () => {
  it('is an array', () => {
    expect(Array.isArray(sections)).toBe(true);
  });

  it('has exactly 34 sections', () => {
    expect(sections).toHaveLength(34);
  });

  it('all ids are unique', () => {
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ids are sequential from 1 to 34', () => {
    const ids = sections.map((s) => s.id).sort((a, b) => a - b);
    ids.forEach((id, idx) => expect(id).toBe(idx + 1));
  });
});

describe('sections — per-item structure', () => {
  it('every section has a positive numeric id', () => {
    sections.forEach((s) => {
      expect(typeof s.id).toBe('number');
      expect(s.id).toBeGreaterThan(0);
    });
  });

  it('every section has a non-empty title', () => {
    sections.forEach((s) => {
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
    });
  });

  it('every section has a truthy icon', () => {
    sections.forEach((s) => {
      expect(s.icon).toBeTruthy();
    });
  });

  it('every section has a non-empty color string', () => {
    sections.forEach((s) => {
      expect(typeof s.color).toBe('string');
      expect(s.color.length).toBeGreaterThan(0);
    });
  });

  it('every color starts with "text-"', () => {
    sections.forEach((s) => {
      expect(s.color).toMatch(/^text-/);
    });
  });

  it('every section has a non-empty items array', () => {
    sections.forEach((s) => {
      expect(Array.isArray(s.items)).toBe(true);
      expect(s.items.length).toBeGreaterThan(0);
    });
  });

  it('every item within every section is a non-empty string', () => {
    sections.forEach((s) => {
      s.items.forEach((item) => {
        expect(typeof item).toBe('string');
        expect(item.length).toBeGreaterThan(0);
      });
    });
  });

  it('all section titles are unique', () => {
    const titles = sections.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

// ── sections — known spot-checks ──────────────────────────────────────────────

describe('sections — known entries', () => {
  it('section 1 has title "Autenticação e Segurança"', () => {
    const s = sections.find((s) => s.id === 1)!;
    expect(s.title).toBe('Autenticação e Segurança');
  });

  it('section 1 color is "text-destructive"', () => {
    const s = sections.find((s) => s.id === 1)!;
    expect(s.color).toBe('text-destructive');
  });

  it('section 1 items include "MFA (Autenticação de Dois Fatores)"', () => {
    const s = sections.find((s) => s.id === 1)!;
    expect(s.items).toContain('MFA (Autenticação de Dois Fatores)');
  });

  it('section 1 items include "RBAC (3 níveis: admin, supervisor, agent)"', () => {
    const s = sections.find((s) => s.id === 1)!;
    expect(s.items).toContain('RBAC (3 níveis: admin, supervisor, agent)');
  });

  it('section 2 has title "Inbox / Chat em Tempo Real"', () => {
    const s = sections.find((s) => s.id === 2)!;
    expect(s.title).toBe('Inbox / Chat em Tempo Real');
  });

  it('section 5 has title "Inteligência Artificial"', () => {
    const s = sections.find((s) => s.id === 5)!;
    expect(s.title).toBe('Inteligência Artificial');
  });

  it('section 8 has title "SLA (Service Level Agreement)"', () => {
    const s = sections.find((s) => s.id === 8)!;
    expect(s.title).toBe('SLA (Service Level Agreement)');
  });

  it('section 9 has title "Gamificação"', () => {
    const s = sections.find((s) => s.id === 9)!;
    expect(s.title).toBe('Gamificação');
  });

  it('section 14 has title "Conexões WhatsApp"', () => {
    const s = sections.find((s) => s.id === 14)!;
    expect(s.title).toBe('Conexões WhatsApp');
  });

  it('section 24 has title "Segurança Avançada"', () => {
    const s = sections.find((s) => s.id === 24)!;
    expect(s.title).toBe('Segurança Avançada');
  });

  it('section 33 has title "Banco de Dados"', () => {
    const s = sections.find((s) => s.id === 33)!;
    expect(s.title).toBe('Banco de Dados');
  });

  it('section 34 has title "Edge Functions"', () => {
    const s = sections.find((s) => s.id === 34)!;
    expect(s.title).toBe('Edge Functions');
  });
});

// ── totalFeatures ──────────────────────────────────────────────────────────────

describe('totalFeatures', () => {
  it('is a positive number', () => {
    expect(typeof totalFeatures).toBe('number');
    expect(totalFeatures).toBeGreaterThan(0);
  });

  it('equals sum of all section items lengths', () => {
    const expected = sections.reduce((sum, s) => sum + s.items.length, 0);
    expect(totalFeatures).toBe(expected);
  });

  it('is greater than 200 (codebase has many features)', () => {
    expect(totalFeatures).toBeGreaterThan(200);
  });
});
