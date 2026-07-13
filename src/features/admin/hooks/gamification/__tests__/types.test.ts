import { describe, it, expect } from 'vitest';
import { ACHIEVEMENT_TYPES } from '../types';

// ── ACHIEVEMENT_TYPES — structure ─────────────────────────────────────────────

describe('ACHIEVEMENT_TYPES — structure', () => {
  it('is a non-null object', () => {
    expect(typeof ACHIEVEMENT_TYPES).toBe('object');
    expect(ACHIEVEMENT_TYPES).not.toBeNull();
  });

  it('has exactly 12 keys', () => {
    expect(Object.keys(ACHIEVEMENT_TYPES)).toHaveLength(12);
  });

  it('all values are non-empty strings', () => {
    Object.values(ACHIEVEMENT_TYPES).forEach((v) => {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    });
  });

  it('all values are unique', () => {
    const values = Object.values(ACHIEVEMENT_TYPES);
    expect(new Set(values).size).toBe(values.length);
  });

  it('all values use snake_case format', () => {
    Object.values(ACHIEVEMENT_TYPES).forEach((v) => {
      expect(v).toMatch(/^[a-z][a-z_]*[a-z]$/);
    });
  });
});

// ── ACHIEVEMENT_TYPES — exact values ──────────────────────────────────────────

describe('ACHIEVEMENT_TYPES — exact values', () => {
  it('FAST_RESPONSE = "fast_response"', () => {
    expect(ACHIEVEMENT_TYPES.FAST_RESPONSE).toBe('fast_response');
  });

  it('SPEED_DEMON = "speed_demon"', () => {
    expect(ACHIEVEMENT_TYPES.SPEED_DEMON).toBe('speed_demon');
  });

  it('STREAK = "streak"', () => {
    expect(ACHIEVEMENT_TYPES.STREAK).toBe('streak');
  });

  it('STREAK_MASTER = "streak_master"', () => {
    expect(ACHIEVEMENT_TYPES.STREAK_MASTER).toBe('streak_master');
  });

  it('RESOLUTION = "resolution"', () => {
    expect(ACHIEVEMENT_TYPES.RESOLUTION).toBe('resolution');
  });

  it('PERFECT_RATING = "perfect_rating"', () => {
    expect(ACHIEVEMENT_TYPES.PERFECT_RATING).toBe('perfect_rating');
  });

  it('LEVEL_UP = "level_up"', () => {
    expect(ACHIEVEMENT_TYPES.LEVEL_UP).toBe('level_up');
  });

  it('DAILY_GOAL = "daily_goal"', () => {
    expect(ACHIEVEMENT_TYPES.DAILY_GOAL).toBe('daily_goal');
  });

  it('FIRST_MESSAGE = "first_message"', () => {
    expect(ACHIEVEMENT_TYPES.FIRST_MESSAGE).toBe('first_message');
  });

  it('FIRST_RESOLUTION = "first_resolution"', () => {
    expect(ACHIEVEMENT_TYPES.FIRST_RESOLUTION).toBe('first_resolution');
  });

  it('MESSAGE_MILESTONE = "message_milestone"', () => {
    expect(ACHIEVEMENT_TYPES.MESSAGE_MILESTONE).toBe('message_milestone');
  });

  it('TEAM_PLAYER = "team_player"', () => {
    expect(ACHIEVEMENT_TYPES.TEAM_PLAYER).toBe('team_player');
  });
});

// ── ACHIEVEMENT_TYPES — as const immutability ─────────────────────────────────

describe('ACHIEVEMENT_TYPES — as const', () => {
  it('values can be used as literals in comparisons', () => {
    const t: string = 'fast_response';
    expect(t === ACHIEVEMENT_TYPES.FAST_RESPONSE).toBe(true);
  });

  it('Object.values matches expected set of strings', () => {
    const EXPECTED = [
      'fast_response',
      'speed_demon',
      'streak',
      'streak_master',
      'resolution',
      'perfect_rating',
      'level_up',
      'daily_goal',
      'first_message',
      'first_resolution',
      'message_milestone',
      'team_player',
    ];
    const values = Object.values(ACHIEVEMENT_TYPES);
    EXPECTED.forEach((v) => expect(values).toContain(v));
    expect(values).toHaveLength(EXPECTED.length);
  });
});
