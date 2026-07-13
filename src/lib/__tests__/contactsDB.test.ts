/**
 * Tests for contactsDB — CRUD bridge to the external CRM Supabase.
 *
 * Strategy: mock getExternalSupabase() via vi.hoisted, build a flexible
 * chain builder (makeChain) that routes each potentially-terminal method
 * (maybeSingle, single, terminalEq, terminalLimit, terminalOrder,
 * terminalRange) to a per-test resolver, while all intermediate methods
 * return the chain itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock external client ──────────────────────────────────────────────────────
const mockGetExternal = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/externalClient', () => ({
  getExternalSupabase: mockGetExternal,
  isExternalConfigured: true,
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { contactsDB } from '../contactsDB';

// ── Chain builder ─────────────────────────────────────────────────────────────
interface ChainOpts {
  /** Terminal for getById, findByPhone, findByPhoneTable */
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  /** Terminal for update, notes.create */
  single?: () => Promise<{ data: unknown; error: unknown }>;
  /** Terminal for updateAvatar, notes.update, notes.delete (last .eq()) */
  terminalEq?: (...args: unknown[]) => Promise<{ error: unknown }>;
  /** Terminal for search, notes.list, duplicates.findSimilar (.limit()) */
  terminalLimit?: (n: unknown) => Promise<{ data: unknown; error: unknown }>;
  /** Terminal for phones.list, emails.list (.order()) */
  terminalOrder?: (...args: unknown[]) => Promise<{ data: unknown; error: unknown }>;
  /** Terminal for list (.range()) */
  terminalRange?: (
    ...args: unknown[]
  ) => Promise<{ data: unknown; count: number | null; error: unknown }>;
}

function makeChain(opts: ChainOpts = {}): Record<string, (...a: unknown[]) => unknown> {
  const c: Record<string, (...a: unknown[]) => unknown> = {
    select: () => c,
    is: () => c,
    or: () => c,
    ilike: () => c,
    update: () => c,
    insert: () => c,
    delete: () => c,
    eq: (...args) => (opts.terminalEq ? opts.terminalEq(...args) : c),
    limit: (n) => (opts.terminalLimit ? opts.terminalLimit(n) : c),
    order: (...args) => (opts.terminalOrder ? opts.terminalOrder(...args) : c),
    range: (...args) => (opts.terminalRange ? opts.terminalRange(...args) : c),
    maybeSingle: () =>
      opts.maybeSingle?.() ?? Promise.resolve({ data: null, error: null }),
    single: () =>
      opts.single?.() ?? Promise.resolve({ data: null, error: null }),
  };
  return c;
}

function makeClient(chainOpts: ChainOpts = {}) {
  return { from: () => makeChain(chainOpts) };
}

// ── Sample fixtures ───────────────────────────────────────────────────────────
const CONTACT = {
  id: 'c-1',
  user_id: 'u-1',
  company_id: null,
  first_name: 'João',
  last_name: 'Silva',
  full_name: 'João Silva',
  email: 'joao@example.com',
  phone: '11999990000',
  whatsapp: '11999990000',
  deleted_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

const DB_ERROR = new Error('db error');

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  mockGetExternal.mockReset();
  // Default: return a valid client (overridden per-test as needed)
  mockGetExternal.mockReturnValue(makeClient());
});

// ── isConfigured ─────────────────────────────────────────────────────────────
describe('contactsDB.isConfigured', () => {
  it('returns the value of isExternalConfigured from the mocked module', () => {
    expect(contactsDB.isConfigured).toBe(true);
  });
});

// ── getClient guard ───────────────────────────────────────────────────────────
describe('getClient safety guard', () => {
  it('throws a descriptive error when getExternalSupabase returns null', async () => {
    mockGetExternal.mockReturnValue(null);
    await expect(contactsDB.getById('any')).rejects.toThrow(
      '[contactsDB] External Supabase not configured'
    );
  });

  it('error message mentions required env vars', async () => {
    mockGetExternal.mockReturnValue(null);
    await expect(contactsDB.getById('any')).rejects.toThrow(
      'VITE_EXTERNAL_SUPABASE_URL'
    );
  });
});

// ── getById ──────────────────────────────────────────────────────────────────
describe('contactsDB.getById', () => {
  it('returns the contact when found', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: CONTACT, error: null }) })
    );
    expect(await contactsDB.getById('c-1')).toEqual(CONTACT);
  });

  it('returns null when no row matches', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.getById('missing')).toBeNull();
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.getById('c-1')).rejects.toThrow('db error');
  });
});

// ── findByPhone ───────────────────────────────────────────────────────────────
describe('contactsDB.findByPhone', () => {
  it('returns null without calling DB for empty phone', async () => {
    expect(await contactsDB.findByPhone('')).toBeNull();
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('returns null without calling DB for phone with < 8 digits (all non-digits stripped)', async () => {
    expect(await contactsDB.findByPhone('(12345)')).toBeNull(); // 5 digits
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('returns null for exactly 7 digits', async () => {
    expect(await contactsDB.findByPhone('1234567')).toBeNull();
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('queries DB for phone with 8+ digits', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: CONTACT, error: null }) })
    );
    expect(await contactsDB.findByPhone('12345678')).toEqual(CONTACT);
    expect(mockGetExternal).toHaveBeenCalledOnce();
  });

  it('queries DB for formatted phone (strips +55 and dashes)', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: CONTACT, error: null }) })
    );
    expect(await contactsDB.findByPhone('+55-11-99999-0000')).toEqual(CONTACT);
  });

  it('returns null when DB finds no match', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.findByPhone('11000000000')).toBeNull();
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.findByPhone('11999990000')).rejects.toThrow('db error');
  });
});

// ── findByPhoneTable ──────────────────────────────────────────────────────────
describe('contactsDB.findByPhoneTable', () => {
  it('returns null without DB call for phone < 8 digits', async () => {
    expect(await contactsDB.findByPhoneTable('1234567')).toBeNull(); // 7 digits
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('extracts and returns the nested .contacts from the contact_phones row', async () => {
    const row = { contact_id: 'c-1', contacts: CONTACT };
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: row, error: null }) })
    );
    expect(await contactsDB.findByPhoneTable('11999990000')).toEqual(CONTACT);
  });

  it('returns null when no matching row in contact_phones', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.findByPhoneTable('11000000000')).toBeNull();
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ maybeSingle: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.findByPhoneTable('11999990000')).rejects.toThrow('db error');
  });
});

// ── update ────────────────────────────────────────────────────────────────────
describe('contactsDB.update', () => {
  it('returns the updated contact', async () => {
    const updated = { ...CONTACT, first_name: 'Maria' };
    mockGetExternal.mockReturnValue(
      makeClient({ single: () => Promise.resolve({ data: updated, error: null }) })
    );
    expect(await contactsDB.update('c-1', { first_name: 'Maria' })).toEqual(updated);
  });

  it('accepts fields that include updated_at without throwing (strips it internally)', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ single: () => Promise.resolve({ data: CONTACT, error: null }) })
    );
    const result = await contactsDB.update('c-1', {
      first_name: 'Test',
      updated_at: '2020-01-01T00:00:00Z',
    } as Parameters<typeof contactsDB.update>[1]);
    expect(result).toEqual(CONTACT);
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ single: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.update('c-1', { first_name: 'X' })).rejects.toThrow('db error');
  });
});

// ── updateAvatar ─────────────────────────────────────────────────────────────
describe('contactsDB.updateAvatar', () => {
  it('resolves with undefined on success', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalEq: () => Promise.resolve({ error: null }) })
    );
    await expect(
      contactsDB.updateAvatar('c-1', 'https://example.com/avatar.png')
    ).resolves.toBeUndefined();
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalEq: () => Promise.resolve({ error: DB_ERROR }) })
    );
    await expect(contactsDB.updateAvatar('c-1', 'url')).rejects.toThrow('db error');
  });
});

// ── search ────────────────────────────────────────────────────────────────────
describe('contactsDB.search', () => {
  it('returns [] immediately for empty string (no DB call)', async () => {
    expect(await contactsDB.search('')).toEqual([]);
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('returns [] immediately for whitespace-only query (no DB call)', async () => {
    expect(await contactsDB.search('   ')).toEqual([]);
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('returns matching contacts', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({
        terminalLimit: () => Promise.resolve({ data: [CONTACT], error: null }),
      })
    );
    expect(await contactsDB.search('João')).toEqual([CONTACT]);
  });

  it('returns [] when DB returns null data', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.search('X')).toEqual([]);
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.search('test')).rejects.toThrow('db error');
  });
});

// ── list ──────────────────────────────────────────────────────────────────────
describe('contactsDB.list', () => {
  it('returns contacts and count with default options', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({
        terminalRange: () => Promise.resolve({ data: [CONTACT], count: 1, error: null }),
      })
    );
    expect(await contactsDB.list({ userId: 'u-1' })).toEqual({ data: [CONTACT], count: 1 });
  });

  it('returns empty array when DB returns null data', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({
        terminalRange: () => Promise.resolve({ data: null, count: 0, error: null }),
      })
    );
    expect(await contactsDB.list({ userId: 'u-1' })).toEqual({ data: [], count: 0 });
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({
        terminalRange: () => Promise.resolve({ data: null, count: null, error: DB_ERROR }),
      })
    );
    await expect(contactsDB.list({ userId: 'u-1' })).rejects.toThrow('db error');
  });
});

// ── notes.list ────────────────────────────────────────────────────────────────
describe('contactsDB.notes.list', () => {
  const NOTE = {
    id: 'n-1',
    contact_id: 'c-1',
    user_id: 'u-1',
    content: 'Hello',
    note_type: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('returns notes on success', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: [NOTE], error: null }) })
    );
    expect(await contactsDB.notes.list('c-1')).toEqual([NOTE]);
  });

  it('returns [] when DB returns null data', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.notes.list('c-1')).toEqual([]);
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.notes.list('c-1')).rejects.toThrow('db error');
  });
});

// ── notes.create ──────────────────────────────────────────────────────────────
describe('contactsDB.notes.create', () => {
  const PAYLOAD = { contact_id: 'c-1', user_id: 'u-1', content: 'Note text' };
  const CREATED_NOTE = {
    ...PAYLOAD,
    id: 'n-1',
    note_type: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  it('returns the created note', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ single: () => Promise.resolve({ data: CREATED_NOTE, error: null }) })
    );
    expect(await contactsDB.notes.create(PAYLOAD)).toEqual(CREATED_NOTE);
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ single: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.notes.create(PAYLOAD)).rejects.toThrow('db error');
  });
});

// ── notes.update ──────────────────────────────────────────────────────────────
describe('contactsDB.notes.update', () => {
  it('resolves with undefined on success', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalEq: () => Promise.resolve({ error: null }) })
    );
    await expect(contactsDB.notes.update('n-1', 'Updated text')).resolves.toBeUndefined();
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalEq: () => Promise.resolve({ error: DB_ERROR }) })
    );
    await expect(contactsDB.notes.update('n-1', 'text')).rejects.toThrow('db error');
  });
});

// ── notes.delete ──────────────────────────────────────────────────────────────
describe('contactsDB.notes.delete', () => {
  it('resolves with undefined on success', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalEq: () => Promise.resolve({ error: null }) })
    );
    await expect(contactsDB.notes.delete('n-1')).resolves.toBeUndefined();
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalEq: () => Promise.resolve({ error: DB_ERROR }) })
    );
    await expect(contactsDB.notes.delete('n-1')).rejects.toThrow('db error');
  });
});

// ── phones.list ───────────────────────────────────────────────────────────────
describe('contactsDB.phones.list', () => {
  const PHONE_ROW = {
    id: 'p-1',
    contact_id: 'c-1',
    phone: '11999990000',
    phone_type: 'mobile',
    is_primary: true,
    is_whatsapp: true,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('returns phone rows on success', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalOrder: () => Promise.resolve({ data: [PHONE_ROW], error: null }) })
    );
    expect(await contactsDB.phones.list('c-1')).toEqual([PHONE_ROW]);
  });

  it('returns [] when DB returns null data', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalOrder: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.phones.list('c-1')).toEqual([]);
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalOrder: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.phones.list('c-1')).rejects.toThrow('db error');
  });
});

// ── emails.list ───────────────────────────────────────────────────────────────
describe('contactsDB.emails.list', () => {
  const EMAIL_ROW = {
    id: 'e-1',
    contact_id: 'c-1',
    email: 'joao@x.com',
    email_type: 'work',
    is_primary: true,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('returns email rows on success', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalOrder: () => Promise.resolve({ data: [EMAIL_ROW], error: null }) })
    );
    expect(await contactsDB.emails.list('c-1')).toEqual([EMAIL_ROW]);
  });

  it('returns [] when DB returns null data', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalOrder: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.emails.list('c-1')).toEqual([]);
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalOrder: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(contactsDB.emails.list('c-1')).rejects.toThrow('db error');
  });
});

// ── duplicates.findSimilar ────────────────────────────────────────────────────
describe('contactsDB.duplicates.findSimilar', () => {
  it('returns [] without DB call when phone < 8 digits and name is empty', async () => {
    expect(await contactsDB.duplicates.findSimilar('123', '')).toEqual([]);
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('returns [] without DB call when phone < 8 digits and name < 3 chars', async () => {
    // Passes early return (name is truthy), but conditions list stays empty → return []
    expect(await contactsDB.duplicates.findSimilar('123', 'AB')).toEqual([]);
    expect(mockGetExternal).not.toHaveBeenCalled();
  });

  it('queries by name when phone < 8 digits but name has 3+ chars', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: [CONTACT], error: null }) })
    );
    expect(await contactsDB.duplicates.findSimilar('123', 'João')).toEqual([CONTACT]);
    expect(mockGetExternal).toHaveBeenCalledOnce();
  });

  it('queries by phone (last 8 digits) when phone has 8+ digits', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: [CONTACT], error: null }) })
    );
    expect(await contactsDB.duplicates.findSimilar('11999990000', '')).toEqual([CONTACT]);
    expect(mockGetExternal).toHaveBeenCalledOnce();
  });

  it('queries by both phone and name when both are provided', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: [CONTACT], error: null }) })
    );
    expect(await contactsDB.duplicates.findSimilar('11999990000', 'João')).toEqual([CONTACT]);
  });

  it('returns [] when DB returns null data', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: null, error: null }) })
    );
    expect(await contactsDB.duplicates.findSimilar('11999990000', '')).toEqual([]);
  });

  it('propagates DB errors', async () => {
    mockGetExternal.mockReturnValue(
      makeClient({ terminalLimit: () => Promise.resolve({ data: null, error: DB_ERROR }) })
    );
    await expect(
      contactsDB.duplicates.findSimilar('11999990000', '')
    ).rejects.toThrow('db error');
  });
});
