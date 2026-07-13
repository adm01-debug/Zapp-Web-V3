import { describe, it, expect } from 'vitest';
import { mapToLegacyConversation, mapToLegacyMessages } from '../inboxLegacyMapper';
import type { ConversationWithMessages, RealtimeMessage, ConversationContact } from '@/features/inbox/hooks/realtime/types';

// ── fixtures ────────────────────────────────────────────────────────────────

function makeContact(overrides: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id: 'contact-1',
    name: 'Alice',
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    tags: [],
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    whatsapp_connection_id: null,
    contact_type: 'whatsapp',
    group_category: null,
    ai_sentiment: null,
    channel_type: 'whatsapp',
    channel_connection_id: null,
    ...overrides,
  };
}

function makeRealtimeMessage(overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
  return {
    id: 'msg-1',
    contact_id: 'contact-1',
    agent_id: null,
    content: 'Hello',
    sender: 'contact',
    message_type: 'text',
    media_url: null,
    is_read: false,
    status: 'delivered',
    status_updated_at: null,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    external_id: null,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: false,
    deleted_at: null,
    contactAvatar: null,
    reactions: [],
    ...overrides,
  };
}

function makeConversation(overrides: Partial<ConversationWithMessages> = {}): ConversationWithMessages {
  const contact = overrides.contact ?? makeContact();
  const messages = overrides.messages ?? [];
  const lastMessage = overrides.lastMessage !== undefined ? overrides.lastMessage : null;
  return { contact, messages, unreadCount: overrides.unreadCount ?? 0, lastMessage };
}

// ── mapToLegacyConversation — null guard ─────────────────────────────────────

describe('mapToLegacyConversation — null input', () => {
  it('returns null when input is null', () => {
    expect(mapToLegacyConversation(null)).toBeNull();
  });
});

// ── mapToLegacyConversation — top-level fields ───────────────────────────────

describe('mapToLegacyConversation — top-level fields', () => {
  it('uses contact.id as conversation id', () => {
    const result = mapToLegacyConversation(makeConversation());
    expect(result!.id).toBe('contact-1');
  });

  it('maps unreadCount correctly', () => {
    const result = mapToLegacyConversation(makeConversation({ unreadCount: 7 }));
    expect(result!.unreadCount).toBe(7);
  });

  it('sets status to "open"', () => {
    expect(mapToLegacyConversation(makeConversation())!.status).toBe('open');
  });

  it('sets priority to "medium"', () => {
    expect(mapToLegacyConversation(makeConversation())!.priority).toBe('medium');
  });

  it('maps tags from contact', () => {
    const conv = makeConversation({ contact: makeContact({ tags: ['vip', 'premium'] }) });
    expect(mapToLegacyConversation(conv)!.tags).toEqual(['vip', 'premium']);
  });

  it('falls back to empty tags array when contact.tags is null', () => {
    const conv = makeConversation({ contact: makeContact({ tags: null }) });
    expect(mapToLegacyConversation(conv)!.tags).toEqual([]);
  });

  it('sets createdAt as Date from contact.created_at', () => {
    const conv = makeConversation({ contact: makeContact({ created_at: '2024-03-15T12:00:00Z' }) });
    const result = mapToLegacyConversation(conv)!;
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.toISOString()).toBe('2024-03-15T12:00:00.000Z');
  });

  it('sets updatedAt as Date from contact.updated_at', () => {
    const conv = makeConversation({ contact: makeContact({ updated_at: '2024-06-01T09:30:00Z' }) });
    const result = mapToLegacyConversation(conv)!;
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.updatedAt.toISOString()).toBe('2024-06-01T09:30:00.000Z');
  });
});

// ── mapToLegacyConversation — contact sub-object ──────────────────────────────

describe('mapToLegacyConversation — contact fields', () => {
  it('maps contact.id, name, phone', () => {
    const conv = makeConversation({
      contact: makeContact({ id: 'c-abc', name: 'Bob', phone: '5521888888888' }),
    });
    const c = mapToLegacyConversation(conv)!.contact;
    expect(c.id).toBe('c-abc');
    expect(c.name).toBe('Bob');
    expect(c.phone).toBe('5521888888888');
  });

  it('maps email when present', () => {
    const conv = makeConversation({ contact: makeContact({ email: 'alice@example.com' }) });
    expect(mapToLegacyConversation(conv)!.contact.email).toBe('alice@example.com');
  });

  it('converts null email to undefined', () => {
    const conv = makeConversation({ contact: makeContact({ email: null }) });
    expect(mapToLegacyConversation(conv)!.contact.email).toBeUndefined();
  });

  it('maps avatar_url to avatar when present', () => {
    const conv = makeConversation({ contact: makeContact({ avatar_url: 'https://example.com/avatar.jpg' }) });
    expect(mapToLegacyConversation(conv)!.contact.avatar).toBe('https://example.com/avatar.jpg');
  });

  it('converts null avatar_url to undefined', () => {
    const conv = makeConversation({ contact: makeContact({ avatar_url: null }) });
    expect(mapToLegacyConversation(conv)!.contact.avatar).toBeUndefined();
  });

  it('maps contact tags', () => {
    const conv = makeConversation({ contact: makeContact({ tags: ['lead'] }) });
    expect(mapToLegacyConversation(conv)!.contact.tags).toEqual(['lead']);
  });

  it('maps null tags to empty array in contact', () => {
    const conv = makeConversation({ contact: makeContact({ tags: null }) });
    expect(mapToLegacyConversation(conv)!.contact.tags).toEqual([]);
  });

  it('maps createdAt on contact as Date', () => {
    const conv = makeConversation({ contact: makeContact({ created_at: '2024-02-01T00:00:00Z' }) });
    expect(mapToLegacyConversation(conv)!.contact.createdAt).toBeInstanceOf(Date);
  });

  it('maps contact_type when present', () => {
    const conv = makeConversation({ contact: makeContact({ contact_type: 'cliente' }) });
    expect(mapToLegacyConversation(conv)!.contact.contact_type).toBe('cliente');
  });

  it('converts null contact_type to undefined', () => {
    const conv = makeConversation({ contact: makeContact({ contact_type: null }) });
    expect(mapToLegacyConversation(conv)!.contact.contact_type).toBeUndefined();
  });

  it('maps whatsapp_connection_id when present', () => {
    const conv = makeConversation({ contact: makeContact({ whatsapp_connection_id: 'wc-123' }) });
    expect(mapToLegacyConversation(conv)!.contact.whatsapp_connection_id).toBe('wc-123');
  });

  it('converts null whatsapp_connection_id to undefined', () => {
    const conv = makeConversation({ contact: makeContact({ whatsapp_connection_id: null }) });
    expect(mapToLegacyConversation(conv)!.contact.whatsapp_connection_id).toBeUndefined();
  });
});

// ── mapToLegacyConversation — lastMessage ─────────────────────────────────────

describe('mapToLegacyConversation — lastMessage', () => {
  it('returns undefined lastMessage when resolved.lastMessage is null', () => {
    const result = mapToLegacyConversation(makeConversation({ lastMessage: null }));
    expect(result!.lastMessage).toBeUndefined();
  });

  it('maps lastMessage when present', () => {
    const msg = makeRealtimeMessage({ content: 'Hi there', sender: 'agent', message_type: 'text' });
    const result = mapToLegacyConversation(makeConversation({ lastMessage: msg }));
    expect(result!.lastMessage).toBeDefined();
  });

  it('maps lastMessage.id from message id', () => {
    const msg = makeRealtimeMessage({ id: 'msg-xyz' });
    const result = mapToLegacyConversation(makeConversation({ lastMessage: msg }));
    expect(result!.lastMessage!.id).toBe('msg-xyz');
  });

  it('maps lastMessage.conversationId from contact.id', () => {
    const msg = makeRealtimeMessage();
    const conv = makeConversation({ contact: makeContact({ id: 'c-999' }), lastMessage: msg });
    expect(mapToLegacyConversation(conv)!.lastMessage!.conversationId).toBe('c-999');
  });

  it('maps lastMessage.content', () => {
    const msg = makeRealtimeMessage({ content: 'Olá!' });
    const result = mapToLegacyConversation(makeConversation({ lastMessage: msg }));
    expect(result!.lastMessage!.content).toBe('Olá!');
  });

  it('maps lastMessage.type from message_type', () => {
    const msg = makeRealtimeMessage({ message_type: 'image' });
    const result = mapToLegacyConversation(makeConversation({ lastMessage: msg }));
    expect(result!.lastMessage!.type).toBe('image');
  });

  it('maps lastMessage.sender', () => {
    const msg = makeRealtimeMessage({ sender: 'agent' });
    const result = mapToLegacyConversation(makeConversation({ lastMessage: msg }));
    expect(result!.lastMessage!.sender).toBe('agent');
  });

  it('maps lastMessage.timestamp as Date from created_at', () => {
    const msg = makeRealtimeMessage({ created_at: '2024-05-10T14:30:00Z' });
    const result = mapToLegacyConversation(makeConversation({ lastMessage: msg }));
    expect(result!.lastMessage!.timestamp).toBeInstanceOf(Date);
    expect(result!.lastMessage!.timestamp.toISOString()).toBe('2024-05-10T14:30:00.000Z');
  });

  it('always sets lastMessage.status to "read"', () => {
    const msg = makeRealtimeMessage({ status: 'sent' });
    const result = mapToLegacyConversation(makeConversation({ lastMessage: msg }));
    expect(result!.lastMessage!.status).toBe('read');
  });
});

// ── mapToLegacyMessages — basic mapping ───────────────────────────────────────

describe('mapToLegacyMessages — basic field mapping', () => {
  it('returns an empty array for empty input', () => {
    expect(mapToLegacyMessages([], 'c-1')).toEqual([]);
  });

  it('maps one message to one output', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage()], 'c-1');
    expect(result).toHaveLength(1);
  });

  it('maps all messages in order', () => {
    const msgs = [
      makeRealtimeMessage({ id: 'm1' }),
      makeRealtimeMessage({ id: 'm2' }),
      makeRealtimeMessage({ id: 'm3' }),
    ];
    const result = mapToLegacyMessages(msgs, 'c-1');
    expect(result.map(m => m.id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('maps id from message id', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ id: 'unique-id' })], 'c-1');
    expect(result[0].id).toBe('unique-id');
  });

  it('sets conversationId from the contactId parameter', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage()], 'my-contact');
    expect(result[0].conversationId).toBe('my-contact');
  });

  it('maps content', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ content: 'Test content' })], 'c-1');
    expect(result[0].content).toBe('Test content');
  });

  it('maps type from message_type', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ message_type: 'audio' })], 'c-1');
    expect(result[0].type).toBe('audio');
  });

  it('maps sender', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ sender: 'agent' })], 'c-1');
    expect(result[0].sender).toBe('agent');
  });

  it('maps agentId from agent_id when present', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ agent_id: 'agent-abc' })], 'c-1');
    expect(result[0].agentId).toBe('agent-abc');
  });

  it('converts null agent_id to undefined', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ agent_id: null })], 'c-1');
    expect(result[0].agentId).toBeUndefined();
  });

  it('converts created_at to a Date timestamp', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ created_at: '2024-07-04T12:00:00Z' })], 'c-1');
    expect(result[0].timestamp).toBeInstanceOf(Date);
    expect(result[0].timestamp.toISOString()).toBe('2024-07-04T12:00:00.000Z');
  });
});

// ── mapToLegacyMessages — status resolution ───────────────────────────────────

describe('mapToLegacyMessages — status resolution', () => {
  it('uses m.status when it is non-null', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ status: 'sent', is_read: false })], 'c-1');
    expect(result[0].status).toBe('sent');
  });

  it('uses "read" fallback when status is null and is_read is true', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ status: null, is_read: true })], 'c-1');
    expect(result[0].status).toBe('read');
  });

  it('uses "delivered" fallback when status is null and is_read is false', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ status: null, is_read: false })], 'c-1');
    expect(result[0].status).toBe('delivered');
  });

  it('uses "delivered" fallback when status is null and is_read is null', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ status: null, is_read: null })], 'c-1');
    expect(result[0].status).toBe('delivered');
  });

  it('passes through "failed" status', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ status: 'failed' })], 'c-1');
    expect(result[0].status).toBe('failed');
  });
});

// ── mapToLegacyMessages — optional fields ─────────────────────────────────────

describe('mapToLegacyMessages — optional fields', () => {
  it('maps mediaUrl from media_url when present', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ media_url: 'https://example.com/file.jpg' })], 'c-1');
    expect(result[0].mediaUrl).toBe('https://example.com/file.jpg');
  });

  it('converts null media_url to undefined', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ media_url: null })], 'c-1');
    expect(result[0].mediaUrl).toBeUndefined();
  });

  it('maps transcription when present', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ transcription: 'Olá, tudo bem?' })], 'c-1');
    expect(result[0].transcription).toBe('Olá, tudo bem?');
  });

  it('maps null transcription to null', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ transcription: null })], 'c-1');
    expect(result[0].transcription).toBeNull();
  });

  it('maps transcriptionStatus when present', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ transcription_status: 'completed' })], 'c-1');
    expect(result[0].transcriptionStatus).toBe('completed');
  });

  it('maps null transcriptionStatus to null', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ transcription_status: null })], 'c-1');
    expect(result[0].transcriptionStatus).toBeNull();
  });

  it('maps is_deleted', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ is_deleted: true })], 'c-1');
    expect(result[0].is_deleted).toBe(true);
  });

  it('falls back to false when is_deleted is null', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ is_deleted: null })], 'c-1');
    expect(result[0].is_deleted).toBe(false);
  });

  it('maps external_id when present', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ external_id: 'ext-abc' })], 'c-1');
    expect(result[0].external_id).toBe('ext-abc');
  });

  it('converts null external_id to undefined', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ external_id: null })], 'c-1');
    expect(result[0].external_id).toBeUndefined();
  });

  it('maps retry_attempt', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ retry_attempt: 2 })], 'c-1');
    expect(result[0].retry_attempt).toBe(2);
  });

  it('maps retry_total', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ retry_total: 3 })], 'c-1');
    expect(result[0].retry_total).toBe(3);
  });

  it('maps null retry_attempt to null', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ retry_attempt: null })], 'c-1');
    expect(result[0].retry_attempt).toBeNull();
  });
});

// ── mapToLegacyMessages — contactAvatar resolution ───────────────────────────

describe('mapToLegacyMessages — contactAvatar resolution', () => {
  it('uses message contactAvatar when present', () => {
    const result = mapToLegacyMessages(
      [makeRealtimeMessage({ contactAvatar: 'https://avatar.com/msg.jpg' })],
      'c-1',
      'https://avatar.com/param.jpg',
    );
    expect(result[0].contactAvatar).toBe('https://avatar.com/msg.jpg');
  });

  it('falls back to parameter contactAvatar when message has none', () => {
    const result = mapToLegacyMessages(
      [makeRealtimeMessage({ contactAvatar: null })],
      'c-1',
      'https://avatar.com/fallback.jpg',
    );
    expect(result[0].contactAvatar).toBe('https://avatar.com/fallback.jpg');
  });

  it('returns null/undefined when both message and parameter avatars are absent', () => {
    const result = mapToLegacyMessages([makeRealtimeMessage({ contactAvatar: null })], 'c-1');
    expect(result[0].contactAvatar ?? null).toBeNull();
  });

  it('applies per-message avatar independently across messages', () => {
    const msgs = [
      makeRealtimeMessage({ id: 'm1', contactAvatar: 'https://a.com/1.jpg' }),
      makeRealtimeMessage({ id: 'm2', contactAvatar: null }),
    ];
    const result = mapToLegacyMessages(msgs, 'c-1', 'https://a.com/fallback.jpg');
    expect(result[0].contactAvatar).toBe('https://a.com/1.jpg');
    expect(result[1].contactAvatar).toBe('https://a.com/fallback.jpg');
  });
});
