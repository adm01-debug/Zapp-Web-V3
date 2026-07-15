import { describe, it, expect } from 'vitest';
import {
  buildVariants,
  DEFAULT_EASE,
  DEFAULT_DURATION,
  REDUCED_MOTION_TRANSITION,
  REDUCED_MOTION_VARIANTS,
  type TransitionVariantName,
} from '../transitionVariants';

// ── constants ─────────────────────────────────────────────────────────────────

describe('DEFAULT_EASE', () => {
  it('is an array of 4 numbers', () => {
    expect(Array.isArray(DEFAULT_EASE)).toBe(true);
    expect((DEFAULT_EASE as unknown as number[]).length).toBe(4);
  });
});

describe('DEFAULT_DURATION', () => {
  it('is 0.3', () => {
    expect(DEFAULT_DURATION).toBe(0.3);
  });
});

describe('REDUCED_MOTION_TRANSITION', () => {
  it('has a very short duration', () => {
    expect(REDUCED_MOTION_TRANSITION.duration).toBe(0.01);
  });
});

describe('REDUCED_MOTION_VARIANTS', () => {
  it('has initial, animate, exit keys', () => {
    expect(REDUCED_MOTION_VARIANTS.initial).toBeDefined();
    expect(REDUCED_MOTION_VARIANTS.animate).toBeDefined();
    expect(REDUCED_MOTION_VARIANTS.exit).toBeDefined();
  });

  it('initial and exit have opacity 0, animate has opacity 1', () => {
    expect((REDUCED_MOTION_VARIANTS.initial as Record<string, unknown>).opacity).toBe(0);
    expect((REDUCED_MOTION_VARIANTS.animate as Record<string, unknown>).opacity).toBe(1);
    expect((REDUCED_MOTION_VARIANTS.exit as Record<string, unknown>).opacity).toBe(0);
  });
});

// ── buildVariants — return shape ──────────────────────────────────────────────

const ALL_NAMES: TransitionVariantName[] = [
  'fade', 'slide-x', 'slide-y', 'zoom', 'flip-x', 'flip-y', 'parallax',
];

describe('buildVariants — return shape', () => {
  it.each(ALL_NAMES)('"%s" returns an object with variants and transition', (name) => {
    const result = buildVariants(name);
    expect(result).toHaveProperty('variants');
    expect(result).toHaveProperty('transition');
  });

  it.each(ALL_NAMES)('"%s" variants has initial, animate, exit', (name) => {
    const { variants } = buildVariants(name);
    expect(variants).toHaveProperty('initial');
    expect(variants).toHaveProperty('animate');
    expect(variants).toHaveProperty('exit');
  });

  it.each(ALL_NAMES)('"%s" animate.opacity is 1', (name) => {
    const { variants } = buildVariants(name);
    expect((variants.animate as Record<string, unknown>).opacity).toBe(1);
  });

  it.each(ALL_NAMES)('"%s" transition uses DEFAULT_DURATION by default', (name) => {
    const { transition } = buildVariants(name);
    expect(transition.duration).toBe(DEFAULT_DURATION);
  });
});

// ── buildVariants — fade ──────────────────────────────────────────────────────

describe('buildVariants — fade', () => {
  it('initial.opacity defaults to 0', () => {
    const { variants } = buildVariants('fade');
    expect((variants.initial as Record<string, unknown>).opacity).toBe(0);
  });

  it('exit.opacity defaults to 0', () => {
    const { variants } = buildVariants('fade');
    expect((variants.exit as Record<string, unknown>).opacity).toBe(0);
  });

  it('respects custom opacity override', () => {
    const { variants } = buildVariants('fade', { opacity: 0.2 });
    expect((variants.initial as Record<string, unknown>).opacity).toBe(0.2);
    expect((variants.exit as Record<string, unknown>).opacity).toBe(0.2);
  });

  it('does not include x or y in fade variants', () => {
    const { variants } = buildVariants('fade');
    expect((variants.initial as Record<string, unknown>).x).toBeUndefined();
    expect((variants.initial as Record<string, unknown>).y).toBeUndefined();
  });
});

// ── buildVariants — slide-x ───────────────────────────────────────────────────

describe('buildVariants — slide-x', () => {
  it('default direction "right": initial.x is positive', () => {
    const { variants } = buildVariants('slide-x');
    expect((variants.initial as Record<string, unknown>).x).toBeGreaterThan(0);
  });

  it('default direction "right": exit.x is negative', () => {
    const { variants } = buildVariants('slide-x');
    expect((variants.exit as Record<string, unknown>).x).toBeLessThan(0);
  });

  it('direction "left": initial.x is negative', () => {
    const { variants } = buildVariants('slide-x', { direction: 'left' });
    expect((variants.initial as Record<string, unknown>).x).toBeLessThan(0);
  });

  it('direction "left": exit.x is positive', () => {
    const { variants } = buildVariants('slide-x', { direction: 'left' });
    expect((variants.exit as Record<string, unknown>).x).toBeGreaterThan(0);
  });

  it('animate.x is 0', () => {
    const { variants } = buildVariants('slide-x');
    expect((variants.animate as Record<string, unknown>).x).toBe(0);
  });

  it('distance override changes x magnitude', () => {
    const { variants } = buildVariants('slide-x', { distance: 100 });
    expect((variants.initial as Record<string, unknown>).x).toBe(100);
  });
});

// ── buildVariants — slide-y ───────────────────────────────────────────────────

describe('buildVariants — slide-y', () => {
  it('default direction "up": initial.y is negative', () => {
    const { variants } = buildVariants('slide-y');
    expect((variants.initial as Record<string, unknown>).y).toBeLessThan(0);
  });

  it('default direction "up": exit.y is positive', () => {
    const { variants } = buildVariants('slide-y');
    expect((variants.exit as Record<string, unknown>).y).toBeGreaterThan(0);
  });

  it('direction "down": initial.y is positive', () => {
    const { variants } = buildVariants('slide-y', { direction: 'down' });
    expect((variants.initial as Record<string, unknown>).y).toBeGreaterThan(0);
  });

  it('direction "down": exit.y is negative', () => {
    const { variants } = buildVariants('slide-y', { direction: 'down' });
    expect((variants.exit as Record<string, unknown>).y).toBeLessThan(0);
  });

  it('animate.y is 0', () => {
    const { variants } = buildVariants('slide-y');
    expect((variants.animate as Record<string, unknown>).y).toBe(0);
  });
});

// ── buildVariants — zoom ──────────────────────────────────────────────────────

describe('buildVariants — zoom', () => {
  it('initial.scale is 0.96', () => {
    const { variants } = buildVariants('zoom');
    expect((variants.initial as Record<string, unknown>).scale).toBe(0.96);
  });

  it('animate.scale is 1', () => {
    const { variants } = buildVariants('zoom');
    expect((variants.animate as Record<string, unknown>).scale).toBe(1);
  });

  it('exit.scale is 1.04', () => {
    const { variants } = buildVariants('zoom');
    expect((variants.exit as Record<string, unknown>).scale).toBe(1.04);
  });
});

// ── buildVariants — flip-x ────────────────────────────────────────────────────

describe('buildVariants — flip-x', () => {
  it('initial.rotateX is 90', () => {
    const { variants } = buildVariants('flip-x');
    expect((variants.initial as Record<string, unknown>).rotateX).toBe(90);
  });

  it('animate.rotateX is 0', () => {
    const { variants } = buildVariants('flip-x');
    expect((variants.animate as Record<string, unknown>).rotateX).toBe(0);
  });

  it('exit.rotateX is -90', () => {
    const { variants } = buildVariants('flip-x');
    expect((variants.exit as Record<string, unknown>).rotateX).toBe(-90);
  });
});

// ── buildVariants — flip-y ────────────────────────────────────────────────────

describe('buildVariants — flip-y', () => {
  it('initial.rotateY is 90', () => {
    const { variants } = buildVariants('flip-y');
    expect((variants.initial as Record<string, unknown>).rotateY).toBe(90);
  });

  it('animate.rotateY is 0', () => {
    const { variants } = buildVariants('flip-y');
    expect((variants.animate as Record<string, unknown>).rotateY).toBe(0);
  });

  it('exit.rotateY is -90', () => {
    const { variants } = buildVariants('flip-y');
    expect((variants.exit as Record<string, unknown>).rotateY).toBe(-90);
  });
});

// ── buildVariants — parallax ──────────────────────────────────────────────────

describe('buildVariants — parallax', () => {
  it('initial.y is 60', () => {
    const { variants } = buildVariants('parallax');
    expect((variants.initial as Record<string, unknown>).y).toBe(60);
  });

  it('exit.y is -60', () => {
    const { variants } = buildVariants('parallax');
    expect((variants.exit as Record<string, unknown>).y).toBe(-60);
  });

  it('initial.scale is 1.05', () => {
    const { variants } = buildVariants('parallax');
    expect((variants.initial as Record<string, unknown>).scale).toBe(1.05);
  });

  it('exit.scale is 0.95', () => {
    const { variants } = buildVariants('parallax');
    expect((variants.exit as Record<string, unknown>).scale).toBe(0.95);
  });

  it('animate.y is 0 and animate.scale is 1', () => {
    const { variants } = buildVariants('parallax');
    expect((variants.animate as Record<string, unknown>).y).toBe(0);
    expect((variants.animate as Record<string, unknown>).scale).toBe(1);
  });
});

// ── buildVariants — override propagation ─────────────────────────────────────

describe('buildVariants — override propagation', () => {
  it('custom duration propagates to transition', () => {
    const { transition } = buildVariants('fade', { duration: 0.8 });
    expect(transition.duration).toBe(0.8);
  });

  it('custom ease propagates to transition', () => {
    const customEase = [0.1, 0.2, 0.3, 0.4] as number[];
    const { transition } = buildVariants('fade', { ease: customEase });
    expect(transition.ease).toEqual(customEase);
  });

  it('each call returns an independent object', () => {
    const a = buildVariants('fade');
    const b = buildVariants('fade');
    expect(a).not.toBe(b);
    expect(a.variants).not.toBe(b.variants);
  });
});