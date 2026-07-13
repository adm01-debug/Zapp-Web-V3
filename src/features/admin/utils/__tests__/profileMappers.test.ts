import { describe, it, expect } from 'vitest';
import {
  normalizeProfileRef,
  normalizeAgentProfile,
  normalizeAgentProfiles,
} from '../profileMappers';

// ── normalizeProfileRef ───────────────────────────────────────────────────────

describe('normalizeProfileRef — null / missing inputs', () => {
  it('returns undefined for null', () => {
    expect(normalizeProfileRef(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(normalizeProfileRef(undefined)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(normalizeProfileRef([])).toBeUndefined();
  });

  it('returns undefined when object lacks id', () => {
    expect(normalizeProfileRef({ name: 'Ana' })).toBeUndefined();
  });

  it('returns undefined for an array whose first element lacks id', () => {
    expect(normalizeProfileRef([{ name: 'Ana' }])).toBeUndefined();
  });
});

describe('normalizeProfileRef — single object', () => {
  it('passes id through', () => {
    const result = normalizeProfileRef({ id: 'u1', name: 'Alice', email: null, avatar_url: null });
    expect(result?.id).toBe('u1');
  });

  it('passes name through when present', () => {
    const result = normalizeProfileRef({ id: 'u1', name: 'Alice', email: null, avatar_url: null });
    expect(result?.name).toBe('Alice');
  });

  it('defaults name to "Sem nome" when name is null', () => {
    const result = normalizeProfileRef({ id: 'u1', name: null as unknown as string });
    expect(result?.name).toBe('Sem nome');
  });

  it('defaults name to "Sem nome" when name is empty string', () => {
    const result = normalizeProfileRef({ id: 'u1', name: '' });
    expect(result?.name).toBe('Sem nome');
  });

  it('defaults name to "Sem nome" when name is whitespace-only', () => {
    const result = normalizeProfileRef({ id: 'u1', name: '   ' });
    expect(result?.name).toBe('Sem nome');
  });

  it('passes email through (null allowed)', () => {
    const result = normalizeProfileRef({ id: 'u1', name: 'Bob', email: 'bob@x.com', avatar_url: null });
    expect(result?.email).toBe('bob@x.com');
  });

  it('passes null email through', () => {
    const result = normalizeProfileRef({ id: 'u1', name: 'Bob', email: null, avatar_url: null });
    expect(result?.email).toBeNull();
  });

  it('passes avatar_url through (null allowed)', () => {
    const result = normalizeProfileRef({ id: 'u1', name: 'Bob', email: null, avatar_url: 'https://cdn/a.png' });
    expect(result?.avatar_url).toBe('https://cdn/a.png');
  });
});

describe('normalizeProfileRef — array embed (Supabase FK join)', () => {
  it('picks first element from a single-element array', () => {
    const result = normalizeProfileRef([{ id: 'u2', name: 'Carol', email: null, avatar_url: null }]);
    expect(result?.id).toBe('u2');
    expect(result?.name).toBe('Carol');
  });

  it('picks first element from a multi-element array', () => {
    const result = normalizeProfileRef([
      { id: 'u3', name: 'Dave', email: null, avatar_url: null },
      { id: 'u4', name: 'Eve', email: null, avatar_url: null },
    ]);
    expect(result?.id).toBe('u3');
  });
});

// ── normalizeAgentProfile ─────────────────────────────────────────────────────

describe('normalizeAgentProfile — null / bad inputs', () => {
  it('returns null for null', () => {
    expect(normalizeAgentProfile(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(normalizeAgentProfile(undefined)).toBeNull();
  });

  it('returns null for non-object primitives', () => {
    expect(normalizeAgentProfile('string')).toBeNull();
    expect(normalizeAgentProfile(42)).toBeNull();
  });

  it('returns null when id is not a string', () => {
    expect(normalizeAgentProfile({ id: 123 })).toBeNull();
  });
});

describe('normalizeAgentProfile — required fields', () => {
  const base = { id: 'a1', user_id: 'u1', name: 'Ana', email: 'ana@x.com', is_active: true, max_chats: 10 };

  it('maps id', () => {
    expect(normalizeAgentProfile(base)?.id).toBe('a1');
  });

  it('maps user_id', () => {
    expect(normalizeAgentProfile(base)?.user_id).toBe('u1');
  });

  it('defaults user_id to empty string when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.user_id).toBe('');
  });

  it('maps name', () => {
    expect(normalizeAgentProfile(base)?.name).toBe('Ana');
  });

  it('defaults name to "Sem nome" when null', () => {
    expect(normalizeAgentProfile({ id: 'a1', name: null })?.name).toBe('Sem nome');
  });

  it('defaults name to "Sem nome" for blank string', () => {
    expect(normalizeAgentProfile({ id: 'a1', name: '  ' })?.name).toBe('Sem nome');
  });
});

describe('normalizeAgentProfile — optional fields', () => {
  it('maps email', () => {
    expect(normalizeAgentProfile({ id: 'a1', email: 'a@b.com' })?.email).toBe('a@b.com');
  });

  it('defaults email to null when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.email).toBeNull();
  });

  it('defaults is_active to true when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.is_active).toBe(true);
  });

  it('maps is_active: false correctly', () => {
    expect(normalizeAgentProfile({ id: 'a1', is_active: false })?.is_active).toBe(false);
  });

  it('defaults max_chats to 5 when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.max_chats).toBe(5);
  });

  it('maps max_chats when present', () => {
    expect(normalizeAgentProfile({ id: 'a1', max_chats: 15 })?.max_chats).toBe(15);
  });

  it('maps role to null when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.role).toBeNull();
  });

  it('maps role when present', () => {
    expect(normalizeAgentProfile({ id: 'a1', role: 'admin' })?.role).toBe('admin');
  });

  it('maps job_title to null when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.job_title).toBeNull();
  });

  it('maps department to null when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.department).toBeNull();
  });

  it('maps phone to null when missing', () => {
    expect(normalizeAgentProfile({ id: 'a1' })?.phone).toBeNull();
  });

  it('maps created_at and updated_at to null when missing', () => {
    const r = normalizeAgentProfile({ id: 'a1' });
    expect(r?.created_at).toBeNull();
    expect(r?.updated_at).toBeNull();
  });
});

// ── normalizeAgentProfiles ────────────────────────────────────────────────────

describe('normalizeAgentProfiles', () => {
  it('returns empty array for non-array input', () => {
    expect(normalizeAgentProfiles(null)).toEqual([]);
    expect(normalizeAgentProfiles('x')).toEqual([]);
    expect(normalizeAgentProfiles(undefined)).toEqual([]);
  });

  it('returns empty array for empty input array', () => {
    expect(normalizeAgentProfiles([])).toEqual([]);
  });

  it('filters out rows that fail normalizeAgentProfile (no id)', () => {
    expect(normalizeAgentProfiles([{ name: 'bad' }, { id: 'ok', name: 'Good' }])).toHaveLength(1);
  });

  it('returns normalized profiles for valid rows', () => {
    const result = normalizeAgentProfiles([
      { id: 'a1', name: 'Agent A', is_active: true },
      { id: 'a2', name: 'Agent B', is_active: false },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a1');
    expect(result[1].id).toBe('a2');
  });

  it('applies defaults to every row', () => {
    const result = normalizeAgentProfiles([{ id: 'a1' }]);
    expect(result[0].name).toBe('Sem nome');
    expect(result[0].max_chats).toBe(5);
    expect(result[0].is_active).toBe(true);
  });
});
