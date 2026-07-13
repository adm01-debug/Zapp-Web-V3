import { describe, it, expect } from 'vitest';
import {
  fadeInUp,
  fadeIn,
  scaleIn,
  slideInRight,
  slideInLeft,
  staggerContainer,
  staggerItem,
  neonReveal,
  staggeredNeonContainer,
  staggeredNeonItem,
} from '../variants';

type VariantState = Record<string, unknown>;

const ALL_VARIANTS = [
  { name: 'fadeInUp', v: fadeInUp },
  { name: 'fadeIn', v: fadeIn },
  { name: 'scaleIn', v: scaleIn },
  { name: 'slideInRight', v: slideInRight },
  { name: 'slideInLeft', v: slideInLeft },
  { name: 'staggerContainer', v: staggerContainer },
  { name: 'staggerItem', v: staggerItem },
  { name: 'neonReveal', v: neonReveal },
  { name: 'staggeredNeonContainer', v: staggeredNeonContainer },
  { name: 'staggeredNeonItem', v: staggeredNeonItem },
];

// ── completeness ──────────────────────────────────────────────────────────────

describe('motion variants — all exported', () => {
  it('has 10 exported variant objects', () => {
    expect(ALL_VARIANTS.length).toBe(10);
  });

  it.each(ALL_VARIANTS)('$name is a non-null object', ({ v }) => {
    expect(typeof v).toBe('object');
    expect(v).not.toBeNull();
  });

  it.each(ALL_VARIANTS)('$name has a "hidden" key', ({ v }) => {
    expect(v.hidden).toBeDefined();
  });

  it.each(ALL_VARIANTS)('$name has a "visible" key', ({ v }) => {
    expect(v.visible).toBeDefined();
  });

  it.each(ALL_VARIANTS)('$name "hidden" opacity is 0', ({ v }) => {
    expect((v.hidden as VariantState).opacity).toBe(0);
  });

  it.each(ALL_VARIANTS)('$name "visible" opacity is 1', ({ v }) => {
    expect((v.visible as VariantState).opacity).toBe(1);
  });
});

// ── fadeInUp ──────────────────────────────────────────────────────────────────

describe('fadeInUp', () => {
  it('hidden.y is 20', () => {
    expect((fadeInUp.hidden as VariantState).y).toBe(20);
  });

  it('visible.y is 0', () => {
    expect((fadeInUp.visible as VariantState).y).toBe(0);
  });

  it('exit.y is -10', () => {
    expect((fadeInUp.exit as VariantState).y).toBe(-10);
  });

  it('exit.opacity is 0', () => {
    expect((fadeInUp.exit as VariantState).opacity).toBe(0);
  });
});

// ── fadeIn ────────────────────────────────────────────────────────────────────

describe('fadeIn', () => {
  it('hidden has no x or y', () => {
    expect((fadeIn.hidden as VariantState).x).toBeUndefined();
    expect((fadeIn.hidden as VariantState).y).toBeUndefined();
  });

  it('has an exit key with opacity 0', () => {
    expect((fadeIn.exit as VariantState).opacity).toBe(0);
  });
});

// ── scaleIn ───────────────────────────────────────────────────────────────────

describe('scaleIn', () => {
  it('hidden.scale is 0.95', () => {
    expect((scaleIn.hidden as VariantState).scale).toBe(0.95);
  });

  it('visible.scale is 1', () => {
    expect((scaleIn.visible as VariantState).scale).toBe(1);
  });

  it('exit.scale is 0.95', () => {
    expect((scaleIn.exit as VariantState).scale).toBe(0.95);
  });
});

// ── slideInRight ──────────────────────────────────────────────────────────────

describe('slideInRight', () => {
  it('hidden.x is positive (20)', () => {
    expect((slideInRight.hidden as VariantState).x).toBe(20);
  });

  it('visible.x is 0', () => {
    expect((slideInRight.visible as VariantState).x).toBe(0);
  });

  it('exit.x is positive (20)', () => {
    expect((slideInRight.exit as VariantState).x).toBe(20);
  });
});

// ── slideInLeft ───────────────────────────────────────────────────────────────

describe('slideInLeft', () => {
  it('hidden.x is negative (-20)', () => {
    expect((slideInLeft.hidden as VariantState).x).toBe(-20);
  });

  it('visible.x is 0', () => {
    expect((slideInLeft.visible as VariantState).x).toBe(0);
  });

  it('exit.x is negative (-20)', () => {
    expect((slideInLeft.exit as VariantState).x).toBe(-20);
  });
});

// ── staggerContainer ──────────────────────────────────────────────────────────

describe('staggerContainer', () => {
  it('does not have an exit key', () => {
    expect(staggerContainer.exit).toBeUndefined();
  });

  it('visible.transition has staggerChildren', () => {
    const t = (staggerContainer.visible as VariantState).transition as VariantState;
    expect(t.staggerChildren).toBeDefined();
    expect(typeof t.staggerChildren).toBe('number');
  });

  it('visible.transition has delayChildren', () => {
    const t = (staggerContainer.visible as VariantState).transition as VariantState;
    expect(t.delayChildren).toBeDefined();
  });
});

// ── staggerItem ───────────────────────────────────────────────────────────────

describe('staggerItem', () => {
  it('hidden.y is 10', () => {
    expect((staggerItem.hidden as VariantState).y).toBe(10);
  });

  it('visible.y is 0', () => {
    expect((staggerItem.visible as VariantState).y).toBe(0);
  });
});

// ── neonReveal ────────────────────────────────────────────────────────────────

describe('neonReveal', () => {
  it('hidden.y is 30', () => {
    expect((neonReveal.hidden as VariantState).y).toBe(30);
  });

  it('exit.y is -20', () => {
    expect((neonReveal.exit as VariantState).y).toBe(-20);
  });

  it('hidden has a blur filter', () => {
    expect((neonReveal.hidden as VariantState).filter).toContain('blur');
  });

  it('visible has blur(0px) filter', () => {
    expect((neonReveal.visible as VariantState).filter).toBe('blur(0px)');
  });

  it('exit has a non-zero blur', () => {
    const filter = (neonReveal.exit as VariantState).filter as string;
    expect(filter).toContain('blur');
    expect(filter).not.toBe('blur(0px)');
  });
});

// ── staggeredNeonContainer ────────────────────────────────────────────────────

describe('staggeredNeonContainer', () => {
  it('visible.transition has staggerChildren', () => {
    const t = (staggeredNeonContainer.visible as VariantState).transition as VariantState;
    expect(typeof t.staggerChildren).toBe('number');
  });

  it('visible.transition staggerChildren is 0.08', () => {
    const t = (staggeredNeonContainer.visible as VariantState).transition as VariantState;
    expect(t.staggerChildren).toBe(0.08);
  });

  it('visible.transition delayChildren is 0.15', () => {
    const t = (staggeredNeonContainer.visible as VariantState).transition as VariantState;
    expect(t.delayChildren).toBe(0.15);
  });
});

// ── staggeredNeonItem ─────────────────────────────────────────────────────────

describe('staggeredNeonItem', () => {
  it('hidden.y is 20', () => {
    expect((staggeredNeonItem.hidden as VariantState).y).toBe(20);
  });

  it('hidden has a blur filter', () => {
    expect((staggeredNeonItem.hidden as VariantState).filter).toContain('blur');
  });

  it('visible has blur(0px) filter', () => {
    expect((staggeredNeonItem.visible as VariantState).filter).toBe('blur(0px)');
  });

  it('does not have an exit key', () => {
    expect(staggeredNeonItem.exit).toBeUndefined();
  });
});
