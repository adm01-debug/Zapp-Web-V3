import { describe, it, expect } from 'vitest';
import { CATEGORY_LABELS, ALL_CATEGORIES } from '../StickerTypes';

// ── CATEGORY_LABELS — structure ───────────────────────────────────────────────

describe('CATEGORY_LABELS — structure', () => {
  it('is a non-null object', () => {
    expect(typeof CATEGORY_LABELS).toBe('object');
    expect(CATEGORY_LABELS).not.toBeNull();
  });

  it('has exactly 24 keys', () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(24);
  });

  it('every value has a non-empty emoji string', () => {
    Object.values(CATEGORY_LABELS).forEach((v) => {
      expect(typeof v.emoji).toBe('string');
      expect(v.emoji.length).toBeGreaterThan(0);
    });
  });

  it('every value has a non-empty label string', () => {
    Object.values(CATEGORY_LABELS).forEach((v) => {
      expect(typeof v.label).toBe('string');
      expect(v.label.length).toBeGreaterThan(0);
    });
  });

  it('all labels are unique', () => {
    const labels = Object.values(CATEGORY_LABELS).map((v) => v.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ── CATEGORY_LABELS — known entries ───────────────────────────────────────────

describe('CATEGORY_LABELS — known entries', () => {
  it('"pessoal" has emoji "📸" and label "Pessoal"', () => {
    expect(CATEGORY_LABELS['pessoal']).toEqual({ emoji: '📸', label: 'Pessoal' });
  });

  it('"comemoração" has emoji "🎉" and label "Comemoração"', () => {
    expect(CATEGORY_LABELS['comemoração']).toEqual({ emoji: '🎉', label: 'Comemoração' });
  });

  it('"riso" has emoji "😂" and label "Riso"', () => {
    expect(CATEGORY_LABELS['riso']).toEqual({ emoji: '😂', label: 'Riso' });
  });

  it('"chorando" has emoji "😢" and label "Chorando"', () => {
    expect(CATEGORY_LABELS['chorando']).toEqual({ emoji: '😢', label: 'Chorando' });
  });

  it('"amor" has emoji "❤️" and label "Amor"', () => {
    expect(CATEGORY_LABELS['amor']).toEqual({ emoji: '❤️', label: 'Amor' });
  });

  it('"raiva" has emoji "😡" and label "Raiva"', () => {
    expect(CATEGORY_LABELS['raiva']).toEqual({ emoji: '😡', label: 'Raiva' });
  });

  it('"surpresa" has emoji "😲" and label "Surpresa"', () => {
    expect(CATEGORY_LABELS['surpresa']).toEqual({ emoji: '😲', label: 'Surpresa' });
  });

  it('"pensativo" has emoji "🤔" and label "Pensativo"', () => {
    expect(CATEGORY_LABELS['pensativo']).toEqual({ emoji: '🤔', label: 'Pensativo' });
  });

  it('"cumprimento" has emoji "👋" and label "Cumprimento"', () => {
    expect(CATEGORY_LABELS['cumprimento']).toEqual({ emoji: '👋', label: 'Cumprimento' });
  });

  it('"despedida" has emoji "👋" and label "Despedida"', () => {
    expect(CATEGORY_LABELS['despedida']).toEqual({ emoji: '👋', label: 'Despedida' });
  });

  it('"concordância" has emoji "👍" and label "Concordância"', () => {
    expect(CATEGORY_LABELS['concordância']).toEqual({ emoji: '👍', label: 'Concordância' });
  });

  it('"negação" has emoji "🙅" and label "Negação"', () => {
    expect(CATEGORY_LABELS['negação']).toEqual({ emoji: '🙅', label: 'Negação' });
  });

  it('"sono" has emoji "😴" and label "Sono"', () => {
    expect(CATEGORY_LABELS['sono']).toEqual({ emoji: '😴', label: 'Sono' });
  });

  it('"fome" has emoji "🍔" and label "Fome"', () => {
    expect(CATEGORY_LABELS['fome']).toEqual({ emoji: '🍔', label: 'Fome' });
  });

  it('"medo" has emoji "😨" and label "Medo"', () => {
    expect(CATEGORY_LABELS['medo']).toEqual({ emoji: '😨', label: 'Medo' });
  });

  it('"vergonha" has emoji "🙈" and label "Vergonha"', () => {
    expect(CATEGORY_LABELS['vergonha']).toEqual({ emoji: '🙈', label: 'Vergonha' });
  });

  it('"deboche" has emoji "😏" and label "Deboche"', () => {
    expect(CATEGORY_LABELS['deboche']).toEqual({ emoji: '😏', label: 'Deboche' });
  });

  it('"fofo" has emoji "🥰" and label "Fofo"', () => {
    expect(CATEGORY_LABELS['fofo']).toEqual({ emoji: '🥰', label: 'Fofo' });
  });

  it('"triste" has emoji "😔" and label "Triste"', () => {
    expect(CATEGORY_LABELS['triste']).toEqual({ emoji: '😔', label: 'Triste' });
  });

  it('"animado" has emoji "🤩" and label "Animado"', () => {
    expect(CATEGORY_LABELS['animado']).toEqual({ emoji: '🤩', label: 'Animado' });
  });

  it('"engraçado" has emoji "🤣" and label "Engraçado"', () => {
    expect(CATEGORY_LABELS['engraçado']).toEqual({ emoji: '🤣', label: 'Engraçado' });
  });

  it('"outros" has emoji "📦" and label "Outros"', () => {
    expect(CATEGORY_LABELS['outros']).toEqual({ emoji: '📦', label: 'Outros' });
  });

  it('"recebidas" has emoji "📥" and label "Recebidas"', () => {
    expect(CATEGORY_LABELS['recebidas']).toEqual({ emoji: '📥', label: 'Recebidas' });
  });

  it('"enviadas" has emoji "📤" and label "Enviadas"', () => {
    expect(CATEGORY_LABELS['enviadas']).toEqual({ emoji: '📤', label: 'Enviadas' });
  });
});

// ── ALL_CATEGORIES ────────────────────────────────────────────────────────────

describe('ALL_CATEGORIES', () => {
  it('is an array', () => {
    expect(Array.isArray(ALL_CATEGORIES)).toBe(true);
  });

  it('has 24 entries (same count as CATEGORY_LABELS keys)', () => {
    expect(ALL_CATEGORIES).toHaveLength(24);
  });

  it('equals Object.keys(CATEGORY_LABELS)', () => {
    expect(ALL_CATEGORIES).toEqual(Object.keys(CATEGORY_LABELS));
  });

  it('all entries are strings', () => {
    ALL_CATEGORIES.forEach((k) => expect(typeof k).toBe('string'));
  });

  it('contains "pessoal"', () => {
    expect(ALL_CATEGORIES).toContain('pessoal');
  });

  it('contains "outros"', () => {
    expect(ALL_CATEGORIES).toContain('outros');
  });

  it('contains "recebidas"', () => {
    expect(ALL_CATEGORIES).toContain('recebidas');
  });

  it('contains "enviadas"', () => {
    expect(ALL_CATEGORIES).toContain('enviadas');
  });

  it('contains "amor"', () => {
    expect(ALL_CATEGORIES).toContain('amor');
  });

  it('contains "riso"', () => {
    expect(ALL_CATEGORIES).toContain('riso');
  });

  it('all 24 expected keys are present', () => {
    const EXPECTED = [
      'pessoal', 'comemoração', 'riso', 'chorando', 'amor', 'raiva',
      'surpresa', 'pensativo', 'cumprimento', 'despedida', 'concordância',
      'negação', 'sono', 'fome', 'medo', 'vergonha', 'deboche', 'fofo',
      'triste', 'animado', 'engraçado', 'outros', 'recebidas', 'enviadas',
    ];
    EXPECTED.forEach((key) => expect(ALL_CATEGORIES).toContain(key));
  });
});
