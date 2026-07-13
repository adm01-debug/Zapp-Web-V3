import { describe, it, expect } from 'vitest';
import { classifyMetricStatus } from '../classifyMetricStatus';

// goodMax=2000, warningMax=4000 — typical FCP thresholds

describe('classifyMetricStatus — good (value < goodMax)', () => {
  it('returns "good" when value is 0', () => {
    expect(classifyMetricStatus(0, 2000, 4000)).toBe('good');
  });

  it('returns "good" when value is 1999 (just below goodMax)', () => {
    expect(classifyMetricStatus(1999, 2000, 4000)).toBe('good');
  });

  it('returns "good" when value equals goodMax - 0.1', () => {
    expect(classifyMetricStatus(1999.9, 2000, 4000)).toBe('good');
  });

  it('returns "good" for a small positive value', () => {
    expect(classifyMetricStatus(100, 2000, 4000)).toBe('good');
  });
});

describe('classifyMetricStatus — warning (goodMax <= value < warningMax)', () => {
  it('returns "warning" when value equals goodMax exactly', () => {
    expect(classifyMetricStatus(2000, 2000, 4000)).toBe('warning');
  });

  it('returns "warning" when value is 3999 (just below warningMax)', () => {
    expect(classifyMetricStatus(3999, 2000, 4000)).toBe('warning');
  });

  it('returns "warning" for mid-range value', () => {
    expect(classifyMetricStatus(3000, 2000, 4000)).toBe('warning');
  });

  it('returns "warning" when value equals warningMax - 0.1', () => {
    expect(classifyMetricStatus(3999.9, 2000, 4000)).toBe('warning');
  });
});

describe('classifyMetricStatus — critical (value >= warningMax)', () => {
  it('returns "critical" when value equals warningMax exactly', () => {
    expect(classifyMetricStatus(4000, 2000, 4000)).toBe('critical');
  });

  it('returns "critical" when value exceeds warningMax', () => {
    expect(classifyMetricStatus(10000, 2000, 4000)).toBe('critical');
  });

  it('returns "critical" for very large values', () => {
    expect(classifyMetricStatus(999999, 2000, 4000)).toBe('critical');
  });
});

describe('classifyMetricStatus — different threshold sets', () => {
  it('TTFB-style: 0.8s / 1.8s thresholds — good at 0.5', () => {
    expect(classifyMetricStatus(500, 800, 1800)).toBe('good');
  });

  it('TTFB-style: 0.8s / 1.8s thresholds — warning at 1.0s', () => {
    expect(classifyMetricStatus(1000, 800, 1800)).toBe('warning');
  });

  it('TTFB-style: 0.8s / 1.8s thresholds — critical at 2.0s', () => {
    expect(classifyMetricStatus(2000, 800, 1800)).toBe('critical');
  });

  it('works when goodMax and warningMax are equal (collapses warning tier)', () => {
    expect(classifyMetricStatus(999, 1000, 1000)).toBe('good');
    expect(classifyMetricStatus(1000, 1000, 1000)).toBe('critical');
  });

  it('works with decimal thresholds', () => {
    expect(classifyMetricStatus(0.5, 1.0, 2.0)).toBe('good');
    expect(classifyMetricStatus(1.5, 1.0, 2.0)).toBe('warning');
    expect(classifyMetricStatus(2.5, 1.0, 2.0)).toBe('critical');
  });
});
