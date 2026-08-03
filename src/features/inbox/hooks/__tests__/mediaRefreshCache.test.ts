import { describe, it, expect, beforeEach } from 'vitest';
import {
  mediaCacheGet,
  mediaCacheSet,
  mediaCacheStats,
  mediaCacheClear,
  mediaCacheConfigure,
} from '../mediaRefreshCache';

/**
 * F4-20: refreshCache agora é um LRU com maxSize (bytes) + cap de entradas.
 * Estes testes cobrem eviction LRU, promoção por get, budget de bytes e
 * overwrite sem duplicação de contagem.
 */

describe('mediaRefreshCache', () => {
  beforeEach(() => {
    mediaCacheClear();
  });

  it('stores and retrieves values', () => {
    mediaCacheSet('a', 'data:image/png;base64,AAAA');
    expect(mediaCacheGet('a')).toBe('data:image/png;base64,AAAA');
  });

  it('returns undefined for missing keys', () => {
    expect(mediaCacheGet('missing')).toBeUndefined();
    expect(mediaCacheStats()).toEqual({ entries: 0, bytes: 0 });
  });

  it('evicts the least-recently-inserted entry when over the entry cap', () => {
    mediaCacheConfigure({ maxEntries: 3 });
    mediaCacheSet('a', 'x');
    mediaCacheSet('b', 'y');
    mediaCacheSet('c', 'z');
    mediaCacheSet('d', 'w'); // estoura o cap → evicta 'a' (LRU)

    expect(mediaCacheGet('a')).toBeUndefined();
    expect(mediaCacheGet('b')).toBe('y');
    expect(mediaCacheGet('c')).toBe('z');
    expect(mediaCacheGet('d')).toBe('w');
    expect(mediaCacheStats().entries).toBe(3);
  });

  it('promotes accessed keys to MRU (real LRU behavior)', () => {
    mediaCacheConfigure({ maxEntries: 3 });
    mediaCacheSet('a', 'x');
    mediaCacheSet('b', 'y');
    mediaCacheSet('c', 'z');
    mediaCacheGet('a'); // promove 'a' para MRU

    mediaCacheSet('d', 'w'); // estoura o cap → evicta 'b' (agora o LRU)

    expect(mediaCacheGet('b')).toBeUndefined();
    expect(mediaCacheGet('a')).toBe('x');
    expect(mediaCacheGet('c')).toBe('z');
    expect(mediaCacheGet('d')).toBe('w');
  });

  it('evicts by byte budget (maxSize)', () => {
    mediaCacheConfigure({ maxBytes: 100 });
    mediaCacheSet('a', 'x'.repeat(60)); // 60 bytes
    mediaCacheSet('b', 'y'.repeat(60)); // 60 bytes → 120 > 100 → evicta 'a'

    expect(mediaCacheGet('a')).toBeUndefined();
    expect(mediaCacheGet('b')).toBe('y'.repeat(60));
    expect(mediaCacheStats().bytes).toBe(60);
  });

  it('byte budget eviction keeps the most recent entries', () => {
    mediaCacheConfigure({ maxBytes: 100 });
    mediaCacheSet('a', 'x'.repeat(40));
    mediaCacheSet('b', 'y'.repeat(40));
    mediaCacheSet('c', 'z'.repeat(40)); // 120 > 100 → evicta 'a' (LRU)

    expect(mediaCacheGet('a')).toBeUndefined();
    expect(mediaCacheGet('b')).toBe('y'.repeat(40));
    expect(mediaCacheGet('c')).toBe('z'.repeat(40));
  });

  it('overwrite does not duplicate entries or bytes', () => {
    mediaCacheSet('a', 'x'.repeat(50));
    mediaCacheSet('a', 'y'.repeat(10)); // overwrite

    expect(mediaCacheStats()).toEqual({ entries: 1, bytes: 10 });
    expect(mediaCacheGet('a')).toBe('y'.repeat(10));
  });

  it('overwrite promotes the key to MRU', () => {
    mediaCacheConfigure({ maxEntries: 2 });
    mediaCacheSet('a', 'x');
    mediaCacheSet('b', 'y');
    mediaCacheSet('a', 'x2'); // overwrite → 'a' vira MRU

    mediaCacheSet('c', 'z'); // estoura o cap → evicta 'b'

    expect(mediaCacheGet('b')).toBeUndefined();
    expect(mediaCacheGet('a')).toBe('x2');
    expect(mediaCacheGet('c')).toBe('z');
  });

  it('clear resets stats and restores default limits', () => {
    mediaCacheConfigure({ maxBytes: 10, maxEntries: 2 });
    mediaCacheSet('a', 'x');
    mediaCacheSet('b', 'y');
    mediaCacheClear();

    expect(mediaCacheStats()).toEqual({ entries: 0, bytes: 0 });
    // Limites padrão restaurados: 200 entradas cabem sem eviction.
    for (let i = 0; i < 200; i += 1) mediaCacheSet(`k${i}`, 'v');
    expect(mediaCacheStats().entries).toBe(200);
  });
});
