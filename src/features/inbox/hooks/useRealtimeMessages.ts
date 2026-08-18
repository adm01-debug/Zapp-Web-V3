import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dbFrom, dbTable, dbChannel, dbRemoveChannel } from '@/integrations/datasource/db';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getLogger } from '@/lib/logger';
import { sendMessageToContact } from './realtime/messageSender';
import { subscribeAllSendStatus, getSendStatus } from './realtime/sendStatusBus';
import {
  normalizeMessage,
  buildConversation,
  dedupeContacts,
  dedupeMessages,
  buildConversations,
  getUniqueMessageContactIds,
  chunkArray,
} from './realtime/realtimeUtils';
import { useRealtimeNotifications } from './realtime/useRealtimeNotifications';
import type { MessageReaction } from './realtime/types';
import { useMessageUpdateBatcher } from './realtime/useMessageUpdateBatcher';
import { touchLastSeen } from '../services/touchLastSeen';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import { logChannelError } from '@/integrations/supabase/channelErrorLogging';
import { isValidUUID } from '@/utils/uuid';
export type { MessageBatcherStatus } from './realtime/useMessageUpdateBatcher';

const log = getLogger('RealtimeMessages');
// F4-01: paginação por cursor — os limites fixos SEEDED_CONTACT_LIMIT=500 /
// RECENT_MESSAGES_LIMIT=1000 (que carregavam o inbox inteiro a cada
// montagem) deram lugar a páginas de CONTACTS_PAGE_SIZE contatos (cursor
// updated_at+id) e MESSAGES_PAGE_SIZE mensagens recentes (cursor
// created_at+id), com load-more sob demanda via loadMoreConversations.
// F4-18 (2026-08-03): CONTACTS_PAGE_SIZE 100→30 e MESSAGES_PAGE_SIZE 100→50
// — carga inicial mais leve (menos payload por GET no inbox load); o scroll
// infinito continua funcionando via loadMoreConversations com os cursors.
const CONTACTS_PAGE_SIZE = 30;
const MESSAGES_PAGE_SIZE = 50;
const CONTACT_FETCH_CHUNK_SIZE = 200;

/** Cursor de paginação de contatos: (updated_at, id) — ordem estável desc. */
interface ContactPageCursor {
  updatedAt: string;
  id: string;
}

/** Cursor de paginação de mensagens: (created_at, id) — ordem estável desc. */
interface MessagePageCursor {
  createdAt: string;
  id: string;
}
/**
 * Janela de debounce (ms) para agregar múltiplas chamadas simultâneas de
 * hydrateConversationForMessage. Em rajadas de mensagens (campanhas, bots),
 * reduz de N round-trips HTTP para 1 por janela de 50ms.
 */
const HYDRATE_DEBOUNCE_MS = 50;

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
  reactions?: MessageReaction[] | null; // ignore-audit: reaction shape from Evolution API is untyped
  /** Metadados de mídia (ex: ptt, isPtv). Presente em mensagens de áudio/vídeo. */
  media_meta?: { ptt?: boolean; isPtv?: boolean; [key: string]: unknown } | null;
  /** Referência ao audio meme (soundboard). Presente em mensagens otimistas enviadas via soundboard. */
  audio_meme_id?: string | null;
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
  /** Timestamp do soft delete (contato arquivado). Null = contato ativo. */
  deleted_at?: string | null;
  whatsapp_connection_id: string | null;
  contact_type: string | null;
  group_category: string | null;
  ai_sentiment: string | null;
  channel_type: string | null;
  channel_connection_id: string | null;
  routing_status?: string | null;
  remote_jid?: string | null;
  instance_name?: string | null;
}

export interface ConversationWithMessages {
  contact: ConversationContact;
  messages: RealtimeMessage[];
  unreadCount: number;
  lastMessage: RealtimeMessage | null;
  /** True quando o contato está arquivado (soft delete em contacts.deleted_at). */
  isArchived: boolean;
}

export type ConversationSendState = 'idle' | 'retrying' | 'failed';

export function useRealtimeMessages() {
  const queryClient = useQueryClient();
  const [conversations, setConversations] = useState<ConversationWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendStateTick, setSendStateTick] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed' | 'unread'>('all');
  const [sortBy, setSortBy] = useState<'lastMessage' | 'name' | 'unread'>('lastMessage');

  const conversationsRef = useRef<ConversationWithMessages[]>([]);

  // F4-02: guard de mount — fetchConversations/refetch são async e podem
  // resolver depois do unmount (navegação de rota durante o fetch inicial).
  // Nenhum setState roda com isMountedRef.current === false.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // F4-01: estado de paginação por cursor. Os arrays acumulados alimentam o
  // merge incremental em buildConversations a cada load-more; os cursors
  // (updated_at+id / created_at+id) apontam para a última linha da página
  // anterior e os flags hasMore*Ref indicam se ainda há páginas.
  const loadedContactsRef = useRef<ConversationContact[]>([]);
  const loadedMessagesRef = useRef<RealtimeMessage[]>([]);
  const contactsCursorRef = useRef<ContactPageCursor | null>(null);
  const messagesCursorRef = useRef<MessagePageCursor | null>(null);
  const hasMoreContactsRef = useRef(false);
  const hasMoreMessagesRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  // F4-18: dedupe de fetch inicial — se fetchConversations já está em curso
  // (remount/StrictMode, refetch pós-send, fallback de visibilitychange),
  // chamadas concorrentes são descartadas em vez de disparar outro par de
  // GETs. O fetch em curso já resetou a paginação e popula o estado.
  const fetchInFlightRef = useRef(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);

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
      // EMPTY-IN GUARD: chunk vazio nunca deve virar `id=in.()` no PostgREST
      if (idsChunk.length === 0) continue;
      const { data, error: contactsError } = await dbFrom('contacts')
        .select('*')
        .in('id', idsChunk);

      if (contactsError) throw contactsError;
      fetchedContacts.push(...((data ?? []) as ConversationContact[]));
    }
    return dedupeContacts(fetchedContacts);
  }, []);

  // ── F4-01: páginas por cursor ────────────────────────────────────────────
  // Contatos: página de CONTACTS_PAGE_SIZE ordenada por (updated_at desc,
  // id desc) com cursor composto `updated_at + id` (tie-break estável para
  // timestamps idênticos). Mensagens: página de MESSAGES_PAGE_SIZE ordenada
  // por (created_at desc, id desc) com cursor composto `created_at + id`.
  // O filtro usa or() para "antes do cursor OU (igual ao cursor com id menor)".
  const fetchContactsPage = useCallback(async (cursor: ContactPageCursor | null) => {
    let query = dbFrom('contacts')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(CONTACTS_PAGE_SIZE);
    if (cursor) {
      query = query.or(
        `and(updated_at.lt.${cursor.updatedAt}),and(updated_at.eq.${cursor.updatedAt},id.lt.${cursor.id})`
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ConversationContact[];
  }, []);

  const fetchMessagesPage = useCallback(async (cursor: MessagePageCursor | null) => {
    let query = dbFrom('messages')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MESSAGES_PAGE_SIZE);
    if (cursor) {
      query = query.or(
        `and(created_at.lt.${cursor.createdAt}),and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as RealtimeMessage[]).map(normalizeMessage);
  }, []);

  const cursorFromContact = (c: ConversationContact): ContactPageCursor => ({
    updatedAt: c.updated_at,
    id: c.id,
  });

  const cursorFromMessage = (m: RealtimeMessage): MessagePageCursor => ({
    createdAt: m.created_at,
    id: m.id,
  });

  /** Hidrata contatos que apareceram em mensagens mas não estão na página atual de contatos. */
  const hydrateMissingMessageContacts = useCallback(
    async (messages: RealtimeMessage[], loadedContacts: ConversationContact[]) => {
      const loadedIds = new Set(loadedContacts.map((c) => c.id));
      const missingContactIds = getUniqueMessageContactIds(messages).filter(
        (id) => !loadedIds.has(id)
      );
      if (missingContactIds.length === 0) return [] as ConversationContact[];
      return fetchContactsByIds(missingContactIds);
    },
    [fetchContactsByIds]
  );

  /**
   * Micro-buffer de 50ms para hydrateConversationForMessage.
   *
   * PROBLEMA (N+1):
   *   Antes, cada mensagem de um novo contato disparava fetchContactsByIds([id])
   *   individualmente. Em rajadas (campanhas, bots, reconexão de instância),
   *   isso gerava N round-trips HTTP simultâneos — 1 por contato novo.
   *
   * SOLUÇÃO:
   *   Acumulamos as mensagens pendentes no Map abaixo. Após 50ms sem novas
   *   chegadas, disparamos UM único fetchContactsByIds(todosOsIds) e
   *   aplicamos as atualizações de state em lote. O resultado é idêntico
   *   ao comportamento anterior, mas com 1 request em vez de N.
   *
   * SEGURANÇA:
   *   - O timer é limpo no unmount via cleanupHydrateBatchRef.current
   *   - O Map é keyed por contact_id para deduplicar contatos duplicados
   *   - Mensagens para o mesmo contact_id chegadas dentro da janela são
   *     todas processadas (array de mensagens por contact_id)
   */
  const pendingHydrateRef = useRef<Map<string, RealtimeMessage[]>>(new Map());
  const hydrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupHydrateBatchRef = useRef<(() => void) | null>(null);

  /** Processa UM contato já buscado contra todas as mensagens pendentes para ele. */
  const applyHydratedContact = useCallback(
    (contact: ConversationContact, messages: RealtimeMessage[]) => {
      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === contact.id);
        if (idx >= 0) {
          // Conversa existente: append de mensagens que ainda não estão lá
          const existing = prev[idx];
          const existingIds = new Set(existing.messages.map((m) => m.id));
          const newMsgs = messages
            .filter((m) => !existingIds.has(m.id))
            .map((m) => ({ ...m, contactAvatar: contact.avatar_url || m.contactAvatar }));
          if (newMsgs.length === 0) return prev;
          const updated = [...prev];
          updated.splice(idx, 1);
          updated.unshift(buildConversation(contact, [...existing.messages, ...newMsgs]));
          return updated;
        }
        // Conversa nova: cria com todas as mensagens pendentes
        const withAvatar = messages.map((m) => ({
          ...m,
          contactAvatar: contact.avatar_url || m.contactAvatar,
        }));
        return [buildConversation(contact, withAvatar), ...prev];
      });
      // Notifica apenas pela mensagem mais recente (evita toast flood)
      const mostRecent = messages.reduce((a, b) =>
        (a.created_at ?? '') >= (b.created_at ?? '') ? a : b
      );
      notifyAboutIncomingMessage(contact, mostRecent);
    },
    [commitConversations, notifyAboutIncomingMessage]
  );

  /** Flush: coleta todos os contact_ids pendentes, busca em BATCH e aplica. */
  const flushHydrateBatch = useCallback(async () => {
    hydrateTimerRef.current = null;
    const pending = pendingHydrateRef.current;
    if (pending.size === 0) return;

    // Snapshot e limpa o buffer ANTES do await para não perder msgs que
    // chegam enquanto o fetch está em curso.
    const snapshot = new Map(pending);
    pendingHydrateRef.current = new Map();

    const contactIds = Array.from(snapshot.keys());
    log.debug(`[hydrate-batch] fetching ${contactIds.length} contact(s) in 1 request`);

    try {
      const contacts = await fetchContactsByIds(contactIds);
      const contactMap = new Map(contacts.map((c) => [c.id, c]));

      for (const [contactId, messages] of snapshot.entries()) {
        const contact = contactMap.get(contactId);
        if (!contact) {
          log.warn('Incoming message received for unknown contact', { contactId });
          continue;
        }
        applyHydratedContact(contact, messages);
      }
    } catch (err) {
      log.error('Error in hydrate batch:', err);
      // Em caso de falha, recoloca as mensagens no buffer para retry na próxima janela
      for (const [k, v] of snapshot.entries()) {
        const existing = pendingHydrateRef.current.get(k) ?? [];
        pendingHydrateRef.current.set(k, [...existing, ...v]);
      }
    }
  }, [fetchContactsByIds, applyHydratedContact]);

  /** Encabeçamento público: enfileira a mensagem e agenda o flush. */
  const hydrateConversationForMessage = useCallback(
    async (message: RealtimeMessage) => {
      if (!message.contact_id) return;

      // Enfileira no buffer
      const q = pendingHydrateRef.current.get(message.contact_id) ?? [];
      q.push(message);
      pendingHydrateRef.current.set(message.contact_id, q);

      // Debounce: cancela o timer anterior e agenda um novo
      if (hydrateTimerRef.current !== null) {
        clearTimeout(hydrateTimerRef.current);
      }
      hydrateTimerRef.current = setTimeout(() => {
        void flushHydrateBatch();
      }, HYDRATE_DEBOUNCE_MS);
    },
    [flushHydrateBatch]
  );

  // Cleanup: cancela o timer pendente ao desmontar o componente
  // (evita setState após unmount e memory leaks)
  useEffect(() => {
    cleanupHydrateBatchRef.current = () => {
      if (hydrateTimerRef.current !== null) {
        clearTimeout(hydrateTimerRef.current);
        hydrateTimerRef.current = null;
      }
      pendingHydrateRef.current = new Map();
    };
    return () => {
      cleanupHydrateBatchRef.current?.();
    };
  }, []);

  const { handleMessageUpdate, batcherStatus } = useMessageUpdateBatcher(
    conversationsRef,
    commitConversations,
    hydrateConversationForMessage
  );

  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const newMessage = normalizeMessage(payload.new as RealtimeMessage);
      if (!newMessage.contact_id) return;

      const existingConversation = conversationsRef.current.find(
        (c) => c.contact.id === newMessage.contact_id
      );
      if (!existingConversation) {
        void hydrateConversationForMessage(newMessage);
        return;
      }

      // E31 dedup: reentrega do realtime (reconnect, fanout TTL overlap) manda
      // o MESMO INSERT mais de uma vez. Se a mensagem já está na conversa, sai
      // ANTES do commitConversations E da notificação — o estado não duplica e
      // o toast/som não re-dispara (bug: notify rodava incondicionalmente).
      if (existingConversation.messages.some((m) => m.id === newMessage.id)) return;

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
      const deletedMessage = payload.old as RealtimeMessage;
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

  // F4-01: fetch inicial com cursor — página 1 de contatos (updated_at+id) e
  // de mensagens recentes (created_at+id) em PARALELO (antes: 500 contatos +
  // 1000 mensagens em 2 round-trips sequenciais). F4-02: guard de mount em
  // todos os setState após await (isMountedRef).
  const fetchConversations = useCallback(async () => {
    if (!isMountedRef.current) return;
    // F4-18: descarta fetch concorrente (já existe um em curso).
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    setLoading(true);
    setError(null);
    // Reset do estado de paginação (refetch = recarrega do zero).
    loadedContactsRef.current = [];
    loadedMessagesRef.current = [];
    contactsCursorRef.current = null;
    messagesCursorRef.current = null;
    hasMoreContactsRef.current = false;
    hasMoreMessagesRef.current = false;
    setHasMoreConversations(false);

    try {
      const [contactsPage, messagesPage] = await Promise.all([
        fetchContactsPage(null),
        fetchMessagesPage(null),
      ]);
      if (!isMountedRef.current) return;

      const normalizedMessages = messagesPage;
      loadedContactsRef.current = dedupeContacts(contactsPage);
      loadedMessagesRef.current = dedupeMessages(normalizedMessages);

      contactsCursorRef.current =
        contactsPage.length === CONTACTS_PAGE_SIZE
          ? cursorFromContact(contactsPage[contactsPage.length - 1])
          : null;
      messagesCursorRef.current =
        normalizedMessages.length === MESSAGES_PAGE_SIZE
          ? cursorFromMessage(normalizedMessages[normalizedMessages.length - 1])
          : null;
      hasMoreContactsRef.current = contactsCursorRef.current !== null;
      hasMoreMessagesRef.current = messagesCursorRef.current !== null;
      setHasMoreConversations(hasMoreContactsRef.current || hasMoreMessagesRef.current);

      const messageContacts = await hydrateMissingMessageContacts(
        normalizedMessages,
        loadedContactsRef.current
      );
      if (!isMountedRef.current) return;
      if (messageContacts.length > 0) {
        loadedContactsRef.current = dedupeContacts([
          ...loadedContactsRef.current,
          ...messageContacts,
        ]);
      }

      commitConversations(
        buildConversations(
          [...contactsPage, ...messageContacts],
          normalizedMessages
        )
      );
    } catch (err) {
      log.error('Error fetching conversations:', err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
      }
    } finally {
      fetchInFlightRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  }, [commitConversations, fetchContactsPage, fetchMessagesPage, hydrateMissingMessageContacts]);

  // F4-01: load-more sob demanda (scroll infinito da sidebar) — busca as
  // próximas páginas a partir dos cursors e faz o merge incremental com o
  // estado acumulado, sem re-buscar as páginas anteriores.
  const loadMoreConversations = useCallback(async () => {
    if (loadMoreInFlightRef.current) return;
    if (!hasMoreContactsRef.current && !hasMoreMessagesRef.current) return;
    if (!isMountedRef.current) return;

    loadMoreInFlightRef.current = true;
    setLoadingMoreConversations(true);
    try {
      const [contactsPage, messagesPage] = await Promise.all([
        hasMoreContactsRef.current ? fetchContactsPage(contactsCursorRef.current) : Promise.resolve([] as ConversationContact[]),
        hasMoreMessagesRef.current ? fetchMessagesPage(messagesCursorRef.current) : Promise.resolve([] as RealtimeMessage[]),
      ]);
      if (!isMountedRef.current) return;

      if (contactsPage.length > 0) {
        loadedContactsRef.current = dedupeContacts([
          ...loadedContactsRef.current,
          ...contactsPage,
        ]);
        contactsCursorRef.current =
          contactsPage.length === CONTACTS_PAGE_SIZE
            ? cursorFromContact(contactsPage[contactsPage.length - 1])
            : null;
      } else {
        contactsCursorRef.current = null;
      }
      hasMoreContactsRef.current = contactsCursorRef.current !== null;

      if (messagesPage.length > 0) {
        loadedMessagesRef.current = dedupeMessages([
          ...loadedMessagesRef.current,
          ...messagesPage,
        ]);
        messagesCursorRef.current =
          messagesPage.length === MESSAGES_PAGE_SIZE
            ? cursorFromMessage(messagesPage[messagesPage.length - 1])
            : null;
      } else {
        messagesCursorRef.current = null;
      }
      hasMoreMessagesRef.current = messagesCursorRef.current !== null;
      setHasMoreConversations(hasMoreContactsRef.current || hasMoreMessagesRef.current);

      const messageContacts = await hydrateMissingMessageContacts(
        messagesPage,
        loadedContactsRef.current
      );
      if (!isMountedRef.current) return;
      if (messageContacts.length > 0) {
        loadedContactsRef.current = dedupeContacts([
          ...loadedContactsRef.current,
          ...messageContacts,
        ]);
      }

      commitConversations(
        buildConversations(loadedContactsRef.current, loadedMessagesRef.current)
      );
    } catch (err) {
      log.error('Error loading more conversations:', err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load more conversations');
      }
    } finally {
      loadMoreInFlightRef.current = false;
      if (isMountedRef.current) setLoadingMoreConversations(false);
    }
  }, [commitConversations, fetchContactsPage, fetchMessagesPage, hydrateMissingMessageContacts]);

  // ─── HANDLER REFS ──────────────────────────────────────────────────────────
  // Store event handlers in refs so the realtime subscription useEffect only
  // depends on fetchConversations (stable) instead of the full handler chain
  // (which changes whenever notification settings load/update, causing unnecessary
  // re-subscriptions that fetch 500 contacts + 1000 messages each time).
  const handleNewMessageRef = useRef(handleNewMessage);
  handleNewMessageRef.current = handleNewMessage;
  const handleMessageUpdateRef = useRef(handleMessageUpdate);
  handleMessageUpdateRef.current = handleMessageUpdate;
  const handleMessageDeleteRef = useRef(handleMessageDelete);
  handleMessageDeleteRef.current = handleMessageDelete;
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    // Última conexão bem-sucedida do canal — classifica CHANNEL_ERROR transiente vs real.
    let lastConnectedAtMs: number | null = null;
    void fetchConversations();

    log.info('Subscribing to realtime', { source: 'dbTable' });

    const channelName = 'messages-realtime'; // F4-03: nome determinístico — 1 channel estável por sessão (sem Math.random() no nome)
    logMessagesSubscribe('useRealtimeMessages', { event: 'INSERT', table: dbTable('messages') });
    logMessagesSubscribe('useRealtimeMessages', { event: 'UPDATE', table: dbTable('messages') });
    logMessagesSubscribe('useRealtimeMessages', { event: 'DELETE', table: dbTable('messages') });

    // Fanout (Realtime v2 não entrega partições): assina o ESPELHO zapp.realtime_message_fanout.
    // Fanout v2 (2026-08-17): o espelho ganhou from_me/deleted_at/contact_id/status —
    // adaptEvoPayload mapeia from_me → sender e deleted_at → is_deleted corretamente.
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
          schema: 'zapp',
          table: 'realtime_message_fanout',
        },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              // Use ref to avoid stale closure and prevent re-subscription on handler changes
              (p: RealtimePostgresChangesPayload<RealtimeMessage>) => handleNewMessageRef.current(p)
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
          // QA12-GAP1: invalida o cache compartilhado do painel de conversa
          // (['conversation-messages', contactId]) — History/NBA/Stats ficavam
          // com a última mensagem STALE até o staleTime (30s) ou reopen.
          if (active) {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'zapp',
          table: 'realtime_message_fanout',
        },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              (p: RealtimePostgresChangesPayload<RealtimeMessage>) =>
                handleMessageUpdateRef.current(p)
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
          // QA12-GAP1: mesmo motivo do INSERT — UPDATE de mensagem (status/
          // conteúdo) deve refletir no cache do painel.
          if (active) {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'zapp',
          table: 'realtime_message_fanout',
        },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              (p: RealtimePostgresChangesPayload<RealtimeMessage>) =>
                handleMessageDeleteRef.current(p)
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
          // QA12-GAP1: DELETE de mensagem também deve refletir no cache do painel.
          if (active) {
            queryClient.invalidateQueries({ queryKey: ['conversation-messages'] });
          }
        }
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          lastConnectedAtMs = Date.now();
          log.debug('Subscription status', { status });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // E31: classifica CHANNEL_ERROR/TIMED_OUT (transiente vs real) com o
          // mesmo padrão dos hooks irmãos (useMessagesCursor/useIncomingCallBroadcast).
          void logChannelError(log, '[useRealtimeMessages] subscription status:', lastConnectedAtMs, status);
          log.debug('Subscription status', { status });
        } else {
          log.debug('Subscription status', { status });
        }
      });

    return () => {
      active = false;
      void dbRemoveChannel('messages', channel);
    };
  }, [fetchConversations, queryClient]);
  // ^^ Only depend on fetchConversations (stable) + queryClient (estável); handlers
  // are accessed via refs above to prevent re-subscriptions when notification
  // settings load/change.

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

  // ── Batch markAsRead (2026-08-03) ────────────────────────────────────────
  // Produção: 22 PATCH individuais em rajada no inbox load (1 por conversa
  // selecionada, cada um retentado no 429 do Kong — ver logs
  // www.zappweb.app.br-*.log: PATCH /rest/v1/messages?contact_id=eq.X&
  // sender=eq.contact&is_read=eq.false). As chamadas agora são coalescidas
  // num buffer e descarregadas em UMA chamada batch:
  //   dbFrom('messages').update({is_read:true}).in('contact_id', ids)
  //     .eq('sender','contact').eq('is_read',false)
  // O update otimista (commitConversations) continua IMEDIATO por clique —
  // só o PATCH é agrupado (flush após MARK_READ_FLUSH_MS de inatividade, ou
  // no unmount em fire-and-forget para não perder writes).
  const MARK_READ_FLUSH_MS = 250;
  const pendingMarkReadRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushMarkAsRead = useCallback(async () => {
    if (markReadTimerRef.current !== null) {
      clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = null;
    }
    const ids = Array.from(pendingMarkReadRef.current);
    pendingMarkReadRef.current = new Set();
    if (ids.length === 0) return;

    const { error } = await dbFrom('messages')
      .update({ is_read: true })
      .in('contact_id', ids)
      .eq('sender', 'contact')
      .eq('is_read', false);
    if (error) log.error('Error marking messages as read (batch):', error);

    // Touch last_seen throttled global (máx. 1 PATCH a cada 2min, deduplicado entre instâncias)
    touchLastSeen();
  }, []);

  const scheduleMarkAsReadFlush = useCallback(() => {
    if (markReadTimerRef.current !== null) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      void flushMarkAsRead();
    }, MARK_READ_FLUSH_MS);
  }, [flushMarkAsRead]);

  const applyOptimisticRead = useCallback(
    (contactIds: string[]) => {
      const idSet = new Set(contactIds);
      commitConversations((prev) =>
        prev.map((c) =>
          idSet.has(c.contact.id)
            ? { ...c, messages: c.messages.map((m) => ({ ...m, is_read: true })), unreadCount: 0 }
            : c
        )
      );
    },
    [commitConversations]
  );

  const markAsRead = useCallback(
    async (contactId: string) => {
      // ── UUID guard ──────────────────────────────────────────────────────────
      // messages.contact_id (e evo.evolution_messages.contact_id) são uuid
      // columns. selectedContactId pode vir de deep-link como JID/telefone
      // (ex.: "551146375517") em vez de UUID — passar isso ao .eq()/.in() do
      // PostgREST causaria 400 "invalid input syntax for type uuid".
      // Pular silenciosamente.
      if (!isValidUUID(contactId)) {
        log.warn(
          '[markAsRead] contactId is not a valid UUID — skipping to prevent 400 (likely a WhatsApp JID)',
          { contactId }
        );
        return;
      }
      // ────────────────────────────────────────────────────────────────────────

      // Otimista imediato (mesma UX de antes, sem esperar o PATCH)
      applyOptimisticRead([contactId]);
      // PATCH coalescido: rajadas de seleção viram 1 chamada .in()
      pendingMarkReadRef.current.add(contactId);
      scheduleMarkAsReadFlush();
    },
    [applyOptimisticRead, scheduleMarkAsReadFlush]
  );

  /** Marca várias conversas como lidas em UM PATCH batch (.in('contact_id', ids)). */
  const markManyAsRead = useCallback(
    (contactIds: string[]) => {
      const validIds = contactIds.filter(isValidUUID);
      if (validIds.length === 0) return;
      applyOptimisticRead(validIds);
      for (const id of validIds) pendingMarkReadRef.current.add(id);
      scheduleMarkAsReadFlush();
    },
    [applyOptimisticRead, scheduleMarkAsReadFlush]
  );

  // Flush pendente no unmount (fire-and-forget) — evita perder writes quando
  // o usuário navega antes do debounce disparar.
  useEffect(() => {
    return () => {
      if (markReadTimerRef.current !== null) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
      void flushMarkAsRead();
    };
  }, [flushMarkAsRead]);

  // Subscribe to bus to recompute conversationSendState
  useEffect(() => {
    const unsub = subscribeAllSendStatus(() => setSendStateTick((t) => t + 1));
    return unsub;
  }, []);

  // Derive per-contact send state (transient bus + last DB status).
  // F4-04: useMemo com deps [conversations, sendStateTick] — evita O(n·m)
  // (filter de outbound + getSendStatus por conversa) a cada render.
  const conversationSendState = useMemo<Record<string, ConversationSendState>>(() => {
    void sendStateTick; // tick do bus — invalida o memo quando um status muda
    const stateMap: Record<string, ConversationSendState> = {};
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
      stateMap[c.contact.id] = state;
    }
    return stateMap;
  }, [conversations, sendStateTick]);

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
            conv.contact.routing_status === 'pending'
          );
        }
        if (statusFilter === 'closed') {
          return conv.lastMessage?.sender === 'agent' && conv.contact.routing_status !== 'pending';
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
    markManyAsRead,
    refetch: fetchConversations,
    // F4-01: paginação por cursor — load-more sob demanda para scroll
    // infinito da sidebar (páginas de CONTACTS_PAGE_SIZE/MESSAGES_PAGE_SIZE).
    hasMoreConversations,
    loadingMoreConversations,
    loadMoreConversations,
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
