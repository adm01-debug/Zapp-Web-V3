import { describe, it, expect } from 'vitest';
import { TOOLTIP_STYLE, AXIS_PROPS, GRID_PROPS } from '../chartConfig';

// ── TOOLTIP_STYLE ─────────────────────────────────────────────────────────────

describe('TOOLTIP_STYLE', () => {
  it('is a non-null object', () => {
    expect(typeof TOOLTIP_STYLE).toBe('object');
    expect(TOOLTIP_STYLE).not.toBeNull();
  });

  it('has a backgroundColor property', () => {
    expect(TOOLTIP_STYLE.backgroundColor).toBeDefined();
    expect(typeof TOOLTIP_STYLE.backgroundColor).toBe('string');
    expect(TOOLTIP_STYLE.backgroundColor.length).toBeGreaterThan(0);
  });

  it('backgroundColor references the --card CSS variable', () => {
    expect(TOOLTIP_STYLE.backgroundColor).toContain('--card');
  });

  it('has a border property', () => {
    expect(typeof TOOLTIP_STYLE.border).toBe('string');
    expect(TOOLTIP_STYLE.border.length).toBeGreaterThan(0);
  });

  it('border references the --border CSS variable', () => {
    expect(TOOLTIP_STYLE.border).toContain('--border');
  });

  it('has a borderRadius property', () => {
    expect(typeof TOOLTIP_STYLE.borderRadius).toBe('string');
    expect(TOOLTIP_STYLE.borderRadius.length).toBeGreaterThan(0);
  });

  it('borderRadius is "8px"', () => {
    expect(TOOLTIP_STYLE.borderRadius).toBe('8px');
  });

  it('has a color property', () => {
    expect(typeof TOOLTIP_STYLE.color).toBe('string');
    expect(TOOLTIP_STYLE.color.length).toBeGreaterThan(0);
  });

  it('color references the --foreground CSS variable', () => {
    expect(TOOLTIP_STYLE.color).toContain('--foreground');
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(TOOLTIP_STYLE)).toHaveLength(4);
  });
});

// ── AXIS_PROPS ─────────────────────────────────────────────────────────────────

describe('AXIS_PROPS', () => {
  it('is a non-null object', () => {
    expect(typeof AXIS_PROPS).toBe('object');
    expect(AXIS_PROPS).not.toBeNull();
  });

  it('has a stroke property referencing --muted-foreground', () => {
    expect(typeof AXIS_PROPS.stroke).toBe('string');
    expect(AXIS_PROPS.stroke).toContain('--muted-foreground');
  });

  it('has fontSize of 12', () => {
    expect(AXIS_PROPS.fontSize).toBe(12);
  });

  it('has tickLine set to false', () => {
    expect(AXIS_PROPS.tickLine).toBe(false);
  });

  it('has axisLine set to false', () => {
    expect(AXIS_PROPS.axisLine).toBe(false);
  });

  it('has exactly 4 keys', () => {
    expect(Object.keys(AXIS_PROPS)).toHaveLength(4);
  });
});

// ── GRID_PROPS ────────────────────────────────────────────────────────────────

describe('GRID_PROPS', () => {
  it('is a non-null object', () => {
    expect(typeof GRID_PROPS).toBe('object');
    expect(GRID_PROPS).not.toBeNull();
  });

  it('has a strokeDasharray of "3 3"', () => {
    expect(GRID_PROPS.strokeDasharray).toBe('3 3');
  });

  it('has a stroke property referencing --border', () => {
    expect(typeof GRID_PROPS.stroke).toBe('string');
    expect(GRID_PROPS.stroke).toContain('--border');
  });

  it('has opacity of 0.3', () => {
    expect(GRID_PROPS.opacity).toBe(0.3);
  });

  it('opacity is between 0 and 1 (exclusive)', () => {
    expect(GRID_PROPS.opacity).toBeGreaterThan(0);
    expect(GRID_PROPS.opacity).toBeLessThan(1);
  });

  it('has exactly 3 keys', () => {
    expect(Object.keys(GRID_PROPS)).toHaveLength(3);
  });
});
