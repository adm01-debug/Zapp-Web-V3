import { describe, it, expect } from 'vitest';
import { DEFAULT_ONBOARDING_STEPS } from '../defaultTourSteps';

// ── DEFAULT_ONBOARDING_STEPS — structure ──────────────────────────────────────

describe('DEFAULT_ONBOARDING_STEPS — structure', () => {
  it('is an array', () => {
    expect(Array.isArray(DEFAULT_ONBOARDING_STEPS)).toBe(true);
  });

  it('has exactly 6 steps', () => {
    expect(DEFAULT_ONBOARDING_STEPS).toHaveLength(6);
  });

  it('all step ids are unique', () => {
    const ids = DEFAULT_ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every step has a non-empty id', () => {
    DEFAULT_ONBOARDING_STEPS.forEach((s) => {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
    });
  });

  it('every step has a non-empty target (CSS selector)', () => {
    DEFAULT_ONBOARDING_STEPS.forEach((s) => {
      expect(typeof s.target).toBe('string');
      expect(s.target.length).toBeGreaterThan(0);
    });
  });

  it('every step target uses data-tour attribute selector', () => {
    DEFAULT_ONBOARDING_STEPS.forEach((s) => {
      expect(s.target).toMatch(/\[data-tour=/);
    });
  });

  it('every step has a non-empty title', () => {
    DEFAULT_ONBOARDING_STEPS.forEach((s) => {
      expect(typeof s.title).toBe('string');
      expect(s.title.length).toBeGreaterThan(0);
    });
  });

  it('every step has a non-empty description', () => {
    DEFAULT_ONBOARDING_STEPS.forEach((s) => {
      expect(typeof s.description).toBe('string');
      expect(s.description.length).toBeGreaterThan(0);
    });
  });

  it('every step has position "right"', () => {
    DEFAULT_ONBOARDING_STEPS.forEach((s) => {
      expect(s.position).toBe('right');
    });
  });

  it('all titles are unique', () => {
    const titles = DEFAULT_ONBOARDING_STEPS.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

// ── DEFAULT_ONBOARDING_STEPS — known entries ──────────────────────────────────

describe('DEFAULT_ONBOARDING_STEPS — known entries', () => {
  it('contains step with id "inbox"', () => {
    expect(DEFAULT_ONBOARDING_STEPS.some((s) => s.id === 'inbox')).toBe(true);
  });

  it('"inbox" step has target \'[data-tour="inbox"]\'', () => {
    const s = DEFAULT_ONBOARDING_STEPS.find((s) => s.id === 'inbox')!;
    expect(s.target).toBe('[data-tour="inbox"]');
  });

  it('"inbox" step has title "Inbox de Conversas"', () => {
    const s = DEFAULT_ONBOARDING_STEPS.find((s) => s.id === 'inbox')!;
    expect(s.title).toBe('Inbox de Conversas');
  });

  it('contains step with id "contacts"', () => {
    expect(DEFAULT_ONBOARDING_STEPS.some((s) => s.id === 'contacts')).toBe(true);
  });

  it('"contacts" step has target \'[data-tour="contacts"]\'', () => {
    const s = DEFAULT_ONBOARDING_STEPS.find((s) => s.id === 'contacts')!;
    expect(s.target).toBe('[data-tour="contacts"]');
  });

  it('contains step with id "dashboard"', () => {
    expect(DEFAULT_ONBOARDING_STEPS.some((s) => s.id === 'dashboard')).toBe(true);
  });

  it('"dashboard" step has title "Dashboard & Métricas"', () => {
    const s = DEFAULT_ONBOARDING_STEPS.find((s) => s.id === 'dashboard')!;
    expect(s.title).toBe('Dashboard & Métricas');
  });

  it('contains step with id "queues"', () => {
    expect(DEFAULT_ONBOARDING_STEPS.some((s) => s.id === 'queues')).toBe(true);
  });

  it('contains step with id "notifications"', () => {
    expect(DEFAULT_ONBOARDING_STEPS.some((s) => s.id === 'notifications')).toBe(true);
  });

  it('"notifications" step title is "Central de Notificações"', () => {
    const s = DEFAULT_ONBOARDING_STEPS.find((s) => s.id === 'notifications')!;
    expect(s.title).toBe('Central de Notificações');
  });

  it('contains step with id "theme"', () => {
    expect(DEFAULT_ONBOARDING_STEPS.some((s) => s.id === 'theme')).toBe(true);
  });

  it('"theme" step has title "Personalização"', () => {
    const s = DEFAULT_ONBOARDING_STEPS.find((s) => s.id === 'theme')!;
    expect(s.title).toBe('Personalização');
  });

  it('"theme" step target is \'[data-tour="theme"]\'', () => {
    const s = DEFAULT_ONBOARDING_STEPS.find((s) => s.id === 'theme')!;
    expect(s.target).toBe('[data-tour="theme"]');
  });
});

describe('DEFAULT_ONBOARDING_STEPS — ordering', () => {
  it('first step is "inbox"', () => {
    expect(DEFAULT_ONBOARDING_STEPS[0].id).toBe('inbox');
  });

  it('last step is "theme"', () => {
    expect(DEFAULT_ONBOARDING_STEPS[DEFAULT_ONBOARDING_STEPS.length - 1].id).toBe('theme');
  });

  it('step indices match logical flow: inbox → contacts → dashboard → queues → notifications → theme', () => {
    const ids = DEFAULT_ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toEqual(['inbox', 'contacts', 'dashboard', 'queues', 'notifications', 'theme']);
  });
});
