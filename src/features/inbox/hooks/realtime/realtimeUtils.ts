import type { RealtimeMessage, ConversationContact, ConversationWithMessages } from '@/features/inbox';


export function normalizeMessage(message: RealtimeMessage): RealtimeMessage {
  return {
    ...message,
    content: message.content ?? '',
    status: message.status ?? null,
    status_updated_at: message.status_updated_at ?? null,
  };
}

export function sortMessagesByCreatedAt(messages: RealtimeMessage[]): RealtimeMessage[] {
  return [...messages].sort((a, b) => {
    const dateA = new Date(a.created_at || 0).getTime();
    const dateB = new Date(b.created_at || 0).getTime();
    if (dateA !== dateB) return dateA - dateB;
    // Tie-break with ID for stable sort if timestamps are identical
    return (a.id || "").localeCompare(b.id || "");
  });
}

/**
 * Deterministic dedup by `id` (fallback to `external_id`). When the same key
 * appears more than once, keep the entry with the most recent
 * `status_updated_at`/`created_at` — this prevents realtime races between
 * optimistic INSERT + status UPDATE from producing duplicate bubbles.
 */
export function dedupeMessages(messages: RealtimeMessage[]): RealtimeMessage[] {
  const byKey = new Map<string, RealtimeMessage>();
  for (const raw of messages) {
    if (!raw) continue;
    const key = String(raw.id || raw.external_id || '');
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, raw);
      continue;
    }
    const prevTs = new Date(prev.status_updated_at || prev.created_at || 0).getTime();
    const nextTs = new Date(raw.status_updated_at || raw.created_at || 0).getTime();
    byKey.set(key, nextTs >= prevTs ? raw : prev);
  }
  return Array.from(byKey.values());
}

export function buildConversation(
  contact: ConversationContact,
  messages: RealtimeMessage[]
): ConversationWithMessages {
  const sortedMessages = sortMessagesByCreatedAt(dedupeMessages(messages));
  const unreadCount = sortedMessages.filter(
    (message) => !message.is_read && message.sender === 'contact'
  ).length;
  const lastMessage = sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1] : null;

  return { contact, messages: sortedMessages, unreadCount, lastMessage };
}

export function dedupeContacts(contacts: ConversationContact[]): ConversationContact[] {
  const contactsMap = new Map<string, ConversationContact>();
  contacts.forEach((contact) => contactsMap.set(contact.id, contact));
  return Array.from(contactsMap.values());
}

export function getUniqueMessageContactIds(messages: RealtimeMessage[]): string[] {
  return Array.from(
    new Set(messages.map((m) => m.contact_id).filter((id): id is string => Boolean(id)))
  );
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function buildConversations(
  contacts: ConversationContact[],
  messages: RealtimeMessage[]
): ConversationWithMessages[] {
  const messagesByContact = new Map<string, RealtimeMessage[]>();
  messages.forEach((message) => {
    if (!message.contact_id) return;
    const existing = messagesByContact.get(message.contact_id) ?? [];
    existing.push(message);
    messagesByContact.set(message.contact_id, existing);
  });

  return dedupeContacts(contacts)
    .map((contact) => buildConversation(contact, messagesByContact.get(contact.id) ?? []))
    .sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.contact.created_at;
      const bTime = b.lastMessage?.created_at || b.contact.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
}
