import { describe, it, expect } from 'vitest';
import {
  emojiDatabase,
  getAllEmojis,
  searchEmojis,
  EMOJI_CATEGORY_KEYS,
} from '../emojiDatabase';

// ── emojiDatabase structure ────────────────────────────────────────────────

describe('emojiDatabase — structure', () => {
  it('is a non-null object', () => {
    expect(typeof emojiDatabase).toBe('object');
    expect(emojiDatabase).not.toBeNull();
  });

  it('has exactly 11 categories', () => {
    expect(Object.keys(emojiDatabase)).toHaveLength(11);
  });

  it('each category has a non-empty label string', () => {
    Object.values(emojiDatabase).forEach((cat) => {
      expect(typeof cat.label).toBe('string');
      expect(cat.label.length).toBeGreaterThan(0);
    });
  });

  it('each category has a non-empty icon string', () => {
    Object.values(emojiDatabase).forEach((cat) => {
      expect(typeof cat.icon).toBe('string');
      expect(cat.icon.length).toBeGreaterThan(0);
    });
  });

  it('each category has a non-empty emojis array', () => {
    Object.values(emojiDatabase).forEach((cat) => {
      expect(Array.isArray(cat.emojis)).toBe(true);
      expect(cat.emojis.length).toBeGreaterThan(0);
    });
  });

  it('every emoji entry has a non-empty emoji string', () => {
    Object.values(emojiDatabase).forEach((cat) => {
      cat.emojis.forEach((entry) => {
        expect(typeof entry.emoji).toBe('string');
        expect(entry.emoji.length).toBeGreaterThan(0);
      });
    });
  });

  it('every emoji entry has a non-empty keywords array with string items', () => {
    Object.values(emojiDatabase).forEach((cat) => {
      cat.emojis.forEach((entry) => {
        expect(Array.isArray(entry.keywords)).toBe(true);
        expect(entry.keywords.length).toBeGreaterThan(0);
        entry.keywords.forEach((kw) => expect(typeof kw).toBe('string'));
      });
    });
  });
});

describe('emojiDatabase — known categories', () => {
  it('contains "smileys" category', () => {
    expect(emojiDatabase.smileys).toBeDefined();
    expect(emojiDatabase.smileys.label).toBe('Rostos');
  });

  it('contains "flags" category', () => {
    expect(emojiDatabase.flags).toBeDefined();
    expect(emojiDatabase.flags.label).toBe('Bandeiras');
  });

  it('contains "gestures" category', () => {
    expect(emojiDatabase.gestures).toBeDefined();
  });

  it('contains "hearts" category', () => {
    expect(emojiDatabase.hearts).toBeDefined();
  });

  it('contains "animals" category', () => {
    expect(emojiDatabase.animals).toBeDefined();
  });

  it('contains "food" category', () => {
    expect(emojiDatabase.food).toBeDefined();
  });

  it('contains "celebration" category', () => {
    expect(emojiDatabase.celebration).toBeDefined();
  });
});

// ── EMOJI_CATEGORY_KEYS ────────────────────────────────────────────────────

describe('EMOJI_CATEGORY_KEYS', () => {
  it('is an array', () => {
    expect(Array.isArray(EMOJI_CATEGORY_KEYS)).toBe(true);
  });

  it('equals Object.keys(emojiDatabase)', () => {
    expect(EMOJI_CATEGORY_KEYS).toEqual(Object.keys(emojiDatabase));
  });

  it('has the same length as the number of categories', () => {
    expect(EMOJI_CATEGORY_KEYS).toHaveLength(Object.keys(emojiDatabase).length);
  });

  it('all entries are strings', () => {
    EMOJI_CATEGORY_KEYS.forEach((k) => expect(typeof k).toBe('string'));
  });

  it('contains "smileys"', () => {
    expect(EMOJI_CATEGORY_KEYS).toContain('smileys');
  });

  it('contains "flags"', () => {
    expect(EMOJI_CATEGORY_KEYS).toContain('flags');
  });
});

// ── getAllEmojis ───────────────────────────────────────────────────────────

describe('getAllEmojis — basic', () => {
  it('returns an array', () => {
    expect(Array.isArray(getAllEmojis())).toBe(true);
  });

  it('returns all emojis (flattened across categories)', () => {
    const expectedTotal = Object.values(emojiDatabase).reduce(
      (sum, cat) => sum + cat.emojis.length,
      0
    );
    expect(getAllEmojis()).toHaveLength(expectedTotal);
  });

  it('has more than 100 entries', () => {
    expect(getAllEmojis().length).toBeGreaterThan(100);
  });

  it('every entry has emoji and keywords fields', () => {
    getAllEmojis().forEach((entry) => {
      expect(typeof entry.emoji).toBe('string');
      expect(Array.isArray(entry.keywords)).toBe(true);
    });
  });

  it('returns a stable reference on repeated calls (cache)', () => {
    const a = getAllEmojis();
    const b = getAllEmojis();
    expect(a).toBe(b);
  });

  it('includes an emoji from smileys category', () => {
    const allEmojis = getAllEmojis().map((e) => e.emoji);
    expect(allEmojis).toContain('😀');
  });

  it('includes an emoji from flags category', () => {
    const allEmojis = getAllEmojis().map((e) => e.emoji);
    expect(allEmojis).toContain('🇧🇷');
  });
});

// ── searchEmojis ───────────────────────────────────────────────────────────

describe('searchEmojis — empty / blank', () => {
  it('returns [] for an empty string', () => {
    expect(searchEmojis('')).toEqual([]);
  });

  it('returns [] for a whitespace-only string', () => {
    expect(searchEmojis('   ')).toEqual([]);
  });

  it('returns [] for a tab character', () => {
    expect(searchEmojis('\t')).toEqual([]);
  });
});

describe('searchEmojis — keyword matching', () => {
  it('finds emojis by Portuguese keyword "feliz"', () => {
    const results = searchEmojis('feliz');
    expect(results.length).toBeGreaterThan(0);
    results.forEach((r) =>
      expect(r.keywords.some((kw) => kw.includes('feliz'))).toBe(true)
    );
  });

  it('finds emojis by keyword "amor"', () => {
    const results = searchEmojis('amor');
    expect(results.length).toBeGreaterThan(0);
  });

  it('finds emojis by keyword "brasil"', () => {
    const results = searchEmojis('brasil');
    expect(results.length).toBeGreaterThan(0);
    const emojis = results.map((r) => r.emoji);
    expect(emojis).toContain('🇧🇷');
  });

  it('finds emojis by English keyword "happy"', () => {
    const results = searchEmojis('happy');
    expect(results.length).toBeGreaterThan(0);
  });

  it('finds emojis by keyword "pizza"', () => {
    const results = searchEmojis('pizza');
    expect(results.length).toBeGreaterThan(0);
    const emojis = results.map((r) => r.emoji);
    expect(emojis).toContain('🍕');
  });

  it('returns [] for a completely unrecognised query', () => {
    const results = searchEmojis('xyzzynonexistentkeyword99999');
    expect(results).toEqual([]);
  });
});

describe('searchEmojis — case insensitivity', () => {
  it('matches lowercase keywords with uppercase query', () => {
    const lower = searchEmojis('feliz');
    const upper = searchEmojis('FELIZ');
    expect(upper.length).toBe(lower.length);
    expect(upper.map((r) => r.emoji)).toEqual(lower.map((r) => r.emoji));
  });

  it('matches with mixed case query', () => {
    const mixed = searchEmojis('FeLiZ');
    const base = searchEmojis('feliz');
    expect(mixed.length).toBe(base.length);
  });
});

describe('searchEmojis — diacritic normalisation', () => {
  it('finds emojis with accented keyword when query has no accent', () => {
    // 'coração' → keyword in hearts; query 'coracao' should match after NFD normalisation
    const results = searchEmojis('coracao');
    expect(results.length).toBeGreaterThan(0);
  });

  it('finds emojis when query has accent and keyword does too', () => {
    const results = searchEmojis('coração');
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('searchEmojis — emoji character matching', () => {
  it('returns the entry when querying the emoji character directly', () => {
    const results = searchEmojis('😀');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.emoji === '😀')).toBe(true);
  });

  it('returns the flag entry when querying the flag emoji directly', () => {
    const results = searchEmojis('🇧🇷');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.emoji === '🇧🇷')).toBe(true);
  });
});

describe('searchEmojis — result shape', () => {
  it('each result has emoji and keywords', () => {
    const results = searchEmojis('feliz');
    results.forEach((r) => {
      expect(typeof r.emoji).toBe('string');
      expect(Array.isArray(r.keywords)).toBe(true);
    });
  });

  it('does not return duplicates for a broad query', () => {
    const results = searchEmojis('bandeira');
    const emojis = results.map((r) => r.emoji);
    expect(new Set(emojis).size).toBe(emojis.length);
  });

  it('partial keyword match — "sorri" matches keywords containing "sorriso"', () => {
    const results = searchEmojis('sorri');
    expect(results.length).toBeGreaterThan(0);
  });
});
