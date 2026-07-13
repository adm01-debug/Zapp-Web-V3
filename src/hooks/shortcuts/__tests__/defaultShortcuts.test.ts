/**
 * Tests for DEFAULT_SHORTCUTS constant.
 *
 * Covered:
 *   - Array is non-empty with exactly 24 entries
 *   - All entries have required fields (id, name, description, defaultKey, defaultModifiers, category)
 *   - IDs are unique across the array
 *   - All categories belong to the allowed set
 *   - Specific shortcuts exist by id with correct key bindings
 *   - Modifier shape is always a plain object (never undefined)
 *   - Category distribution matches expected counts
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SHORTCUTS } from '../defaultShortcuts';

const VALID_CATEGORIES = ['chat', 'navigation', 'actions', 'selection'] as const;

describe('DEFAULT_SHORTCUTS — shape', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(DEFAULT_SHORTCUTS)).toBe(true);
    expect(DEFAULT_SHORTCUTS.length).toBeGreaterThan(0);
  });

  it('contains exactly 25 entries', () => {
    expect(DEFAULT_SHORTCUTS).toHaveLength(25);
  });

  it('every entry has id, name, description, defaultKey, defaultModifiers, category', () => {
    for (const s of DEFAULT_SHORTCUTS) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.name).toBe('string');
      expect(s.name.length).toBeGreaterThan(0);
      expect(typeof s.description).toBe('string');
      expect(s.description.length).toBeGreaterThan(0);
      expect(typeof s.defaultKey).toBe('string');
      expect(s.defaultKey.length).toBeGreaterThan(0);
      expect(typeof s.defaultModifiers).toBe('object');
      expect(s.defaultModifiers).not.toBeNull();
      expect(typeof s.category).toBe('string');
    }
  });

  it('all IDs are unique', () => {
    const ids = DEFAULT_SHORTCUTS.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all categories are from the allowed set', () => {
    for (const s of DEFAULT_SHORTCUTS) {
      expect(VALID_CATEGORIES).toContain(s.category as typeof VALID_CATEGORIES[number]);
    }
  });

  it('defaultModifiers is always a plain object (never null/undefined)', () => {
    for (const s of DEFAULT_SHORTCUTS) {
      expect(s.defaultModifiers).toBeDefined();
      expect(s.defaultModifiers).not.toBeNull();
    }
  });
});

describe('DEFAULT_SHORTCUTS — category distribution', () => {
  it('has 7 chat shortcuts', () => {
    expect(DEFAULT_SHORTCUTS.filter((s) => s.category === 'chat')).toHaveLength(7);
  });

  it('has 7 navigation shortcuts', () => {
    expect(DEFAULT_SHORTCUTS.filter((s) => s.category === 'navigation')).toHaveLength(7);
  });

  it('has 7 action shortcuts', () => {
    expect(DEFAULT_SHORTCUTS.filter((s) => s.category === 'actions')).toHaveLength(7);
  });

  it('has 4 selection shortcuts', () => {
    expect(DEFAULT_SHORTCUTS.filter((s) => s.category === 'selection')).toHaveLength(4);
  });
});

describe('DEFAULT_SHORTCUTS — specific entries', () => {
  function find(id: string) {
    return DEFAULT_SHORTCUTS.find((s) => s.id === id);
  }

  it('send-message uses Ctrl+Enter in chat category', () => {
    const s = find('send-message');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('Enter');
    expect(s?.defaultModifiers).toMatchObject({ ctrlKey: true });
    expect(s?.category).toBe('chat');
  });

  it('global-search uses Ctrl+K in navigation category', () => {
    const s = find('global-search');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('k');
    expect(s?.defaultModifiers).toMatchObject({ ctrlKey: true });
    expect(s?.category).toBe('navigation');
  });

  it('mark-resolved uses Ctrl+Shift+R in actions category', () => {
    const s = find('mark-resolved');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('r');
    expect(s?.defaultModifiers).toMatchObject({ ctrlKey: true, shiftKey: true });
    expect(s?.category).toBe('actions');
  });

  it('next-conversation uses Alt+ArrowDown in navigation category', () => {
    const s = find('next-conversation');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('ArrowDown');
    expect(s?.defaultModifiers).toMatchObject({ altKey: true });
    expect(s?.category).toBe('navigation');
  });

  it('select-all uses Ctrl+A in selection category', () => {
    const s = find('select-all');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('a');
    expect(s?.defaultModifiers).toMatchObject({ ctrlKey: true });
    expect(s?.category).toBe('selection');
  });

  it('clear-selection uses Escape with empty modifiers', () => {
    const s = find('clear-selection');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('Escape');
    expect(s?.defaultModifiers).toEqual({});
    expect(s?.category).toBe('selection');
  });

  it('focus-input uses / with no modifiers', () => {
    const s = find('focus-input');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('/');
    expect(s?.defaultModifiers).toEqual({});
    expect(s?.category).toBe('chat');
  });

  it('toggle-sidebar uses Ctrl+B in navigation category', () => {
    const s = find('toggle-sidebar');
    expect(s).toBeDefined();
    expect(s?.defaultKey).toBe('b');
    expect(s?.defaultModifiers).toMatchObject({ ctrlKey: true });
    expect(s?.category).toBe('navigation');
  });
});

describe('DEFAULT_SHORTCUTS — modifier consistency', () => {
  it('all entries with ctrlKey have it set to true', () => {
    for (const s of DEFAULT_SHORTCUTS) {
      if ('ctrlKey' in s.defaultModifiers) {
        expect(s.defaultModifiers.ctrlKey).toBe(true);
      }
    }
  });

  it('all entries with shiftKey have it set to true', () => {
    for (const s of DEFAULT_SHORTCUTS) {
      if ('shiftKey' in s.defaultModifiers) {
        expect(s.defaultModifiers.shiftKey).toBe(true);
      }
    }
  });

  it('entries with both ctrlKey and shiftKey exist (compound shortcuts)', () => {
    const compound = DEFAULT_SHORTCUTS.filter(
      (s) => s.defaultModifiers.ctrlKey && s.defaultModifiers.shiftKey
    );
    expect(compound.length).toBeGreaterThan(0);
  });
});
