import { describe, it, expect } from 'vitest';
import { dedupeMessages, sortMessagesByCreatedAt, buildConversation } from '../realtimeUtils';
import type { RealtimeMessage, ConversationContact } from '@/features/inbox';

const msg = (over: Partial<RealtimeMessage>): RealtimeMessage =>
  ({
    id: 'm1',
    contact_id: 'c1',
    content: '',
    sender: 'contact',
    is_read: false,
    created_at: '2025-01-01T00:00:00.000Z',
    status: null,
    status_updated_at: null,
    ...over,
  }) as RealtimeMessage;

describe('dedupeMessages', () => {
  it('drops duplicates by id keeping the newest status_updated_at', () => {
    const a = msg({ id: 'm1', status: 'sent', status_updated_at: '2025-01-01T00:00:00.000Z' });
    const b = msg({ id: 'm1', status: 'read', status_updated_at: '2025-01-01T00:05:00.000Z' });
    const out = dedupeMessages([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('read');
  });

  it('falls back to external_id when id is missing', () => {
    const a = msg({ id: '', external_id: 'evo-1', content: 'oi' } as never);
    const b = msg({ id: '', external_id: 'evo-1', content: 'oi (retry)' } as never);
    expect(dedupeMessages([a, b])).toHaveLength(1);
  });

  it('preserves distinct ids', () => {
    expect(dedupeMessages([msg({ id: 'a' }), msg({ id: 'b' })])).toHaveLength(2);
  });

  it('sort is stable using (created_at, id)', () => {
    const t = '2025-01-01T00:00:00.000Z';
    const sorted = sortMessagesByCreatedAt([
      msg({ id: 'b', created_at: t }),
      msg({ id: 'a', created_at: t }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('buildConversation dedupes before computing lastMessage/unread', () => {
    const contact = { id: 'c1', created_at: '2025-01-01T00:00:00.000Z' } as ConversationContact;
    const dup = msg({ id: 'm1', is_read: false, sender: 'contact' });
    const conv = buildConversation(contact, [dup, dup, dup]);
    expect(conv.messages).toHaveLength(1);
    expect(conv.unreadCount).toBe(1);
  });
});
