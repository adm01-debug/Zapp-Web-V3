/**
 * Tests for the five pure utility functions in realtimeUtils.ts that are NOT
 * covered by the existing realtimeUtils.dedupe.test.ts:
 *
 *   normalizeMessage(message)
 *     — fills undefined content/''/status/status_updated_at with '' / null
 *   dedupeContacts(contacts)
 *     — last-writer-wins dedup of ConversationContact[] by id
 *   getUniqueMessageContactIds(messages)
 *     — collects unique, non-null contact_id values
 *   chunkArray<T>(items, size)
 *     — splits an array into fixed-size chunks
 *   buildConversations(contacts, messages)
 *     — full pipeline: dedupeContacts → per-contact buildConversation → sort
 *
 * No mocks needed — all five functions are purely algorithmic with no
 * Supabase / React Query / DOM dependencies.
 *
 * Covered:
 *   normalizeMessage
 *     - defined content is preserved
 *     - undefined content is coerced to ''
 *     - defined status is preserved
 *     - undefined status is coerced to null
 *     - null status stays null
 *     - undefined status_updated_at is coerced to null
 *     - all other fields pass through unchanged
 *   dedupeContacts
 *     - empty array → empty array
 *     - all-unique ids → all contacts preserved in insertion order
 *     - duplicate id → last entry overwrites the earlier one
 *   getUniqueMessageContactIds
 *     - empty messages → empty array
 *     - all null contact_ids → empty array
 *     - unique contact_ids → all returned
 *     - duplicate contact_ids → deduplicated
 *     - mixed null and non-null → only non-null returned
 *   chunkArray
 *     - empty array → empty array
 *     - divisible count: 4 items in chunks of 2 → [[a,b],[c,d]]
 *     - non-divisible: 5 items in chunks of 2 → [[a,b],[c,d],[e]]
 *     - size = 1 → each item in its own chunk
 *     - size > items.length → single chunk containing all items
 *   buildConversations
 *     - empty contacts → empty array
 *     - contact with no messages → empty messages list, null lastMessage
 *     - contact with messages → correct messages, unread count, lastMessage
 *     - messages without contact_id are ignored
 *     - duplicate contacts: last entry for the same id is used
 *     - sort: newer lastMessage.created_at appears first
 *     - sort fallback: contact with no messages uses contact.created_at
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeMessage,
  dedupeContacts,
  getUniqueMessageContactIds,
  chunkArray,
  buildConversations,
} from '../realtimeUtils';
import type { RealtimeMessage, ConversationContact } from '@/features/inbox';

// ── helpers ────────────────────────────────────────────────────────────────

function msg(over: Partial<RealtimeMessage> = {}): RealtimeMessage {
  return {
    id: 'm1',
    contact_id: 'c1',
    agent_id: null,
    content: 'hello',
    sender: 'contact',
    message_type: 'text',
    media_url: null,
    is_read: false,
    status: null,
    status_updated_at: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    external_id: null,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: null,
    ...over,
  };
}

function contact(over: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id: 'c1',
    name: 'Alice',
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    tags: null,
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    whatsapp_connection_id: null,
    contact_type: null,
    group_category: null,
    ai_sentiment: null,
    channel_type: null,
    channel_connection_id: null,
    ...over,
  };
}

// ── normalizeMessage ───────────────────────────────────────────────────────

describe('normalizeMessage — field coercion', () => {
  it('preserves content when it is a non-empty string', () => {
    const result = normalizeMessage(msg({ content: 'hi' }));
    expect(result.content).toBe('hi');
  });

  it('coerces undefined content to empty string', () => {
    const raw = msg({ content: undefined as unknown as string });
    expect(normalizeMessage(raw).content).toBe('');
  });

  it('preserves a defined status value', () => {
    const result = normalizeMessage(msg({ status: 'delivered' }));
    expect(result.status).toBe('delivered');
  });

  it('coerces undefined status to null', () => {
    const raw = msg({ status: undefined as unknown as null });
    expect(normalizeMessage(raw).status).toBeNull();
  });

  it('keeps null status as null (no-op coercion)', () => {
    expect(normalizeMessage(msg({ status: null })).status).toBeNull();
  });

  it('coerces undefined status_updated_at to null', () => {
    const raw = msg({ status_updated_at: undefined as unknown as null });
    expect(normalizeMessage(raw).status_updated_at).toBeNull();
  });

  it('preserves defined status_updated_at', () => {
    const ts = '2025-06-01T12:00:00.000Z';
    expect(normalizeMessage(msg({ status_updated_at: ts })).status_updated_at).toBe(ts);
  });

  it('passes all other fields through unchanged', () => {
    const input = msg({ id: 'xyz', sender: 'agent', is_read: true });
    const result = normalizeMessage(input);
    expect(result.id).toBe('xyz');
    expect(result.sender).toBe('agent');
    expect(result.is_read).toBe(true);
  });

  it('returns a new object (does not mutate input)', () => {
    const input = msg({ content: undefined as unknown as string });
    const result = normalizeMessage(input);
    expect(result).not.toBe(input);
    // original is unaffected
    expect(input.content).toBeUndefined();
  });
});

// ── dedupeContacts ─────────────────────────────────────────────────────────

describe('dedupeContacts — last-writer-wins by id', () => {
  it('returns an empty array for empty input', () => {
    expect(dedupeContacts([])).toEqual([]);
  });

  it('preserves all contacts when all ids are unique', () => {
    const a = contact({ id: 'c1', name: 'Alice' });
    const b = contact({ id: 'c2', name: 'Bob' });
    const result = dedupeContacts([a, b]);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.id)).toEqual(expect.arrayContaining(['c1', 'c2']));
  });

  it('last entry overwrites the first for a duplicate id', () => {
    const first  = contact({ id: 'c1', name: 'Alice-old' });
    const second = contact({ id: 'c1', name: 'Alice-new' });
    const result = dedupeContacts([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice-new');
  });

  it('handles three duplicates — only the last survives', () => {
    const a = contact({ id: 'c1', name: 'v1' });
    const b = contact({ id: 'c1', name: 'v2' });
    const c = contact({ id: 'c1', name: 'v3' });
    const result = dedupeContacts([a, b, c]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('v3');
  });
});

// ── getUniqueMessageContactIds ─────────────────────────────────────────────

describe('getUniqueMessageContactIds — unique non-null ids', () => {
  it('returns empty array for empty input', () => {
    expect(getUniqueMessageContactIds([])).toEqual([]);
  });

  it('returns empty array when all contact_ids are null', () => {
    const messages = [msg({ contact_id: null }), msg({ contact_id: null })];
    expect(getUniqueMessageContactIds(messages)).toEqual([]);
  });

  it('returns all ids when all contact_ids are unique', () => {
    const messages = [
      msg({ id: 'm1', contact_id: 'c1' }),
      msg({ id: 'm2', contact_id: 'c2' }),
      msg({ id: 'm3', contact_id: 'c3' }),
    ];
    const result = getUniqueMessageContactIds(messages);
    expect(result).toHaveLength(3);
    expect(result).toEqual(expect.arrayContaining(['c1', 'c2', 'c3']));
  });

  it('deduplicates repeated contact_ids', () => {
    const messages = [
      msg({ id: 'm1', contact_id: 'c1' }),
      msg({ id: 'm2', contact_id: 'c1' }),
      msg({ id: 'm3', contact_id: 'c2' }),
    ];
    const result = getUniqueMessageContactIds(messages);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining(['c1', 'c2']));
  });

  it('filters out null contact_ids while keeping non-null ones', () => {
    const messages = [
      msg({ id: 'm1', contact_id: 'c1' }),
      msg({ id: 'm2', contact_id: null }),
      msg({ id: 'm3', contact_id: 'c2' }),
    ];
    const result = getUniqueMessageContactIds(messages);
    expect(result).toHaveLength(2);
    expect(result).not.toContain(null);
  });
});

// ── chunkArray ─────────────────────────────────────────────────────────────

describe('chunkArray — fixed-size partitioning', () => {
  it('returns empty array for empty input', () => {
    expect(chunkArray([], 3)).toEqual([]);
  });

  it('produces even chunks when count is exactly divisible by size', () => {
    const result = chunkArray([1, 2, 3, 4], 2);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });

  it('last chunk is shorter when count is not divisible by size', () => {
    const result = chunkArray([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('size = 1 → each item in its own chunk', () => {
    expect(chunkArray(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']]);
  });

  it('size > items.length → single chunk with all items', () => {
    expect(chunkArray([10, 20], 100)).toEqual([[10, 20]]);
  });

  it('works with generic types (strings)', () => {
    const result = chunkArray(['x', 'y', 'z'], 2);
    expect(result).toEqual([['x', 'y'], ['z']]);
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 3];
    chunkArray(original, 2);
    expect(original).toEqual([1, 2, 3]);
  });
});

// ── buildConversations ─────────────────────────────────────────────────────

describe('buildConversations — full pipeline', () => {
  it('returns empty array when contacts is empty', () => {
    const messages = [msg({ id: 'm1', contact_id: 'c1' })];
    expect(buildConversations([], messages)).toEqual([]);
  });

  it('contact with no matching messages has empty messages list and null lastMessage', () => {
    const c = contact({ id: 'c1' });
    const result = buildConversations([c], []);
    expect(result).toHaveLength(1);
    expect(result[0].messages).toEqual([]);
    expect(result[0].lastMessage).toBeNull();
  });

  it('contact with matching messages builds correct conversation', () => {
    const c = contact({ id: 'c1' });
    const m = msg({ id: 'm1', contact_id: 'c1', content: 'hello', is_read: false, sender: 'contact' });
    const result = buildConversations([c], [m]);
    expect(result[0].messages).toHaveLength(1);
    expect(result[0].unreadCount).toBe(1);
    expect(result[0].lastMessage?.id).toBe('m1');
  });

  it('messages without contact_id are ignored', () => {
    const c = contact({ id: 'c1' });
    const orphan = msg({ id: 'm-orphan', contact_id: null });
    const result = buildConversations([c], [orphan]);
    expect(result[0].messages).toEqual([]);
  });

  it('duplicate contacts: last entry for the same id is used', () => {
    const old = contact({ id: 'c1', name: 'OldName' });
    const fresh = contact({ id: 'c1', name: 'NewName' });
    const result = buildConversations([old, fresh], []);
    expect(result).toHaveLength(1);
    expect(result[0].contact.name).toBe('NewName');
  });

  it('sorts by lastMessage.created_at descending (newest first)', () => {
    const c1 = contact({ id: 'c1', created_at: '2025-01-01T00:00:00.000Z' });
    const c2 = contact({ id: 'c2', created_at: '2025-01-01T00:00:00.000Z' });
    const earlyMsg  = msg({ id: 'm1', contact_id: 'c1', created_at: '2025-01-01T00:00:00.000Z' });
    const laterMsg  = msg({ id: 'm2', contact_id: 'c2', created_at: '2025-06-01T00:00:00.000Z' });
    const result = buildConversations([c1, c2], [earlyMsg, laterMsg]);
    expect(result[0].contact.id).toBe('c2');
    expect(result[1].contact.id).toBe('c1');
  });

  it('falls back to contact.created_at when there are no messages', () => {
    const older = contact({ id: 'c1', created_at: '2024-01-01T00:00:00.000Z' });
    const newer = contact({ id: 'c2', created_at: '2025-06-01T00:00:00.000Z' });
    const result = buildConversations([older, newer], []);
    // newer contact created_at → appears first
    expect(result[0].contact.id).toBe('c2');
  });

  it('messages are grouped correctly across multiple contacts', () => {
    const c1 = contact({ id: 'c1' });
    const c2 = contact({ id: 'c2' });
    const m1 = msg({ id: 'm1', contact_id: 'c1' });
    const m2 = msg({ id: 'm2', contact_id: 'c2' });
    const m3 = msg({ id: 'm3', contact_id: 'c1' });
    const result = buildConversations([c1, c2], [m1, m2, m3]);
    const conv1 = result.find((r) => r.contact.id === 'c1')!;
    const conv2 = result.find((r) => r.contact.id === 'c2')!;
    expect(conv1.messages).toHaveLength(2);
    expect(conv2.messages).toHaveLength(1);
  });
});
