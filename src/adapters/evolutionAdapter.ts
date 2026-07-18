/**
 * Replaces evolutionAdapter.ts with a more modular structure
 */
import type { EvolutionMessage, DerivedContact } from '@/types/evolutionExternal';
import type {
  RealtimeMessage,
  ConversationContact,
  ConversationWithMessages,
} from '@/features/inbox';
import { extractMessageType } from './evolution/messageTypes';

export * from './evolution/messageTypes';

export function jidToPhone(jid: string): string {
  return jid.replace(/@.*$/, '');
}

export function evolutionToRealtimeMessage(evo: EvolutionMessage): RealtimeMessage {
  const msgType = extractMessageType(evo.message_type);
  let content = evo.content || evo.caption || '';

  if (!content && msgType.category === 'media') content = `[${msgType.label}]`;
  else if (!content && msgType.category === 'location') content = '[Localização]';
  else if (!content && msgType.category === 'poll') content = '[Enquete]';
  else if (!content && msgType.category === 'interactive') content = '[Mensagem Interativa]';

  const mediaMeta = (Array.isArray(evo.media_meta) ? {} : evo.media_meta || {}) as Record<
    string,
    unknown
  >;
  if (
    (evo.message_type === 'audioMessage' || evo.message_type === 'audio') &&
    mediaMeta.ptt === undefined &&
    evo.ptt !== undefined
  ) {
    mediaMeta.ptt = evo.ptt;
  }

  return {
    id: evo.id,
    contact_id: evo.contact_id || evo.remote_jid,
    agent_id: evo.from_me ? 'system' : null,
    content,
    sender: evo.from_me || evo.direction === 'outbound' ? 'agent' : 'contact',
    message_type: msgType.internalType,
    media_url: evo.media_url,
    is_read: evo.status === 'read',
    status: mapStatus(evo.status),
    status_updated_at: evo.status_at,
    created_at: evo.created_at,
    updated_at: evo.created_at,
    external_id: evo.message_id,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: evo.deleted_at != null,
    deleted_at: evo.deleted_at ?? null,
    contactAvatar: null,
    media_meta: mediaMeta,
    reactions: Array.isArray(evo.reactions)
      ? evo.reactions.map((r) => ({
          user_id: r.key?.remoteJid ?? '',
          emoji: r.text ?? '',
        }))
      : [],
  };
}

function mapStatus(evoStatus: string): 'sent' | 'delivered' | 'read' | 'failed' | null {
  const mapping: Record<string, 'sent' | 'delivered' | 'read' | 'failed' | null> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    received: 'delivered',
    played: 'read',
    failed: 'failed',
    error: 'failed',
    sending: null, // in-flight; client shows pending indicator
    deleted: null, // deleted messages carry no delivery status
  };
  return Object.prototype.hasOwnProperty.call(mapping, evoStatus) ? mapping[evoStatus] : 'sent';
}

export function deriveContactsFromMessages(messages: EvolutionMessage[]): DerivedContact[] {
  const contactMap = new Map<string, DerivedContact>();
  for (const msg of messages) {
    if (!msg.remote_jid) continue;
    const existing = contactMap.get(msg.remote_jid);
    const isUnread = !msg.from_me && msg.status !== 'read';
    const safePushName =
      !msg.from_me && msg.push_name && msg.push_name !== 'Você' ? msg.push_name : undefined;

    if (!existing) {
      contactMap.set(msg.remote_jid, {
        remoteJid: msg.remote_jid,
        pushName: safePushName ?? null,
        phone: jidToPhone(msg.remote_jid),
        lastMessageAt: msg.created_at,
        messageCount: 1,
        unreadCount: isUnread ? 1 : 0,
        lastMessageContent:
          msg.content ||
          msg.caption ||
          (extractMessageType(msg.message_type).category !== 'text'
            ? `[${extractMessageType(msg.message_type).label}]`
            : ''),
        lastMessageDirection: msg.direction,
        instanceName: msg.instance_name,
        tags: msg.tags,
        company: null,
        ai_sentiment: msg.sentiment,
      });
    } else {
      existing.messageCount++;
      if (isUnread) existing.unreadCount++;
      if (!existing.pushName && safePushName) existing.pushName = safePushName;
      if (msg.sentiment && new Date(msg.created_at) >= new Date(existing.lastMessageAt))
        existing.ai_sentiment = msg.sentiment;
      if (msg.tags && Array.isArray(msg.tags)) {
        const currentTags = new Set(existing.tags || []);
        msg.tags.forEach((t) => currentTags.add(t));
        existing.tags = Array.from(currentTags);
      }
      if (new Date(msg.created_at) > new Date(existing.lastMessageAt)) {
        existing.lastMessageAt = msg.created_at;
        existing.lastMessageContent =
          msg.content ||
          msg.caption ||
          (extractMessageType(msg.message_type).category !== 'text'
            ? `[${extractMessageType(msg.message_type).label}]`
            : '');
        existing.lastMessageDirection = msg.direction;
      }
    }
  }
  return Array.from(contactMap.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

export function derivedToConversationContact(dc: DerivedContact): ConversationContact {
  return {
    id: dc.remoteJid,
    name: dc.pushName || dc.phone,
    surname: null,
    nickname: dc.pushName,
    phone: dc.phone,
    email: null,
    avatar_url: dc.profilePictureUrl || null,
    tags: dc.tags || [],
    company: dc.company || null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: dc.lastMessageAt,
    updated_at: dc.lastMessageAt,
    whatsapp_connection_id: null,
    contact_type: 'whatsapp',
    group_category: null,
    ai_sentiment: dc.ai_sentiment || null,
    channel_type: 'whatsapp',
    channel_connection_id: null,
  };
}

export function buildExternalConversations(
  messages: EvolutionMessage[]
): ConversationWithMessages[] {
  const derivedContacts = deriveContactsFromMessages(messages);
  const messagesByJid = new Map<string, EvolutionMessage[]>();
  for (const msg of messages) {
    if (!msg.remote_jid) continue;
    const existing = messagesByJid.get(msg.remote_jid) || [];
    existing.push(msg);
    messagesByJid.set(msg.remote_jid, existing);
  }
  return derivedContacts.map((dc) => {
    const contact = derivedToConversationContact(dc);
    const evoMessages = messagesByJid.get(dc.remoteJid) || [];
    const realtimeMessages = evoMessages
      .map(evolutionToRealtimeMessage)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const unreadCount = realtimeMessages.filter((m) => !m.is_read && m.sender === 'contact').length;
    const lastMessage =
      realtimeMessages.length > 0 ? realtimeMessages[realtimeMessages.length - 1] : null;
    return { contact, messages: realtimeMessages, unreadCount, lastMessage };
  });
}
