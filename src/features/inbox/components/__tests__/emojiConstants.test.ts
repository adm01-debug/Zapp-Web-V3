import { describe, it, expect } from 'vitest';
import {
  CATEGORY_LABELS,
  ALL_CATEGORIES,
  NATIVE_EMOJI_CATEGORIES,
} from '../emojiConstants';

// ── CATEGORY_LABELS ───────────────────────────────────────────────────────────

describe('CATEGORY_LABELS — structure', () => {
  it('is a non-null object', () => {
    expect(typeof CATEGORY_LABELS).toBe('object');
    expect(CATEGORY_LABELS).not.toBeNull();
  });

  it('has exactly 25 keys', () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(25);
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

describe('CATEGORY_LABELS — known entries', () => {
  it('"sorriso" has emoji "😊" and label "Sorriso"', () => {
    expect(CATEGORY_LABELS['sorriso']).toEqual({ emoji: '😊', label: 'Sorriso' });
  });

  it('"riso" has emoji "😂" and label "Riso"', () => {
    expect(CATEGORY_LABELS['riso']).toEqual({ emoji: '😂', label: 'Riso' });
  });

  it('"amor" has emoji "❤️" and label "Amor"', () => {
    expect(CATEGORY_LABELS['amor']).toEqual({ emoji: '❤️', label: 'Amor' });
  });

  it('"festa" has emoji "🎉" and label "Festa"', () => {
    expect(CATEGORY_LABELS['festa']).toEqual({ emoji: '🎉', label: 'Festa' });
  });

  it('"tech" has emoji "🤖" and label "Tech"', () => {
    expect(CATEGORY_LABELS['tech']).toEqual({ emoji: '🤖', label: 'Tech' });
  });

  it('"outros" has emoji "📦" and label "Outros"', () => {
    expect(CATEGORY_LABELS['outros']).toEqual({ emoji: '📦', label: 'Outros' });
  });

  it('"meme" has emoji "🔥" and label "Meme"', () => {
    expect(CATEGORY_LABELS['meme']).toEqual({ emoji: '🔥', label: 'Meme' });
  });
});

// ── ALL_CATEGORIES ─────────────────────────────────────────────────────────────

describe('ALL_CATEGORIES', () => {
  it('is an array', () => {
    expect(Array.isArray(ALL_CATEGORIES)).toBe(true);
  });

  it('equals Object.keys(CATEGORY_LABELS)', () => {
    expect(ALL_CATEGORIES).toEqual(Object.keys(CATEGORY_LABELS));
  });

  it('has 25 entries (same count as CATEGORY_LABELS keys)', () => {
    expect(ALL_CATEGORIES).toHaveLength(25);
  });

  it('all entries are strings', () => {
    ALL_CATEGORIES.forEach((k) => expect(typeof k).toBe('string'));
  });

  it('contains "sorriso"', () => {
    expect(ALL_CATEGORIES).toContain('sorriso');
  });

  it('contains "outros"', () => {
    expect(ALL_CATEGORIES).toContain('outros');
  });

  it('contains "tech"', () => {
    expect(ALL_CATEGORIES).toContain('tech');
  });
});

// ── NATIVE_EMOJI_CATEGORIES ───────────────────────────────────────────────────

describe('NATIVE_EMOJI_CATEGORIES — structure', () => {
  it('is an array', () => {
    expect(Array.isArray(NATIVE_EMOJI_CATEGORIES)).toBe(true);
  });

  it('has exactly 11 categories', () => {
    expect(NATIVE_EMOJI_CATEGORIES).toHaveLength(11);
  });

  it('all category ids are unique', () => {
    const ids = NATIVE_EMOJI_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every category has a non-empty id', () => {
    NATIVE_EMOJI_CATEGORIES.forEach((c) => {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
    });
  });

  it('every category has a non-empty icon string', () => {
    NATIVE_EMOJI_CATEGORIES.forEach((c) => {
      expect(typeof c.icon).toBe('string');
      expect(c.icon.length).toBeGreaterThan(0);
    });
  });

  it('every category has a non-empty label', () => {
    NATIVE_EMOJI_CATEGORIES.forEach((c) => {
      expect(typeof c.label).toBe('string');
      expect(c.label.length).toBeGreaterThan(0);
    });
  });

  it('every category has a non-empty emojis array', () => {
    NATIVE_EMOJI_CATEGORIES.forEach((c) => {
      expect(Array.isArray(c.emojis)).toBe(true);
      expect(c.emojis.length).toBeGreaterThan(0);
    });
  });

  it('every emoji in every category is a non-empty string', () => {
    NATIVE_EMOJI_CATEGORIES.forEach((c) => {
      c.emojis.forEach((e) => {
        expect(typeof e).toBe('string');
        expect(e.length).toBeGreaterThan(0);
      });
    });
  });
});

describe('NATIVE_EMOJI_CATEGORIES — known categories', () => {
  it('contains category with id "smileys"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'smileys')).toBe(true);
  });

  it('"smileys" has icon "😀" and label "Carinhas"', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'smileys')!;
    expect(c.icon).toBe('😀');
    expect(c.label).toBe('Carinhas');
  });

  it('"smileys" has at least 20 emojis', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'smileys')!;
    expect(c.emojis.length).toBeGreaterThanOrEqual(20);
  });

  it('contains category with id "gestures"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'gestures')).toBe(true);
  });

  it('"gestures" has icon "👋" and label "Mãos e Gestos"', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'gestures')!;
    expect(c.icon).toBe('👋');
    expect(c.label).toBe('Mãos e Gestos');
  });

  it('contains category with id "hearts"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'hearts')).toBe(true);
  });

  it('"hearts" has icon "❤️" and label "Corações e Amor"', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'hearts')!;
    expect(c.icon).toBe('❤️');
    expect(c.label).toBe('Corações e Amor');
  });

  it('contains category with id "animals"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'animals')).toBe(true);
  });

  it('"animals" has at least 50 emojis', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'animals')!;
    expect(c.emojis.length).toBeGreaterThanOrEqual(50);
  });

  it('contains category with id "food"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'food')).toBe(true);
  });

  it('"food" has icon "🍔" and label "Comida e Bebida"', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'food')!;
    expect(c.icon).toBe('🍔');
    expect(c.label).toBe('Comida e Bebida');
  });

  it('contains category with id "activities"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'activities')).toBe(true);
  });

  it('contains category with id "travel"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'travel')).toBe(true);
  });

  it('contains category with id "objects"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'objects')).toBe(true);
  });

  it('contains category with id "symbols"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'symbols')).toBe(true);
  });

  it('contains category with id "flags"', () => {
    expect(NATIVE_EMOJI_CATEGORIES.some((c) => c.id === 'flags')).toBe(true);
  });

  it('"flags" contains "🇧🇷"', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'flags')!;
    expect(c.emojis).toContain('🇧🇷');
  });

  it('"flags" contains "🇺🇸"', () => {
    const c = NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'flags')!;
    expect(c.emojis).toContain('🇺🇸');
  });
});

describe('NATIVE_EMOJI_CATEGORIES — smileys spot checks', () => {
  const getSmileys = () => NATIVE_EMOJI_CATEGORIES.find((c) => c.id === 'smileys')!;

  it('smileys contains "😀"', () => {
    expect(getSmileys().emojis).toContain('😀');
  });

  it('smileys contains "😭"', () => {
    expect(getSmileys().emojis).toContain('😭');
  });

  it('smileys contains "🤖"', () => {
    expect(getSmileys().emojis).toContain('🤖');
  });
});
