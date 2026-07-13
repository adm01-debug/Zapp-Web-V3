import { describe, it, expect } from 'vitest';
import {
  jidToPhone,
  evolutionToRealtimeMessage,
  deriveContactsFromMessages,
  derivedToConversationContact,
  buildExternalConversations,
} from '../evolutionAdapter';
import type { EvolutionMessage, DerivedContact } from '@/types/evolutionExternal';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMsg(overrides: Partial<EvolutionMessage> = {}): EvolutionMessage {
  return {
    id: 'msg-1',
    message_id: 'ext-1',
    remote_jid: '5511999999999@s.whatsapp.net',
    from_me: false,
    message_type: 'conversation',
    content: 'Hello',
    media_url: null,
    media_mimetype: null,
    media_type: null,
    media_filename: null,
    media_size: null,
    caption: null,
    quoted_message_id: null,
    is_starred: false,
    is_important: false,
    category: null,
    sentiment: null,
    tags: null,
    notes: null,
    follow_up_at: null,
    follow_up_done: false,
    payload: null,
    raw_data: null,
    created_at: '2024-01-01T10:00:00Z',
    contact_id: 'contact-1',
    conversation_id: null,
    direction: 'inbound',
    status: 'delivered',
    status_at: null,
    sent_by_bot: false,
    template_name: null,
    instance_name: 'inst-1',
    push_name: 'Alice',
    deleted_at: null,
    reactions: [],
    media_meta: null,
    ptt: undefined,
    ...overrides,
  };
}

function makeDerivedContact(overrides: Partial<DerivedContact> = {}): DerivedContact {
  return {
    remoteJid: '5511999999999@s.whatsapp.net',
    pushName: 'Alice',
    phone: '5511999999999',
    lastMessageAt: '2024-01-01T10:00:00Z',
    messageCount: 1,
    unreadCount: 0,
    lastMessageContent: 'Hello',
    lastMessageDirection: 'inbound',
    instanceName: 'inst-1',
    ...overrides,
  };
}

// ── jidToPhone ────────────────────────────────────────────────────────────────

describe('jidToPhone', () => {
  it('strips @s.whatsapp.net suffix', () => {
    expect(jidToPhone('5511999999999@s.whatsapp.net')).toBe('5511999999999');
  });

  it('strips @g.us suffix for groups', () => {
    expect(jidToPhone('120363000000000000@g.us')).toBe('120363000000000000');
  });

  it('returns the input unchanged when no @ is present', () => {
    expect(jidToPhone('5511999999999')).toBe('5511999999999');
  });

  it('strips only from the first @ onwards', () => {
    expect(jidToPhone('user@example.com')).toBe('user');
  });

  it('handles empty string', () => {
    expect(jidToPhone('')).toBe('');
  });

  it('handles a bare @ with nothing before it', () => {
    expect(jidToPhone('@s.whatsapp.net')).toBe('');
  });
});

// ── evolutionToRealtimeMessage ────────────────────────────────────────────────

describe('evolutionToRealtimeMessage — sender derivation', () => {
  it('sets sender="contact" when from_me is false', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ from_me: false }));
    expect(result.sender).toBe('contact');
  });

  it('sets sender="agent" when from_me is true', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ from_me: true }));
    expect(result.sender).toBe('agent');
  });

  it('sets sender="agent" when direction is "outbound" regardless of from_me', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ from_me: false, direction: 'outbound' }));
    expect(result.sender).toBe('agent');
  });

  it('sets agent_id to "system" when from_me is true', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ from_me: true }));
    expect(result.agent_id).toBe('system');
  });

  it('sets agent_id to null when from_me is false', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ from_me: false }));
    expect(result.agent_id).toBeNull();
  });
});

describe('evolutionToRealtimeMessage — content resolution', () => {
  it('uses content field when present', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ content: 'Hello world', caption: null }));
    expect(result.content).toBe('Hello world');
  });

  it('falls back to caption when content is null', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ content: null, caption: 'Caption text' }));
    expect(result.content).toBe('Caption text');
  });

  it('uses content even if caption is also set', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ content: 'Content', caption: 'Caption' }));
    expect(result.content).toBe('Content');
  });

  it('sets placeholder "[Imagem]" for imageMessage with no content or caption', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'imageMessage', content: null, caption: null }),
    );
    expect(result.content).toBe('[Imagem]');
  });

  it('sets placeholder "[Vídeo]" for videoMessage with no content', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'videoMessage', content: null, caption: null }),
    );
    expect(result.content).toBe('[Vídeo]');
  });

  it('sets placeholder "[Áudio]" for audioMessage with no content', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'audioMessage', content: null, caption: null }),
    );
    expect(result.content).toBe('[Áudio]');
  });

  it('sets placeholder "[Localização]" for locationMessage with no content', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'locationMessage', content: null, caption: null }),
    );
    expect(result.content).toBe('[Localização]');
  });

  it('sets placeholder "[Enquete]" for pollCreationMessage with no content', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'pollCreationMessage', content: null, caption: null }),
    );
    expect(result.content).toBe('[Enquete]');
  });

  it('sets "[Mensagem Interativa]" for buttonsMessage with no content', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'buttonsMessage', content: null, caption: null }),
    );
    expect(result.content).toBe('[Mensagem Interativa]');
  });
});

describe('evolutionToRealtimeMessage — status mapping', () => {
  it('maps "sent" status correctly', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'sent' })).status).toBe('sent');
  });

  it('maps "delivered" status correctly', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'delivered' })).status).toBe('delivered');
  });

  it('maps "read" status correctly', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'read' })).status).toBe('read');
  });

  it('maps "received" to "delivered"', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'received' })).status).toBe('delivered');
  });

  it('maps "played" to "read"', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'played' })).status).toBe('read');
  });

  it('maps "failed" status correctly', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'failed' })).status).toBe('failed');
  });

  it('maps "error" to "failed"', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'error' })).status).toBe('failed');
  });

  it('maps "sending" to null (in-flight)', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'sending' })).status).toBeNull();
  });

  it('maps "deleted" to null', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'deleted' })).status).toBeNull();
  });

  it('falls back to "sent" for unknown status values', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'unknown_status' })).status).toBe('sent');
  });

  it('sets is_read=true when status is "read"', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'read' })).is_read).toBe(true);
  });

  it('sets is_read=false when status is "delivered"', () => {
    expect(evolutionToRealtimeMessage(makeMsg({ status: 'delivered' })).is_read).toBe(false);
  });
});

describe('evolutionToRealtimeMessage — identity fields', () => {
  it('sets id from evo.id', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ id: 'my-uuid' }));
    expect(result.id).toBe('my-uuid');
  });

  it('sets external_id from evo.message_id', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ message_id: 'wa-ext-id' }));
    expect(result.external_id).toBe('wa-ext-id');
  });

  it('sets contact_id from evo.contact_id when present', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ contact_id: 'c-uuid', remote_jid: 'other' }));
    expect(result.contact_id).toBe('c-uuid');
  });

  it('falls back to remote_jid when contact_id is null', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ contact_id: null, remote_jid: 'jid-1' }));
    expect(result.contact_id).toBe('jid-1');
  });

  it('preserves created_at timestamp', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ created_at: '2024-06-15T08:00:00Z' }));
    expect(result.created_at).toBe('2024-06-15T08:00:00Z');
  });

  it('sets is_deleted=true when deleted_at is set', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ deleted_at: '2024-01-01T12:00:00Z' }));
    expect(result.is_deleted).toBe(true);
  });

  it('sets is_deleted=false when deleted_at is null', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ deleted_at: null }));
    expect(result.is_deleted).toBe(false);
  });
});

describe('evolutionToRealtimeMessage — PTT (voice note) meta', () => {
  it('copies ptt from top-level field into media_meta when media_meta.ptt is absent', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'audioMessage', ptt: true, media_meta: null }),
    );
    expect((result as unknown as { media_meta?: { ptt?: boolean } }).media_meta?.ptt).toBe(true);
  });

  it('does not overwrite existing media_meta.ptt', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'audioMessage', ptt: false, media_meta: { ptt: true } }),
    );
    expect((result as unknown as { media_meta?: { ptt?: boolean } }).media_meta?.ptt).toBe(true);
  });

  it('ignores ptt for non-audio messages', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'imageMessage', ptt: true, media_meta: null }),
    );
    expect((result as unknown as { media_meta?: { ptt?: boolean } }).media_meta?.ptt).toBeUndefined();
  });

  it('handles array media_meta gracefully (treats as empty object)', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ message_type: 'audioMessage', ptt: true, media_meta: [] as unknown as Record<string, unknown> }),
    );
    expect((result as unknown as { media_meta?: { ptt?: boolean } }).media_meta?.ptt).toBe(true);
  });
});

describe('evolutionToRealtimeMessage — reactions field', () => {
  it('passes reactions array through unchanged', () => {
    const reactions = [{ text: '👍', key: { remoteJid: 'jid', fromMe: true, id: 'r1' } }];
    const result = evolutionToRealtimeMessage(makeMsg({ reactions }));
    expect(result.reactions).toEqual(reactions);
  });

  it('returns empty array when reactions is null', () => {
    const result = evolutionToRealtimeMessage(makeMsg({ reactions: null }));
    expect(result.reactions).toEqual([]);
  });

  it('returns empty array when reactions is not an array', () => {
    const result = evolutionToRealtimeMessage(
      makeMsg({ reactions: 'invalid' as unknown as never }),
    );
    expect(result.reactions).toEqual([]);
  });
});

// ── deriveContactsFromMessages ────────────────────────────────────────────────

describe('deriveContactsFromMessages — basic grouping', () => {
  it('returns empty array for no messages', () => {
    expect(deriveContactsFromMessages([])).toEqual([]);
  });

  it('skips messages with no remote_jid', () => {
    const msg = makeMsg({ remote_jid: '' as unknown as string });
    // The function uses !msg.remote_jid to skip
    const result = deriveContactsFromMessages([msg as unknown as EvolutionMessage]);
    expect(result).toEqual([]);
  });

  it('creates one contact entry per unique remote_jid', () => {
    const msgs = [
      makeMsg({ id: '1', remote_jid: 'a@s.whatsapp.net' }),
      makeMsg({ id: '2', remote_jid: 'b@s.whatsapp.net' }),
    ];
    const result = deriveContactsFromMessages(msgs);
    expect(result).toHaveLength(2);
  });

  it('groups multiple messages from the same JID into one contact', () => {
    const msgs = [
      makeMsg({ id: '1', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T10:00:00Z' }),
      makeMsg({ id: '2', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T11:00:00Z' }),
    ];
    const result = deriveContactsFromMessages(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].messageCount).toBe(2);
  });
});

describe('deriveContactsFromMessages — unread counting', () => {
  it('counts unread for incoming unread messages', () => {
    const msgs = [
      makeMsg({ id: '1', from_me: false, status: 'delivered' }),
      makeMsg({ id: '2', from_me: false, status: 'delivered' }),
    ];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].unreadCount).toBe(2);
  });

  it('does not count outgoing messages as unread', () => {
    const msgs = [makeMsg({ from_me: true, status: 'delivered' })];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].unreadCount).toBe(0);
  });

  it('does not count already-read incoming messages as unread', () => {
    const msgs = [makeMsg({ from_me: false, status: 'read' })];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].unreadCount).toBe(0);
  });
});

describe('deriveContactsFromMessages — sorting', () => {
  it('sorts contacts with newer messages first', () => {
    const msgs = [
      makeMsg({ id: '1', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T08:00:00Z' }),
      makeMsg({ id: '2', remote_jid: 'b@s.whatsapp.net', created_at: '2024-01-01T12:00:00Z' }),
    ];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].remoteJid).toBe('b@s.whatsapp.net');
    expect(result[1].remoteJid).toBe('a@s.whatsapp.net');
  });

  it('updates lastMessageAt to the most recent message timestamp', () => {
    const msgs = [
      makeMsg({ id: '1', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T08:00:00Z' }),
      makeMsg({ id: '2', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T12:00:00Z' }),
    ];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].lastMessageAt).toBe('2024-01-01T12:00:00Z');
  });
});

describe('deriveContactsFromMessages — pushName handling', () => {
  it('takes pushName from the first non-from_me message that has one', () => {
    const msgs = [makeMsg({ from_me: false, push_name: 'Alice' })];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].pushName).toBe('Alice');
  });

  it('ignores pushName from from_me messages', () => {
    const msgs = [makeMsg({ from_me: true, push_name: 'Me' })];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].pushName).toBeNull();
  });

  it('ignores pushName "Você" (self label)', () => {
    const msgs = [makeMsg({ from_me: false, push_name: 'Você' })];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].pushName).toBeNull();
  });

  it('does not overwrite an already-set pushName with a later null', () => {
    const msgs = [
      makeMsg({ id: '1', from_me: false, push_name: 'Alice', created_at: '2024-01-01T08:00:00Z' }),
      makeMsg({ id: '2', from_me: false, push_name: null, created_at: '2024-01-01T09:00:00Z' }),
    ];
    const result = deriveContactsFromMessages(msgs);
    expect(result[0].pushName).toBe('Alice');
  });
});

describe('deriveContactsFromMessages — tag merging', () => {
  it('merges tags from multiple messages for the same contact', () => {
    const msgs = [
      makeMsg({ id: '1', tags: ['vip', 'cliente'], created_at: '2024-01-01T08:00:00Z' }),
      makeMsg({ id: '2', tags: ['cliente', 'lead'], created_at: '2024-01-01T09:00:00Z' }),
    ];
    const result = deriveContactsFromMessages(msgs);
    const tags = result[0].tags || [];
    expect(tags).toContain('vip');
    expect(tags).toContain('cliente');
    expect(tags).toContain('lead');
    expect(new Set(tags).size).toBe(tags.length);
  });
});

// ── derivedToConversationContact ──────────────────────────────────────────────

describe('derivedToConversationContact', () => {
  it('uses pushName as name when available', () => {
    const dc = makeDerivedContact({ pushName: 'Alice' });
    expect(derivedToConversationContact(dc).name).toBe('Alice');
  });

  it('falls back to phone as name when pushName is null', () => {
    const dc = makeDerivedContact({ pushName: null, phone: '5511999' });
    expect(derivedToConversationContact(dc).name).toBe('5511999');
  });

  it('sets id to remoteJid', () => {
    const dc = makeDerivedContact({ remoteJid: 'jid-123' });
    expect(derivedToConversationContact(dc).id).toBe('jid-123');
  });

  it('sets phone field', () => {
    const dc = makeDerivedContact({ phone: '5511988887777' });
    expect(derivedToConversationContact(dc).phone).toBe('5511988887777');
  });

  it('sets avatar_url from profilePictureUrl', () => {
    const dc = makeDerivedContact({ profilePictureUrl: 'https://example.com/pic.jpg' });
    expect(derivedToConversationContact(dc).avatar_url).toBe('https://example.com/pic.jpg');
  });

  it('sets avatar_url to null when profilePictureUrl is absent', () => {
    const dc = makeDerivedContact();
    expect(derivedToConversationContact(dc).avatar_url).toBeNull();
  });

  it('sets contact_type to "whatsapp"', () => {
    expect(derivedToConversationContact(makeDerivedContact()).contact_type).toBe('whatsapp');
  });

  it('sets channel_type to "whatsapp"', () => {
    expect(derivedToConversationContact(makeDerivedContact()).channel_type).toBe('whatsapp');
  });

  it('passes tags array through', () => {
    const dc = makeDerivedContact({ tags: ['vip', 'lead'] });
    expect(derivedToConversationContact(dc).tags).toEqual(['vip', 'lead']);
  });

  it('defaults tags to [] when absent', () => {
    const dc = makeDerivedContact({ tags: undefined });
    expect(derivedToConversationContact(dc).tags).toEqual([]);
  });

  it('passes ai_sentiment through when set', () => {
    const dc = makeDerivedContact({ ai_sentiment: 'positive' });
    expect(derivedToConversationContact(dc).ai_sentiment).toBe('positive');
  });

  it('sets ai_sentiment to null when absent', () => {
    const dc = makeDerivedContact({ ai_sentiment: undefined });
    expect(derivedToConversationContact(dc).ai_sentiment).toBeNull();
  });
});

// ── buildExternalConversations ────────────────────────────────────────────────

describe('buildExternalConversations', () => {
  it('returns empty array for no messages', () => {
    expect(buildExternalConversations([])).toEqual([]);
  });

  it('builds one ConversationWithMessages per unique remote_jid', () => {
    const msgs = [
      makeMsg({ id: '1', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T10:00:00Z' }),
      makeMsg({ id: '2', remote_jid: 'b@s.whatsapp.net', created_at: '2024-01-01T11:00:00Z' }),
    ];
    const result = buildExternalConversations(msgs);
    expect(result).toHaveLength(2);
  });

  it('attaches all realtime messages to the correct contact', () => {
    const msgs = [
      makeMsg({ id: '1', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T08:00:00Z' }),
      makeMsg({ id: '2', remote_jid: 'a@s.whatsapp.net', created_at: '2024-01-01T09:00:00Z' }),
      makeMsg({ id: '3', remote_jid: 'b@s.whatsapp.net', created_at: '2024-01-01T10:00:00Z' }),
    ];
    const result = buildExternalConversations(msgs);
    const convA = result.find((c) => c.contact.id === 'a@s.whatsapp.net');
    expect(convA?.messages).toHaveLength(2);
  });

  it('sets unreadCount based on non-read incoming messages', () => {
    const msgs = [
      makeMsg({ id: '1', from_me: false, status: 'delivered' }),
      makeMsg({ id: '2', from_me: false, status: 'delivered' }),
      makeMsg({ id: '3', from_me: false, status: 'read' }),
    ];
    const result = buildExternalConversations(msgs);
    expect(result[0].unreadCount).toBe(2);
  });

  it('sets lastMessage to the chronologically last message', () => {
    const msgs = [
      makeMsg({ id: '1', content: 'First', created_at: '2024-01-01T08:00:00Z' }),
      makeMsg({ id: '2', content: 'Second', created_at: '2024-01-01T09:00:00Z' }),
    ];
    const result = buildExternalConversations(msgs);
    expect(result[0].lastMessage?.content).toBe('Second');
  });

  it('messages inside each conversation are sorted oldest-first', () => {
    const msgs = [
      makeMsg({ id: '2', created_at: '2024-01-01T09:00:00Z' }),
      makeMsg({ id: '1', created_at: '2024-01-01T08:00:00Z' }),
    ];
    const result = buildExternalConversations(msgs);
    expect(result[0].messages[0].created_at).toBe('2024-01-01T08:00:00Z');
    expect(result[0].messages[1].created_at).toBe('2024-01-01T09:00:00Z');
  });

  it('conversations are sorted newest-first by lastMessageAt', () => {
    const msgs = [
      makeMsg({ id: '1', remote_jid: 'old@s.whatsapp.net', created_at: '2024-01-01T08:00:00Z' }),
      makeMsg({ id: '2', remote_jid: 'new@s.whatsapp.net', created_at: '2024-01-01T12:00:00Z' }),
    ];
    const result = buildExternalConversations(msgs);
    expect(result[0].contact.id).toBe('new@s.whatsapp.net');
    expect(result[1].contact.id).toBe('old@s.whatsapp.net');
  });

  it('contact has no messages when all messages lack remote_jid', () => {
    const msg = makeMsg({ remote_jid: '' as unknown as string });
    const result = buildExternalConversations([msg as unknown as EvolutionMessage]);
    expect(result).toHaveLength(0);
  });
});
