import { describe, it, expect } from 'vitest';
import { TRIGGER_TYPES, ACTION_TYPES } from '../automationConstants';

// ── TRIGGER_TYPES ─────────────────────────────────────────────────────────────

describe('TRIGGER_TYPES', () => {
  const EXPECTED_TYPES = ['new_message', 'keyword', 'time_inactive', 'tag_added', 'business_hours'];

  it('has exactly 5 trigger types', () => {
    expect(TRIGGER_TYPES).toHaveLength(5);
  });

  it.each(EXPECTED_TYPES)('contains trigger type "%s"', (type) => {
    expect(TRIGGER_TYPES.some((t) => t.type === type)).toBe(true);
  });

  it('every entry has a non-empty type', () => {
    TRIGGER_TYPES.forEach((t) => {
      expect(typeof t.type).toBe('string');
      expect(t.type.length).toBeGreaterThan(0);
    });
  });

  it('every entry has a non-empty label', () => {
    TRIGGER_TYPES.forEach((t) => {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
    });
  });

  it('every entry has a truthy icon', () => {
    TRIGGER_TYPES.forEach((t) => {
      expect(t.icon).toBeTruthy();
    });
  });

  it('every entry has a non-empty description', () => {
    TRIGGER_TYPES.forEach((t) => {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
    });
  });

  it('all type values are unique', () => {
    const types = TRIGGER_TYPES.map((t) => t.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('"new_message" label is "Nova Mensagem"', () => {
    const entry = TRIGGER_TYPES.find((t) => t.type === 'new_message');
    expect(entry?.label).toBe('Nova Mensagem');
  });
});

// ── ACTION_TYPES ──────────────────────────────────────────────────────────────

describe('ACTION_TYPES', () => {
  const EXPECTED_TYPES = ['send_message', 'assign_agent', 'add_tag', 'send_notification', 'close_conversation'];

  it('has exactly 5 action types', () => {
    expect(ACTION_TYPES).toHaveLength(5);
  });

  it.each(EXPECTED_TYPES)('contains action type "%s"', (type) => {
    expect(ACTION_TYPES.some((t) => t.type === type)).toBe(true);
  });

  it('every entry has a non-empty type', () => {
    ACTION_TYPES.forEach((t) => {
      expect(typeof t.type).toBe('string');
      expect(t.type.length).toBeGreaterThan(0);
    });
  });

  it('every entry has a non-empty label', () => {
    ACTION_TYPES.forEach((t) => {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
    });
  });

  it('every entry has a truthy icon', () => {
    ACTION_TYPES.forEach((t) => {
      expect(t.icon).toBeTruthy();
    });
  });

  it('every entry has a non-empty description', () => {
    ACTION_TYPES.forEach((t) => {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
    });
  });

  it('all type values are unique', () => {
    const types = ACTION_TYPES.map((t) => t.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('"close_conversation" label is "Fechar Conversa"', () => {
    const entry = ACTION_TYPES.find((t) => t.type === 'close_conversation');
    expect(entry?.label).toBe('Fechar Conversa');
  });
});
