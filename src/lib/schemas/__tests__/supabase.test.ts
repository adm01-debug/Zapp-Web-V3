import { describe, it, expect } from 'vitest';
import {
  safeParse,
  safeParseList,
  contactSchema,
  messageSchema,
  conversationSchema,
} from '../supabase';
import { z } from 'zod';

// ── safeParse ──────────────────────────────────────────────────────────────

describe('safeParse — success', () => {
  it('returns parsed data for a valid string', () => {
    expect(safeParse(z.string(), 'hello')).toBe('hello');
  });

  it('returns parsed data for a valid number', () => {
    expect(safeParse(z.number(), 42)).toBe(42);
  });

  it('returns parsed data for a valid object', () => {
    const schema = z.object({ x: z.number() });
    expect(safeParse(schema, { x: 1 })).toEqual({ x: 1 });
  });
});

describe('safeParse — failure', () => {
  it('returns null for an invalid string (number given)', () => {
    expect(safeParse(z.string(), 123)).toBeNull();
  });

  it('returns null for null when schema requires a string', () => {
    expect(safeParse(z.string(), null)).toBeNull();
  });

  it('returns null for undefined when schema requires a string', () => {
    expect(safeParse(z.string(), undefined)).toBeNull();
  });

  it('returns null for an object missing required fields', () => {
    const schema = z.object({ id: z.string().uuid() });
    expect(safeParse(schema, {})).toBeNull();
  });

  it('does not throw — always returns null on schema error', () => {
    expect(() => safeParse(z.never(), 'anything')).not.toThrow();
    expect(safeParse(z.never(), 'anything')).toBeNull();
  });
});

// ── safeParseList ──────────────────────────────────────────────────────────

describe('safeParseList — non-array inputs', () => {
  it('returns [] for null', () => {
    expect(safeParseList(z.string(), null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(safeParseList(z.string(), undefined)).toEqual([]);
  });

  it('returns [] for a plain string', () => {
    expect(safeParseList(z.string(), 'not an array')).toEqual([]);
  });

  it('returns [] for a number', () => {
    expect(safeParseList(z.number(), 42)).toEqual([]);
  });

  it('returns [] for an object', () => {
    expect(safeParseList(z.string(), { a: 1 })).toEqual([]);
  });
});

describe('safeParseList — valid arrays', () => {
  it('returns all valid items from a homogeneous array', () => {
    expect(safeParseList(z.string(), ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('returns [] for an empty array', () => {
    expect(safeParseList(z.string(), [])).toEqual([]);
  });

  it('discards invalid items and keeps valid ones', () => {
    const result = safeParseList(z.string(), ['valid', 42, 'also-valid', null]);
    expect(result).toEqual(['valid', 'also-valid']);
  });

  it('returns [] when all items are invalid', () => {
    expect(safeParseList(z.number(), ['a', 'b', 'c'])).toEqual([]);
  });

  it('works with object schemas — discards partial objects', () => {
    const schema = z.object({ id: z.string().uuid() });
    const UUID = '00000000-0000-0000-0000-000000000000';
    const input = [{ id: UUID }, { id: 'not-a-uuid' }, { x: 1 }];
    expect(safeParseList(schema, input)).toHaveLength(1);
    expect(safeParseList(schema, input)[0].id).toBe(UUID);
  });
});

// ── contactSchema ──────────────────────────────────────────────────────────

// Must be RFC 4122-compliant UUIDs (version nibble 1-8, variant nibble 8/9/a/b)
const UUID = '123e4567-e89b-12d3-a456-426614174000';
const UUID2 = '550e8400-e29b-41d4-a716-446655440000';

function minimalContact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UUID,
    name: 'Alice',
    phone: '+5511999999999',
    status: 'open',
    contact_type: 'cliente',
    is_read: false,
    is_archived: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('contactSchema — valid data', () => {
  it('parses a minimal valid contact', () => {
    const result = safeParse(contactSchema, minimalContact());
    expect(result).not.toBeNull();
    expect(result!.id).toBe(UUID);
    expect(result!.name).toBe('Alice');
  });

  it('accepts optional nullable fields as null → undefined', () => {
    const result = safeParse(
      contactSchema,
      minimalContact({ email: null, avatar_url: null, remote_jid: null })
    );
    expect(result).not.toBeNull();
    expect(result!.email).toBeUndefined();
    expect(result!.avatar_url).toBeUndefined();
    expect(result!.remote_jid).toBeUndefined();
  });

  it('accepts queue_id and assigned_to as valid UUIDs', () => {
    const result = safeParse(
      contactSchema,
      minimalContact({ queue_id: UUID2, assigned_to: UUID2 })
    );
    expect(result!.queue_id).toBe(UUID2);
    expect(result!.assigned_to).toBe(UUID2);
  });

  it('converts null name to empty string', () => {
    const result = safeParse(contactSchema, minimalContact({ name: null }));
    expect(result!.name).toBe('');
  });

  it('converts null phone to empty string', () => {
    const result = safeParse(contactSchema, minimalContact({ phone: null }));
    expect(result!.phone).toBe('');
  });

  it('converts null is_read to false', () => {
    const result = safeParse(contactSchema, minimalContact({ is_read: null }));
    expect(result!.is_read).toBe(false);
  });

  it('converts null is_archived to false', () => {
    const result = safeParse(contactSchema, minimalContact({ is_archived: null }));
    expect(result!.is_archived).toBe(false);
  });

  it('converts null status to the default "open"', () => {
    const result = safeParse(contactSchema, minimalContact({ status: null }));
    expect(result!.status).toBe('open');
  });
});

describe('contactSchema — invalid data', () => {
  it('rejects a non-UUID id', () => {
    expect(safeParse(contactSchema, minimalContact({ id: 'not-a-uuid' }))).toBeNull();
  });

  it('rejects missing id', () => {
    const { id: _omit, ...rest } = minimalContact() as { id: string };
    expect(safeParse(contactSchema, rest)).toBeNull();
  });

  it('rejects a non-UUID queue_id', () => {
    expect(
      safeParse(contactSchema, minimalContact({ queue_id: 'bad-id' }))
    ).toBeNull();
  });
});

// ── messageSchema ──────────────────────────────────────────────────────────

function minimalMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UUID,
    contact_id: UUID2,
    content: 'Hello',
    sender: 'agent',
    message_type: 'text',
    is_read: false,
    status: 'sent',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('messageSchema — valid data', () => {
  it('parses a minimal valid message', () => {
    const result = safeParse(messageSchema, minimalMessage());
    expect(result).not.toBeNull();
    expect(result!.id).toBe(UUID);
    expect(result!.sender).toBe('agent');
  });

  it('accepts all valid sender values', () => {
    for (const s of ['agent', 'contact', 'system', 'bot'] as const) {
      const result = safeParse(messageSchema, minimalMessage({ sender: s }));
      expect(result!.sender).toBe(s);
    }
  });

  it('falls back to "contact" for an unknown sender via .catch', () => {
    const result = safeParse(messageSchema, minimalMessage({ sender: 'unknown-bot' }));
    expect(result).not.toBeNull();
    expect(result!.sender).toBe('contact');
  });

  it('converts null content to empty string', () => {
    const result = safeParse(messageSchema, minimalMessage({ content: null }));
    expect(result!.content).toBe('');
  });

  it('converts null media_url to undefined', () => {
    const result = safeParse(messageSchema, minimalMessage({ media_url: null }));
    expect(result!.media_url).toBeUndefined();
  });

  it('converts null agent_id to undefined', () => {
    const result = safeParse(messageSchema, minimalMessage({ agent_id: null }));
    expect(result!.agent_id).toBeUndefined();
  });

  it('converts null is_read to false', () => {
    const result = safeParse(messageSchema, minimalMessage({ is_read: null }));
    expect(result!.is_read).toBe(false);
  });
});

describe('messageSchema — invalid data', () => {
  it('rejects non-UUID id', () => {
    expect(safeParse(messageSchema, minimalMessage({ id: 'bad' }))).toBeNull();
  });

  it('rejects non-UUID contact_id', () => {
    expect(safeParse(messageSchema, minimalMessage({ contact_id: 'bad' }))).toBeNull();
  });

  it('rejects non-UUID agent_id when provided as a non-null string', () => {
    expect(safeParse(messageSchema, minimalMessage({ agent_id: 'not-a-uuid' }))).toBeNull();
  });
});

// ── conversationSchema ─────────────────────────────────────────────────────

function minimalConversation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UUID,
    name: 'Bob',
    phone: '+5511888888888',
    status: 'open',
    unread_count: 0,
    ...overrides,
  };
}

describe('conversationSchema — valid data', () => {
  it('parses a minimal valid conversation', () => {
    const result = safeParse(conversationSchema, minimalConversation());
    expect(result).not.toBeNull();
    expect(result!.id).toBe(UUID);
    expect(result!.name).toBe('Bob');
  });

  it('converts null unread_count to 0', () => {
    const result = safeParse(conversationSchema, minimalConversation({ unread_count: null }));
    expect(result!.unread_count).toBe(0);
  });

  it('converts null last_message to undefined', () => {
    const result = safeParse(conversationSchema, minimalConversation({ last_message: null }));
    expect(result!.last_message).toBeUndefined();
  });

  it('converts null contact_id to undefined', () => {
    const result = safeParse(conversationSchema, minimalConversation({ contact_id: null }));
    expect(result!.contact_id).toBeUndefined();
  });

  it('converts null phone to empty string', () => {
    const result = safeParse(conversationSchema, minimalConversation({ phone: null }));
    expect(result!.phone).toBe('');
  });

  it('preserves positive unread_count', () => {
    const result = safeParse(conversationSchema, minimalConversation({ unread_count: 5 }));
    expect(result!.unread_count).toBe(5);
  });
});

describe('conversationSchema — invalid data', () => {
  it('rejects non-UUID id', () => {
    expect(safeParse(conversationSchema, minimalConversation({ id: 'bad' }))).toBeNull();
  });

  it('rejects non-UUID contact_id when provided as non-null string', () => {
    expect(
      safeParse(conversationSchema, minimalConversation({ contact_id: 'not-a-uuid' }))
    ).toBeNull();
  });
});

// ── safeParseList + schema integration ────────────────────────────────────

describe('safeParseList with contactSchema', () => {
  it('parses an array of valid contacts', () => {
    const contacts = [minimalContact(), minimalContact({ id: UUID2, name: 'Bob' })];
    const result = safeParseList(contactSchema, contacts);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Alice');
    expect(result[1].name).toBe('Bob');
  });

  it('discards contacts with invalid UUIDs', () => {
    const contacts = [minimalContact(), minimalContact({ id: 'bad-uuid' })];
    const result = safeParseList(contactSchema, contacts);
    expect(result).toHaveLength(1);
  });

  it('returns [] when given null', () => {
    const result = safeParseList(contactSchema, null);
    expect(result).toEqual([]);
  });
});
