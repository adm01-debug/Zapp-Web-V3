import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Contact {
  id: string;
  name: string;
  surname: string | null;
  nickname: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  tags: string[];
  company: string | null;
  job_title: string | null;
  assigned_to: string | null;
  queue_id: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_connection_id: string | null;
  contact_type: string;
  group_category: string | null;
  ai_sentiment: string | null;
}

interface Message {
  id: string;
  contact_id: string;
  agent_id: string | null;
  content: string;
  sender: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean;
  status: string;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
  external_id: string;
  whatsapp_connection_id: string | null;
  transcription: string | null;
  transcription_status: string | null;
}

interface Conversation {
  contact: Contact;
  messages: Message[];
  lastMessage: Message | null;
}

function sortByRecency(convs: Conversation[]): Conversation[] {
  return [...convs].sort((a, b) => {
    const aTime = a.lastMessage?.created_at ?? a.contact.updated_at;
    const bTime = b.lastMessage?.created_at ?? b.contact.updated_at;
    return bTime.localeCompare(aTime);
  });
}

/**
 * Loads and subscribes to contacts and messages in realtime.
 * Initial fetch propagates errors from both Supabase queries.
 * Realtime channel uses a per-mount unique name to avoid collision on StrictMode remounts.
 * New messages for unknown contacts trigger a full refetch rather than silently dropping them.
 */
export function useRealtimeMessages() {
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [error, setError] = useState<Error | null>(null);
  const isMountedRef = useRef(true);
  const channelId = useRef(`realtime-messages-${Math.random().toString(36).slice(2)}`);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { data: contacts, error: contactsError },
        { data: messages, error: messagesError },
      ] = await Promise.all([
        supabase.from('evolution_contacts').select('*').order('updated_at', { ascending: false }).limit(500),
        supabase.from('evolution_messages').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (contactsError) throw contactsError;
      if (messagesError) throw messagesError;

      const contactList: Contact[] = contacts ?? [];
      const messageList: Message[] = messages ?? [];

      const contactMap = new Map<string, Contact>();
      contactList.forEach((c) => contactMap.set(c.id, c));

      const missingIds = [
        ...new Set(
          messageList.map((m) => m.contact_id).filter((id) => !contactMap.has(id))
        ),
      ];

      if (missingIds.length > 0) {
        const { data: extra } = await supabase.from('evolution_contacts').select('*').in('id', missingIds);
        (extra ?? []).forEach((c: Contact) => contactMap.set(c.id, c));
      }

      if (!isMountedRef.current) return;

      const convMap = new Map<string, Conversation>();

      contactList.forEach((c) => {
        convMap.set(c.id, { contact: c, messages: [], lastMessage: null });
      });

      contactMap.forEach((c, id) => {
        if (!convMap.has(id)) {
          convMap.set(id, { contact: c, messages: [], lastMessage: null });
        }
      });

      messageList.forEach((m) => {
        const conv = convMap.get(m.contact_id);
        if (conv) {
          conv.messages.push(m);
          if (!conv.lastMessage || m.created_at > conv.lastMessage.created_at) {
            conv.lastMessage = m;
          }
        }
      });

      if (isMountedRef.current) {
        setConversations(sortByRecency(Array.from(convMap.values())));
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error('Failed to load messages'));
        setConversations([]);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();
    return () => { isMountedRef.current = false; };
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(channelId.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'evo', table: 'evolution_messages' },
        (payload) => {
          if (!isMountedRef.current) return;
          const newMsg = payload.new as Message;
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.contact.id === newMsg.contact_id);
            if (idx === -1) {
              // Contact not yet loaded — fall back to full refresh
              void fetchData();
              return prev;
            }
            const conv = prev[idx];
            const lastMessage =
              !conv.lastMessage || newMsg.created_at > conv.lastMessage.created_at
                ? newMsg
                : conv.lastMessage;
            const updated = [...prev];
            updated[idx] = { ...conv, messages: [...conv.messages, newMsg], lastMessage };
            return sortByRecency(updated);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },
        (payload) => {
          if (!isMountedRef.current) return;
          const updMsg = payload.new as Message;
          setConversations((prev) =>
            prev.map((conv) => {
              if (conv.contact.id !== updMsg.contact_id) return conv;
              const messages = conv.messages.map((m) => (m.id === updMsg.id ? updMsg : m));
              const lastMessage = messages.reduce<Message | null>(
                (latest, m) => (!latest || m.created_at > latest.created_at ? m : latest),
                null
              );
              return { ...conv, messages, lastMessage };
            })
          );
        }
      );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [fetchData]);

  const sendMessage = useCallback(
    async (contactId: string, content: string, agentId?: string) => {
      try {
        const { error: insertError } = await supabase.from('evolution_messages').insert({
          contact_id: contactId,
          content,
          agent_id: agentId ?? null,
          sender: 'agent',
          message_type: 'text',
          is_read: true,
          status: 'sent',
          external_id: `local-${Date.now()}`,
        });
        if (insertError) throw insertError;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to send message'));
        throw err;
      }
    },
    []
  );

  const refetch = useCallback(() => fetchData(), [fetchData]);

  return { loading, conversations, error, sendMessage, refetch };
}
