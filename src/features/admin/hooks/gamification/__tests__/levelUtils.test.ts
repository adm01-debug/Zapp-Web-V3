import { describe, it, expect } from 'vitest';
import { calculateLevel, xpForNextLevel, levelProgress } from '../levelUtils';

describe('calculateLevel', () => {
  it('returns level 1 for 0 XP', () => {
    expect(calculateLevel(0)).toBe(1);
  });

  it('returns level 1 for small XP (< threshold for level 2)', () => {
    // xpForNextLevel(1) = 1^2 * 50 = 50, so 49 XP → still level 1
    expect(calculateLevel(49)).toBe(1);
  });

  it('returns level 2 at exactly 50 XP', () => {
    expect(calculateLevel(50)).toBe(2);
  });

  it('returns level 3 at exactly 200 XP (2^2 * 50)', () => {
    expect(calculateLevel(200)).toBe(3);
  });

  it('returns level 4 at exactly 450 XP (3^2 * 50)', () => {
    expect(calculateLevel(450)).toBe(4);
  });

  it('returns at least 1 for non-negative XP', () => {
    expect(calculateLevel(0)).toBeGreaterThanOrEqual(1);
    expect(calculateLevel(1)).toBeGreaterThanOrEqual(1);
  });

  it('increases monotonically with XP', () => {
    const levels = [0, 50, 100, 200, 450, 800, 1250].map(calculateLevel);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });
});

describe('xpForNextLevel', () => {
  it('requires 0 XP for level 0 threshold', () => {
    expect(xpForNextLevel(0)).toBe(0);
  });

  it('requires 50 XP to enter level 2 (from level 1)', () => {
    expect(xpForNextLevel(1)).toBe(50);
  });

  it('requires 200 XP to enter level 3 (from level 2)', () => {
    expect(xpForNextLevel(2)).toBe(200);
  });

  it('requires 450 XP to enter level 4 (from level 3)', () => {
    expect(xpForNextLevel(3)).toBe(450);
  });

  it('is always level^2 * 50', () => {
    for (let lvl = 1; lvl <= 10; lvl++) {
      expect(xpForNextLevel(lvl)).toBe(lvl * lvl * 50);
    }
  });

  it('grows quadratically', () => {
    // Ratio test: xpForNextLevel(2) / xpForNextLevel(1) = 4
    expect(xpForNextLevel(2) / xpForNextLevel(1)).toBe(4);
  });
});

describe('levelProgress', () => {
  it('returns 0 when XP equals the current level XP floor', () => {
    // At exactly level 2 threshold (50 XP), progress to level 3 is 0%
    expect(levelProgress(50, 2)).toBeCloseTo(0, 5);
  });

  it('returns 100 when XP reaches the next level threshold', () => {
    // At exactly level 3 threshold (200 XP), progress from level 2 is 100%
    expect(levelProgress(200, 2)).toBeCloseTo(100, 5);
  });

  it('returns ~50% at the midpoint between levels', () => {
    // Level 2: floor=50, ceil=200, midpoint=125
    const progress = levelProgress(125, 2);
    expect(progress).toBeCloseTo(50, 5);
  });

  it('clamps to 0 when XP is below the level floor', () => {
    expect(levelProgress(0, 2)).toBe(0);
  });

  it('clamps to 100 when XP exceeds the next level threshold', () => {
    expect(levelProgress(9999, 2)).toBe(100);
  });

  it('is always between 0 and 100', () => {
    const samples = [0, 10, 50, 100, 200, 500, 1000];
    for (const xp of samples) {
      const p = levelProgress(xp, calculateLevel(xp));
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });
});
