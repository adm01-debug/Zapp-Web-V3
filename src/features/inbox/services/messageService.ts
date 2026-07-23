import { supabase } from '@/integrations/supabase/client';
import { messageRepository } from '../data-access/messageRepository';
import type { Message } from '@/types/chat';
import type { RealtimeMessage } from '../hooks/useRealtimeMessages';
import { isValidUUID } from '@/utils/uuid';

import { getLogger } from '@/lib/logger';

const log = getLogger('messageService');

export const messageService = {
  mapMessage(
    m: Partial<RealtimeMessage> & {
      conversationId?: string;
      isWhisper?: boolean;
      sender_id?: string;
      timestamp?: string | Date;
      type?: string;
      mediaUrl?: string;
    }
  ): Message {
    const createdAt = m.created_at || m.timestamp;
    return {
      ...m,
      id: m.id || '',
      conversationId: m.conversationId || m.contact_id || '',
      timestamp: createdAt ? new Date(createdAt) : new Date(),
      isEdited: !!m.is_deleted === false, // Heuristic for mapped types
      type: (m.message_type || m.type || 'text') as Message['type'],
      mediaUrl: m.media_url || m.mediaUrl || '',
      sender: (m.sender || (m.sender_id ? 'agent' : 'contact')) as Message['sender'],
    } as Message;
  },

  async getAllMessagesForContact(contactId: string): Promise<Message[]> {
    if (!contactId) return [];

    try {
      // Fetch normal messages
      let allData: (Partial<RealtimeMessage> & { isWhisper?: boolean; sender_id?: string })[] = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: page, error } = await messageRepository.fetchMessagesByContact(
          contactId,
          from,
          PAGE_SIZE
        );
        if (error) throw new Error(`Falha ao carregar mensagens: ${error.message}`);
        if (page && page.length > 0) {
          allData = allData.concat(page);
          from += PAGE_SIZE;
          hasMore = page.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      // Fetch whispers (internal notes) — only when contactId is a valid UUID.
      // whisper_messages.contact_id is a uuid column; passing a WhatsApp JID
      // (phone number, e.g. "551146375517") causes PostgREST to return 400
      // "invalid input syntax for type uuid". Skip silently when called with
      // a JID or any non-UUID identifier.
      if (isValidUUID(contactId)) {
        const { data: whispers, error: whisperErr } = await supabase
          .from('whisper_messages')
          .select('*')
          .eq('contact_id', contactId);

        if (whisperErr) {
          log.error('Error fetching whispers:', whisperErr);
        } else if (whispers) {
          const mappedWhispers = (whispers as unknown as Record<string, unknown>[]).map((w) =>
            this.mapMessage({
              ...w,
              sender_id: w.sender_id as string,
              isWhisper: true,
            })
          );
          allData = allData.concat(mappedWhispers);
        }
      } else {
        log.debug(
          '[getAllMessagesForContact] skipping whisper fetch — contactId is not a UUID (likely a WhatsApp JID)',
          { contactId }
        );
      }

      // Sort all messages by timestamp
      type WithTimestamp = { created_at?: string; timestamp?: string | Date };
      allData.sort((a, b) => {
        const timeA = new Date(
          (a as WithTimestamp).created_at || (a as WithTimestamp).timestamp || 0
        ).getTime();
        const timeB = new Date(
          (b as WithTimestamp).created_at || (b as WithTimestamp).timestamp || 0
        ).getTime();
        return timeA - timeB;
      });

      return allData.map((m) => this.mapMessage(m));
    } catch (err) {
      log.error(`Critical error in getAllMessagesForContact for ${contactId}:`, err);
      throw err;
    }
  },
};
