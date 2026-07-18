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

export function useRealtimeMessages() {
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: contacts }, { data: messages }] = await Promise.all([
        supabase.from('contacts').select('*').order('updated_at', { ascending: false }).limit(500),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(100),
      ]);

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
        const { data: extra } = await supabase.from('contacts').select('*').in('id', missingIds);
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

      const result = Array.from(convMap.values()).sort((a, b) => {
        const aTime = a.lastMessage?.created_at ?? a.contact.updated_at;
        const bTime = b.lastMessage?.created_at ?? b.contact.updated_at;
        return bTime.localeCompare(aTime);
      });

      if (isMountedRef.current) {
        setConversations(result);
      }
    } catch {
      if (isMountedRef.current) setConversations([]);
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
      .channel('realtime-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () => {
        fetchData();
      });

    channel.subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [fetchData]);

  const sendMessage = useCallback(
    async (contactId: string, content: string, agentId?: string) => {
      await supabase.from('messages').insert({
        contact_id: contactId,
        content,
        agent_id: agentId ?? null,
        sender: 'agent',
        message_type: 'text',
        is_read: true,
        status: 'sent',
        external_id: `local-${Date.now()}`,
      });
      await fetchData();
    },
    [fetchData]
  );

  const refetch = useCallback(() => fetchData(), [fetchData]);

  return { loading, conversations, sendMessage, refetch };
}
