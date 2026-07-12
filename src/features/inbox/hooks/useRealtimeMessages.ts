// @ts-nocheck
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dbFrom, dbTable, dbChannel, dbRemoveChannel } from '@/integrations/datasource/db';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getLogger } from '@/lib/logger';
import { sendMessageToContact } from './realtime/messageSender';
import { subscribeAllSendStatus, getSendStatus } from './realtime/sendStatusBus';
import {
  normalizeMessage,
  buildConversation,
  dedupeContacts,
  buildConversations,
  getUniqueMessageContactIds,
  chunkArray,
} from './realtime/realtimeUtils';
import { useRealtimeNotifications } from './realtime/useRealtimeNotifications';
import { useMessageUpdateBatcher } from './realtime/useMessageUpdateBatcher';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import { isValidUUID } from '@/utils/uuid';
import type {
  NewMessageNotification,
  RealtimeMessage,
  ConversationContact,
  ConversationWithMessages,
} from './realtime/types';
export type {
  NewMessageNotification,
  RealtimeMessage,
  ConversationContact,
  ConversationWithMessages,
} from './realtime/types';
export type { MessageBatcherStatus } from './realtime/useMessageUpdateBatcher';

const log = getLogger('RealtimeMessages');
const SEEDED_CONTACT_LIMIT = 500;
const RECENT_MESSAGES_LIMIT = 1000;
const CONTACT_FETCH_CHUNK_SIZE = 200;

export interface NewMessageNotification {
  id: string;
  contactId: string;
  contactName: string;
  contactAvatar: string | null;
  message: string;
  timestamp: Date;
}

export interface RealtimeMessage {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  content: string;
  sender: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean | null;
  status:
    | 'sending'
    | 'retrying'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'played'
    | 'failed'
    | 'failed_auth'
    | 'failed_retries'
    | null;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
  external_id: string | null;
  whatsapp_connection_id: string | null;
  transcription: string | null;
  transcription_status: string | null;
  is_deleted: boolean | null;
  /** Timestamp do soft delete (protocolMessage REVOKE). Null = mensagem viva. */
  deleted_at?: string | null;
  retry_attempt?: number | null;
  retry_total?: number | null;
  /** Cache do avatar do contato para mensagens recebidas. Propagado durante a hidratação/reconciliação. */
  contactAvatar?: string | null;
  reactions?: Record<string, unknown>[] | null;
}

export interface ConversationContact {
  id: string;
  name: string;
  surname: string | null;
  nickname: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  tags: string[] | null;
  company: string | null;
  job_title: string | null;
  assigned_to: string | null;
  queue_id: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_connection_id: string | null;
  contact_type: string | null;
  group_category: string | null;
  ai_sentiment: string | null;
  channel_type: string | null;
  channel_connection_id: string | null;
}

export interface ConversationWithMessages {
  contact: ConversationContact;
  messages: RealtimeMessage[];
  unreadCount: number;
  lastMessage: RealtimeMessage | null;
}

export type ConversationSendState = 'idle' | 'retrying' | 'failed';

export function useRealtimeMessages() {
  const [conversations, setConversations] = useState<ConversationWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendStateTick, setSendStateTick] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'unread'>('all');
  const [sortBy, setSortBy] = useState<'lastMessage' | 'name' | 'unread'>('lastMessage');

  const conversationsRef = useRef<ConversationWithMessages[]>([]);

  const {
    newMessageNotification,
    notifyAboutIncomingMessage,
    dismissNotification,
    setSelectedContact,
    setSoundEnabled,
  } = useRealtimeNotifications();

  const commitConversations = useCallback(
    (
      updater:
        | ConversationWithMessages[]
        | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])
    ) => {
      setConversations((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: ConversationWithMessages[]) => ConversationWithMessages[])(prev)
            : updater;
        conversationsRef.current = next;
        return next;
      });
    },
    []
  );

  const fetchContactsByIds = useCallback(async (contactIds: string[]) => {
    const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [] as ConversationContact[];
    const fetchedContacts: ConversationContact[] = [];

    for (const idsChunk of chunkArray(uniqueIds, CONTACT_FETCH_CHUNK_SIZE)) {
      const { data, error: contactsError } = await dbFrom('contacts')
        .select('*')
        .in('id', idsChunk);

      if (contactsError) throw contactsError;
      fetchedContacts.push(...((data ?? []) as ConversationContact[]));
    }
    return dedupeContacts(fetchedContacts);
  }, []);

  const hydrateConversationForMessage = useCallback(
    async (message: RealtimeMessage) => {
      if (!message.contact_id) return;
      try {
        const [contact] = await fetchContactsByIds([message.contact_id]);
        if (!contact) {
          log.warn('Incoming message received for unknown contact', {
            contactId: message.contact_id,
          });
          return;
        }
        commitConversations((prev) => {
          const idx = prev.findIndex((c) => c.contact.id === contact.id);
          if (idx >= 0) {
            const existing = prev[idx];
            if (existing.messages.some((m) => m.id === message.id)) return prev;

            // Atribui o avatar do contato à mensagem reidratada
            const messageWithAvatar = {
              ...message,
              contactAvatar: contact.avatar_url || message.contactAvatar,
            };

            const updated = [...prev];
            updated.splice(idx, 1);
            updated.unshift(buildConversation(contact, [...existing.messages, messageWithAvatar]));
            return updated;
          }

          const initialMessageWithAvatar = {
            ...message,
            contactAvatar: contact.avatar_url || message.contactAvatar,
          };
          return [buildConversation(contact, [initialMessageWithAvatar]), ...prev];
        });
        notifyAboutIncomingMessage(contact, message);
      } catch (err) {
        log.error('Error hydrating conversation for incoming message:', err);
      }
    },
    [commitConversations, fetchContactsByIds, notifyAboutIncomingMessage]
  );

  const { handleMessageUpdate, batcherStatus } = useMessageUpdateBatcher(
    conversationsRef,
    commitConversations,
    hydrateConversationForMessage
  );

  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const newMessage = normalizeMessage(payload.new);
      if (!newMessage.contact_id) return;

      const existingConversation = conversationsRef.current.find(
        (c) => c.contact.id === newMessage.contact_id
      );
      if (!existingConversation) {
        void hydrateConversationForMessage(newMessage);
        return;
      }

      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === newMessage.contact_id);
        if (idx < 0) return prev;
        const conv = prev[idx];
        if (conv.messages.some((m) => m.id === newMessage.id)) return prev;

        // Atribui o avatar do contato à nova mensagem para cache
        const messageWithAvatar = {
          ...newMessage,
          contactAvatar: conv.contact.avatar_url || newMessage.contactAvatar,
        };

        const updated = [...prev];
        updated.splice(idx, 1);
        updated.unshift(buildConversation(conv.contact, [...conv.messages, messageWithAvatar]));
        return updated;
      });

      notifyAboutIncomingMessage(existingConversation.contact, newMessage);
    },
    [commitConversations, hydrateConversationForMessage, notifyAboutIncomingMessage]
  );

  // Reage a um DELETE real na tabela messages (ex.: moderação via
  // useMonitoringActions). Na fonte evo.evolution_messages a replica identity
  // é default (payload.old só traz a PK) — a guarda abaixo já cobre old
  // incompleto. Recalcula a conversa inteira via buildConversation para manter
  // lastMessage/unreadCount consistentes, sem reordenar a lista.
  const handleMessageDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const deletedMessage = payload.old;
      if (!deletedMessage?.id || !deletedMessage?.contact_id) return;

      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === deletedMessage.contact_id);
        if (idx < 0) return prev;
        const conv = prev[idx];
        if (!conv.messages.some((m) => m.id === deletedMessage.id)) return prev;

        const remainingMessages = conv.messages.filter((m) => m.id !== deletedMessage.id);
        const updated = [...prev];
        updated[idx] = buildConversation(conv.contact, remainingMessages);
        return updated;
      });
    },
    [commitConversations]
  );

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: seededContacts, error: contactsError } = await dbFrom('contacts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(SEEDED_CONTACT_LIMIT);

      if (contactsError) throw contactsError;

      const { data: recentMessages, error: messagesError } = await dbFrom('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(RECENT_MESSAGES_LIMIT);

      if (messagesError) throw messagesError;

      const normalizedMessages = ((recentMessages ?? []) as RealtimeMessage[]).map(
        normalizeMessage
      );
      const seededContactRows = (seededContacts ?? []) as ConversationContact[];
      const seededContactIds = new Set(seededContactRows.map((c) => c.id));
      const missingContactIds = getUniqueMessageContactIds(normalizedMessages).filter(
        (id) => !seededContactIds.has(id)
      );
      const messageContacts = await fetchContactsByIds(missingContactIds);
      commitConversations(
        buildConversations([...seededContactRows, ...messageContacts], normalizedMessages)
      );
    } catch (err) {
      log.error('Error fetching conversations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, [commitConversations, fetchContactsByIds]);

  useEffect(() => {
    let active = true;
    void fetchConversations();

    log.info('Subscribing to realtime', { source: 'dbTable' });

    const channelName = `messages-realtime-${Math.random().toString(36).slice(2, 9)}`;
    logMessagesSubscribe('useRealtimeMessages', { event: 'INSERT', table: dbTable('messages') });
    logMessagesSubscribe('useRealtimeMessages', { event: 'UPDATE', table: dbTable('messages') });
    logMessagesSubscribe('useRealtimeMessages', { event: 'DELETE', table: dbTable('messages') });

    // FATOR X v6.2: Realtime na TABELA-FONTE evo.evolution_messages (views public não emitem).
    // Adapter: a fonte usa from_me/deleted_at; o shape legado da view usa sender/is_deleted.
    const adaptEvoPayload = (
      p: RealtimePostgresChangesPayload<Record<string, unknown>>
    ): RealtimePostgresChangesPayload<RealtimeMessage> => {
      const map = (r: Record<string, unknown> | undefined) =>
        r && {
          ...r,
          sender: (r as { from_me?: boolean }).from_me ? 'agent' : 'contact',
          is_deleted: (r as { deleted_at?: string | null }).deleted_at != null,
        };
      return {
        ...p,
        new: map(p.new as Record<string, unknown>),
        old: map(p.old as Record<string, unknown>),
      } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>;
    };
    const channel = dbChannel('messages', channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'evo',
          table: 'evolution_messages',
        },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              handleNewMessage
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo',
          table: 'evolution_messages',
        },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              handleMessageUpdate
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'evo',
          table: 'evolution_messages',
        },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              handleMessageDelete
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
        }
      )
      .subscribe((status) => {
        if (active) log.debug('Subscription status', { status });
      });

    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [fetchConversations, handleNewMessage, handleMessageUpdate, handleMessageDelete]);

  const sendMessage = async (
    contactId: string,
    content: string,
    messageType: string = 'text',
    mediaUrl?: string,
    mediaPayload?: string
  ) => {
    const response = await sendMessageToContact(
      contactId,
      content,
      messageType,
      mediaUrl,
      mediaPayload
    );

    // Check if conversation needs routing status update
    try {
      const { data: conv } = await dbFrom('team_conversations')
        .select('id, routing_status')
        .eq('id', contactId)
        .maybeSingle();

      if (conv && conv.routing_status === 'pending') {
        await dbFrom('team_conversations')
          .update({ routing_status: 'assigned' })
          .eq('id', contactId);
      }
    } catch (err) {
      log.error('Error checking routing status on send:', err);
    }

    return response;
  };

  const lastSeenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markAsRead = async (contactId: string) => {
    // ── UUID guard ──────────────────────────────────────────────────────────
    // messages.contact_id (and evo.evolution_messages.contact_id) are uuid
    // columns. When USE_EXTERNAL_DB=true the selectedContactId in
    // useRealtimeInbox may be a WhatsApp JID / phone number (e.g. "551146375517")
    // instead of a UUID. Passing it to PostgREST's .eq() on a uuid column
    // causes 400 "invalid input syntax for type uuid".
    // Skip silently — handleSelectConversation already calls evolution-api
    // to mark messages read on the WhatsApp side when USE_EXTERNAL_DB=true.
    if (!isValidUUID(contactId)) {
      log.warn(
        '[markAsRead] contactId is not a valid UUID — skipping to prevent 400 (likely a WhatsApp JID)',
        { contactId }
      );
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    const { error } = await dbFrom('messages')
      .update({ is_read: true })
      .eq('contact_id', contactId)
      .eq('sender', 'contact')
      .eq('is_read', false);
    if (error) log.error('Error marking messages as read:', error);

    // Debounce last_seen update to avoid flooding DB during active chat
    if (lastSeenTimerRef.current) clearTimeout(lastSeenTimerRef.current);
    lastSeenTimerRef.current = setTimeout(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id);
      }
    }, 5000);

    commitConversations((prev) =>
      prev.map((c) =>
        c.contact.id === contactId
          ? { ...c, messages: c.messages.map((m) => ({ ...m, is_read: true })), unreadCount: 0 }
          : c
      )
    );
  };

  // Subscribe to bus to recompute conversationSendState
  useEffect(() => {
    const unsub = subscribeAllSendStatus(() => setSendStateTick((t) => t + 1));
    return unsub;
  }, []);

  // Derive per-contact send state (transient bus + last DB status)
  const conversationSendState: Record<string, ConversationSendState> = {};
  for (const c of conversations) {
    let state: ConversationSendState = 'idle';
    const outbound = c.messages.filter((m) => m.sender === 'agent');
    // Check bus for any retrying/sending in this conversation
    const anyRetrying = outbound.some((m) => {
      const bus = getSendStatus(m.id);
      return bus?.status === 'retrying';
    });
    if (anyRetrying) {
      state = 'retrying';
    } else {
      const lastOutbound = outbound[outbound.length - 1];
      if (lastOutbound) {
        const bus = getSendStatus(lastOutbound.id);
        const effective = bus?.status ?? lastOutbound.status;
        if (
          effective === 'failed' ||
          effective === 'failed_auth' ||
          effective === 'failed_retries'
        ) {
          state = 'failed';
        }
      }
    }
    conversationSendState[c.contact.id] = state;
  }
  void sendStateTick; // ensure dep tracked

  const filteredConversations = useMemo(() => {
    let filtered = [...conversations];

    // 1. Search
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (conv) =>
          conv.contact.name.toLowerCase().includes(q) ||
          conv.contact.phone.includes(q) ||
          conv.lastMessage?.content?.toLowerCase().includes(q)
      );
    }

    // 2. Status Filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((conv) => {
        if (statusFilter === 'unread') return conv.unreadCount > 0;
        if (statusFilter === 'open') {
          return (
            !conv.lastMessage ||
            conv.lastMessage.sender === 'contact' ||
            (conv.contact as ConversationContact & { routing_status?: string }).routing_status ===
              'pending'
          );
        }
        if (statusFilter === 'closed') {
          return (
            conv.lastMessage?.sender === 'agent' &&
            (conv.contact as ConversationContact & { routing_status?: string }).routing_status !==
              'pending'
          );
        }
        return true;
      });
    }

    // 3. Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'unread') {
        if (a.unreadCount !== b.unreadCount) return b.unreadCount - a.unreadCount;
      }
      if (sortBy === 'name') {
        return a.contact.name.localeCompare(b.contact.name);
      }
      const aTime = a.lastMessage
        ? new Date(a.lastMessage.created_at).getTime()
        : new Date(a.contact.created_at).getTime();
      const bTime = b.lastMessage
        ? new Date(b.lastMessage.created_at).getTime()
        : new Date(b.contact.created_at).getTime();
      return bTime - aTime;
    });

    return filtered;
  }, [conversations, search, statusFilter, sortBy]);

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    loading,
    error,
    sendMessage,
    markAsRead,
    refetch: fetchConversations,
    newMessageNotification,
    dismissNotification,
    setSelectedContact,
    setSoundEnabled,
    conversationSendState,
    batcherStatus,
    /**
     * @deprecated Use the hook directly where needed
     */
    optimistic: {
      pendingCount: 0,
      mergeWithReal: <T>(m: T): T => m,
    },
  };
}