import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  safeGetJSON,
  safeSetJSON,
} from '@/lib/safeStorage';

beforeEach(() => {
  localStorage.clear();
});

// ── safeGetItem ───────────────────────────────────────────────────────────────

describe('safeGetItem', () => {
  it('returns null when key does not exist', () => {
    expect(safeGetItem('missing')).toBeNull();
  });

  it('returns the stored string value', () => {
    localStorage.setItem('k', 'hello');
    expect(safeGetItem('k')).toBe('hello');
  });

  it('returns null when localStorage.getItem throws', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage access denied');
    });
    try {
      expect(safeGetItem('k')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

// ── safeSetItem ───────────────────────────────────────────────────────────────

describe('safeSetItem', () => {
  it('stores a value and returns true', () => {
    const result = safeSetItem('k', 'v');
    expect(result).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('overwrites an existing value', () => {
    localStorage.setItem('k', 'old');
    safeSetItem('k', 'new');
    expect(localStorage.getItem('k')).toBe('new');
  });

  it('returns false when localStorage.setItem throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(safeSetItem('k', 'v')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => safeSetItem('k', 'v')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// ── safeRemoveItem ────────────────────────────────────────────────────────────

describe('safeRemoveItem', () => {
  it('removes an existing key and returns true', () => {
    localStorage.setItem('k', 'v');
    expect(safeRemoveItem('k')).toBe(true);
    expect(localStorage.getItem('k')).toBeNull();
  });

  it('returns true even when key does not exist', () => {
    expect(safeRemoveItem('nonexistent')).toBe(true);
  });

  it('returns false when localStorage.removeItem throws', () => {
    const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage error');
    });
    try {
      expect(safeRemoveItem('k')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not throw when localStorage.removeItem throws', () => {
    const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('storage error');
    });
    try {
      expect(() => safeRemoveItem('k')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// ── safeGetJSON ───────────────────────────────────────────────────────────────

describe('safeGetJSON', () => {
  it('returns fallback when key does not exist', () => {
    expect(safeGetJSON('missing', 42)).toBe(42);
  });

  it('parses a stored JSON object', () => {
    localStorage.setItem('obj', JSON.stringify({ a: 1 }));
    expect(safeGetJSON('obj', null)).toEqual({ a: 1 });
  });

  it('parses a stored JSON array', () => {
    localStorage.setItem('arr', JSON.stringify([1, 2, 3]));
    expect(safeGetJSON('arr', [])).toEqual([1, 2, 3]);
  });

  it('returns fallback when value is not valid JSON', () => {
    localStorage.setItem('bad', '{invalid json}');
    expect(safeGetJSON('bad', 'default')).toBe('default');
  });

  it('returns fallback when localStorage.getItem throws', () => {
    const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage error');
    });
    try {
      expect(safeGetJSON('k', 'fb')).toBe('fb');
    } finally {
      spy.mockRestore();
    }
  });

  it('returns fallback for an absent key (null from storage)', () => {
    expect(safeGetJSON('absent-key', { x: 0 })).toEqual({ x: 0 });
  });
});

// ── safeSetJSON ───────────────────────────────────────────────────────────────

describe('safeSetJSON', () => {
  it('stores a JSON-serialised object and returns true', () => {
    const result = safeSetJSON('k', { foo: 'bar' });
    expect(result).toBe(true);
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ foo: 'bar' });
  });

  it('stores a JSON array', () => {
    safeSetJSON('arr', [1, 2, 3]);
    expect(JSON.parse(localStorage.getItem('arr')!)).toEqual([1, 2, 3]);
  });

  it('stores a primitive number', () => {
    safeSetJSON('n', 99);
    expect(JSON.parse(localStorage.getItem('n')!)).toBe(99);
  });

  it('stores a boolean', () => {
    safeSetJSON('b', true);
    expect(JSON.parse(localStorage.getItem('b')!)).toBe(true);
  });

  it('returns false when localStorage.setItem throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(safeSetJSON('k', {})).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(() => safeSetJSON('k', {})).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

// ── round-trip ────────────────────────────────────────────────────────────────

describe('safeSetJSON / safeGetJSON round-trip', () => {
  it('object survives a round-trip', () => {
    const original = { name: 'Alice', age: 30, active: true };
    safeSetJSON('rt', original);
    expect(safeGetJSON('rt', null)).toEqual(original);
  });

  it('nested object survives a round-trip', () => {
    const original = { a: { b: { c: [1, 2, 3] } } };
    safeSetJSON('nested', original);
    expect(safeGetJSON('nested', null)).toEqual(original);
  });
});
