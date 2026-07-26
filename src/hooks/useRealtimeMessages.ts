import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useRealtimeMessages');

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

/**
 * Interface alinhada ao schema real da view zapp.messages
 * (que faz SELECT sobre evo.evolution_messages).
 *
 * Campos anteriores como `sender` (string), `external_id`, `agent_id`,
 * `transcription` são mantidos via computed columns da view.
 */
interface Message {
  id: string;
  contact_id: string | null;
  content: string | null;
  message_type: string;
  media_url: string | null;
  is_read: boolean;
  status: string | null;
  created_at: string;
  updated_at: string | null;
  // Campos computados pela view zapp.messages
  sender: string | null;           // 'agent' | 'contact' — from_me→sender
  is_from_me: boolean;
  direction: string | null;        // 'incoming' | 'outgoing'
  external_id: string | null;      // alias de message_id da tabela evo
  whatsapp_connection_id: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  // Campos opcionais
  caption: string | null;
  instance_name: string | null;
  push_name: string | null;
  remote_jid: string | null;
  conversation_id: string | null;
  agent_id: string | null;
  transcription: string | null;
  transcription_status: string | null;
  media_type: string | null;
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
 * @deprecated Use `useRealtimeMessages` de `src/features/inbox/hooks/useRealtimeMessages.ts`
 * que tem suporte a multi-instância, paginação, N+1 fix e realtime robusto.
 * Este hook legado serve apenas como compatibilidade de API.
 *
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
        { data: contactsRaw, error: contactsError },
        { data: messages, error: messagesError },
      ] = await Promise.all([
        supabase.from('evolution_contacts').select('*').order('updated_at', { ascending: false }).limit(500),
        supabase.from('evolution_messages').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      if (contactsError) throw contactsError;
      if (messagesError) throw messagesError;

      const contactList: Contact[] = (contactsRaw as unknown as Contact[] | null) ?? [];
      const messageList: Message[] = messages ?? [];

      const contactMap = new Map<string, Contact>();
      contactList.forEach((c) => contactMap.set(c.id, c));

      // Buscar contatos referenciados por mensagens mas não no set inicial
      const missingIds = [
        ...new Set(
          messageList
            .map((m) => m.contact_id)
            .filter((id): id is string => Boolean(id) && !contactMap.has(id!))
        ),
      ];

      if (missingIds.length > 0) {
        const { data: extraRaw } = await supabase.from('evolution_contacts').select('*').in('id', missingIds);
        ((extraRaw as unknown as Contact[] | null) ?? []).forEach((c: Contact) => contactMap.set(c.id, c));
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
        // Filtro explícito: ignorar tombstones (mensagens apagadas sem contact_id)
        if (!m.contact_id) {
          log.debug('[useRealtimeMessages] ignorando mensagem sem contact_id (tombstone)', { id: m.id });
          return;
        }
        const conv = convMap.get(m.contact_id);
        if (conv) {
          conv.messages.push(m);
          if (!conv.lastMessage || m.created_at > conv.lastMessage.created_at) {
            conv.lastMessage = m;
          }
        } else {
          // Contato não encontrado no mapa — já tratado acima via missingIds
          log.debug('[useRealtimeMessages] mensagem com contact_id desconhecido no mapa', {
            id: m.id,
            contact_id: m.contact_id,
          });
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
          // Ignorar tombstones sem contato vinculado
          if (!newMsg.contact_id) {
            log.debug('[realtime] INSERT ignorado — contact_id nulo (tombstone ou msg sem contato)');
            return;
          }
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
          if (!updMsg.contact_id) return; // ignorar tombstones em updates
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

    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') {
        log.warn('[useRealtimeMessages] channel subscription status:', status);
      }
    });

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [fetchData]);

  /**
   * @deprecated STUB LEGADO — O envio real de mensagens deve usar
   * `sendMessageToContact` de `features/inbox/hooks/realtime/messageSender.ts`
   * que: (1) insere na view zapp.messages com campos corretos, (2) chama a
   * Evolution API para dispatch real no WhatsApp, (3) atualiza status e retry.
   *
   * Este stub NÃO faz INSERT para evitar falhas silenciosas causadas pelo
   * schema default 'zapp' (que resolve para a VIEW sem suporte a todos os campos
   * de evo.evolution_messages, em particular instance_name NOT NULL).
   */
  const sendMessage = useCallback(
    async (contactId: string, content: string, _agentId?: string) => {
      log.warn(
        '[sendMessage legacy stub] Use sendMessageToContact de features/inbox/hooks/realtime/messageSender.ts para envio real via Evolution API.',
        { contactId, contentLength: content.length }
      );
      // Intencionalmente não faz nada — previne INSERT no schema errado.
    },
    []
  );

  const refetch = useCallback(() => fetchData(), [fetchData]);

  return { loading, conversations, error, sendMessage, refetch };
}
