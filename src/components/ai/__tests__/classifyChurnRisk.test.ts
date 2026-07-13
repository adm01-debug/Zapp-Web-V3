import { describe, it, expect } from 'vitest';
import { classifyChurnRisk } from '../classifyChurnRisk';

// ── classifyChurnRisk ─────────────────────────────────────────────────────────

describe('classifyChurnRisk — critical tier (score >= 80)', () => {
  it('returns "critical" for score 80 (lower boundary)', () => {
    expect(classifyChurnRisk(80)).toBe('critical');
  });

  it('returns "critical" for score 100 (maximum)', () => {
    expect(classifyChurnRisk(100)).toBe('critical');
  });

  it('returns "critical" for score 95', () => {
    expect(classifyChurnRisk(95)).toBe('critical');
  });
});

describe('classifyChurnRisk — high tier (60 <= score < 80)', () => {
  it('returns "high" for score 60 (lower boundary)', () => {
    expect(classifyChurnRisk(60)).toBe('high');
  });

  it('returns "high" for score 79 (upper boundary)', () => {
    expect(classifyChurnRisk(79)).toBe('high');
  });

  it('returns "high" for score 70', () => {
    expect(classifyChurnRisk(70)).toBe('high');
  });
});

describe('classifyChurnRisk — medium tier (30 <= score < 60)', () => {
  it('returns "medium" for score 30 (lower boundary)', () => {
    expect(classifyChurnRisk(30)).toBe('medium');
  });

  it('returns "medium" for score 59 (upper boundary)', () => {
    expect(classifyChurnRisk(59)).toBe('medium');
  });

  it('returns "medium" for score 45', () => {
    expect(classifyChurnRisk(45)).toBe('medium');
  });
});

describe('classifyChurnRisk — low tier (score < 30)', () => {
  it('returns "low" for score 0 (minimum)', () => {
    expect(classifyChurnRisk(0)).toBe('low');
  });

  it('returns "low" for score 29 (upper boundary)', () => {
    expect(classifyChurnRisk(29)).toBe('low');
  });

  it('returns "low" for score 10', () => {
    expect(classifyChurnRisk(10)).toBe('low');
  });
});

describe('classifyChurnRisk — boundary precision', () => {
  it('score 79.9 is "high" (below 80)', () => {
    expect(classifyChurnRisk(79.9)).toBe('high');
  });

  it('score 80.0 is "critical"', () => {
    expect(classifyChurnRisk(80.0)).toBe('critical');
  });

  it('score 29.9 is "low" (below 30)', () => {
    expect(classifyChurnRisk(29.9)).toBe('low');
  });

  it('score 30.0 is "medium"', () => {
    expect(classifyChurnRisk(30.0)).toBe('medium');
  });

  it('score 59.9 is "medium" (below 60)', () => {
    expect(classifyChurnRisk(59.9)).toBe('medium');
  });

  it('score 60.0 is "high"', () => {
    expect(classifyChurnRisk(60.0)).toBe('high');
  });
});
