import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { type RealtimeMessage } from '@/features/inbox';
import { useAuth } from '@/features/auth';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { validatePttBlob } from '@/lib/audio/pttLimits';
import { seedAvatarCache } from '@/features/inbox';
import { resolveContactRef, isUuidRef } from '../utils/contactRef';
import { mapToLegacyConversation, mapToLegacyMessages } from '@/adapters/inboxLegacyMapper';
import { dbFrom } from '@/integrations/datasource/db';
import { useMessageQueue, QueueItem } from './useMessageQueue';
import { useInboxHeartbeat } from './useInboxHeartbeat';
import { useInboxDeepLinks } from './useInboxDeepLinks';
import { useInboxSource } from './useInboxSource';
import { useFallbackContact } from './useFallbackContact';
import { DEFAULT_INSTANCE } from '@/hooks/evolutionFetchers';
import type { OptimisticMessage, SendExternalResult } from './realtime/externalSenderTypes';

type AddExternalMessageArg = Parameters<
  NonNullable<ReturnType<typeof useInboxSource>['addExternalMessage']>
>[0];

/** Converte a bolha otimista (status como string livre) no formato RealtimeMessage esperado pelo store. */
function toRealtimeMessage(optimistic: OptimisticMessage) {
  return optimistic as unknown as AddExternalMessageArg;
}

const log = getLogger('useRealtimeInbox');

// Feature flag: use external DB (DESCONTINUADO — sempre FALSE).
// Padrão FALSE: Evolution DB é acessado via client principal self-hosted.
const USE_EXTERNAL_DB = import.meta.env.VITE_USE_EXTERNAL_DB === 'true';

// F4-08: TTL + sweep do cache de avatares semeados. O Set antigo crescia sem
// limite (memory leak) e nunca re-seedeava avatares alterados. Cada entrada
// expira após AVATAR_SEED_TTL_MS e um sweep periódico (a cada 5min) remove as
// expiradas — o mapa fica limitado aos contatos vistos na janela TTL.
const AVATAR_SEED_TTL_MS = 30 * 60 * 1000; // 30min
const AVATAR_SEED_SWEEP_MS = 5 * 60 * 1000; // 5min

// F4-07: cap do Set de entregas já reconciliadas (padrão F4-10) — com
// evicção da entrada mais antiga, o Set não cresce sem limite em conversas
// com muitos envios.
const RECONCILED_MAX_ENTRIES = 1000;

export function useRealtimeInbox() {
  const { profile } = useAuth();
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [pendingContactId, setPendingContactId] = useState<string | null>(null);
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(true);
  const [pipContact, setPipContact] = useState<{
    name: string;
    avatar?: string;
    lastMessage?: string;
    contactId: string;
  } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [deliveryAlert, setDeliveryAlert] = useState<{
    status: 'warning' | 'breached';
    delay: number;
    message?: string;
  } | null>(null);
  const [whisperCount, setWhisperCount] = useState(0);
  const postSendTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 1. Data Source (Local or External)
  const source = useInboxSource(USE_EXTERNAL_DB, selectedContactId);
  const {
    conversations,
    loading,
    error,
    refetch,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    selectedMessages,
    selectedMessagesLoading,
    refetchSelectedMessages,
    loadOlderMessages,
    cancelLoadOlderMessages,
    loadingOlderMessages,
    hasMoreMessages,
    addExternalMessage,
    selectedConversationInstance,
    localRealtime,
    loadMoreConversations,
    hasMoreConversations,
    loadingMoreConversations,
  } = source;

  const {
    sendMessage,
    markAsRead,
    newMessageNotification,
    dismissNotification,
    setSelectedContact,
    setSoundEnabled,
  } = localRealtime;

  // 2. Heartbeat & Online Status
  const { isOnline } = useInboxHeartbeat(profile?.id);

  // 3. Deep Links
  useInboxDeepLinks({ setPendingContactId, setPendingMessageId, useExternalDb: USE_EXTERNAL_DB });

  // Cleanup post-send refetch timer on unmount
  useEffect(
    () => () => {
      clearTimeout(postSendTimerRef.current);
    },
    []
  );

  // 4. Offline Cache
  const { conversations: cachedConversations, usingCache } = useOfflineCache(
    conversations,
    loading
  );

  // 🔬 Probe: log transitions in the conversations array coming from the data source
  // (external Evolution DB when USE_EXTERNAL_DB=true). Emits on every length change,
  // and always at least once with initial=true so we can prove 0→N hydration.
  const convProbeRef = useRef<{ len: number; logged: boolean }>({ len: -1, logged: false });
  useEffect(() => {
    // F4-09: probe é ferramenta de debug — não roda em produção.
    if (!import.meta.env.DEV) return;
    const len = conversations?.length ?? 0;
    const prev = convProbeRef.current.len;
    if (len !== prev || !convProbeRef.current.logged) {
      convProbeRef.current = { len, logged: true };
      log.info('[probe] conversations state', {
        source: USE_EXTERNAL_DB ? 'external' : 'local',
        length: len,
        prevLength: prev,
        loading,
        error: error ?? null,
        cachedLength: cachedConversations?.length ?? 0,
        usingCache,
        sample: (conversations ?? []).slice(0, 3).map((c) => ({
          id: c?.contact?.id,
          jid: c?.contact?.remote_jid,
          name: c?.contact?.name,
          assigned_to: c?.contact?.assigned_to ?? null,
          unread: c?.unreadCount ?? 0,
        })),
      });
    }
  }, [conversations, loading, error, cachedConversations, usingCache]);

  // Seed avatar cache — only once per contact ID to avoid redundant calls when
  // the conversations array gets a new reference without data changes.
  // F4-08: Map<contactId, lastSeededAt> com TTL — após AVATAR_SEED_TTL_MS a
  // entrada expira e o avatar pode ser re-semeado (cobre mudança de foto).
  const seededAvatarsRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!conversations || conversations.length === 0) return;
    const now = Date.now();
    conversations.forEach((c) => {
      const lastSeededAt = seededAvatarsRef.current.get(c.contact.id);
      if (
        c.contact.avatar_url &&
        (lastSeededAt === undefined || now - lastSeededAt >= AVATAR_SEED_TTL_MS)
      ) {
        seedAvatarCache(c.contact.id, c.contact.avatar_url);
        seededAvatarsRef.current.set(c.contact.id, now);
      }
    });
  }, [conversations]);

  // F4-08: sweep periódico (5min) — remove entradas expiradas para manter o
  // mapa com tamanho limitado (memory bound) e permitir re-seed futuro.
  useEffect(() => {
    const sweep = () => {
      const now = Date.now();
      for (const [contactId, lastSeededAt] of seededAvatarsRef.current) {
        if (now - lastSeededAt >= AVATAR_SEED_TTL_MS) {
          seededAvatarsRef.current.delete(contactId);
        }
      }
    };
    const interval = setInterval(sweep, AVATAR_SEED_SWEEP_MS);
    return () => clearInterval(interval);
  }, []);

  // Load fallback contact if not found in list
  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (c) => c.contact.id === selectedContactId || c.contact.remote_jid === selectedContactId
      ) || null,
    [conversations, selectedContactId]
  );

  // ── Fallback contact search ───────────────────────────────────────────────
  // When the clicked conversation is NOT in the sidebar list (BREAK POINT A),
  // useFallbackContact resolves the contact (JID vs UUID via resolveContactRef)
  // and returns the conversation, trying local lookup (contacts.id / phone /
  // evolution_contacts.remote_jid), external proxy rpc_get_contact, and a
  // synthetic last-resort contact.
  const resolvedSelectedConversation = useFallbackContact(
    selectedContactId,
    selectedConversation,
    USE_EXTERNAL_DB
  );

  // ── Resolved instance name ──────────────────────────────────────────────
  // Priority: inbox source (from conversation list) > fallback contact >
  // undefined (causes dev warning + disables edit/automations)
  const instanceName = useMemo<string | undefined>(() => {
    if (selectedConversationInstance) return selectedConversationInstance;
    const fb = resolvedSelectedConversation?.contact as { instance_name?: string } | null;
    return fb?.instance_name ?? undefined;
  }, [selectedConversationInstance, resolvedSelectedConversation]);

  // Listen for SLA alerts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.contactId === selectedContactId) {
        setDeliveryAlert({ status: detail.status, delay: detail.delay, message: detail.message });
      }
    };
    window.addEventListener('sla-delivery-alert', handler);
    return () => window.removeEventListener('sla-delivery-alert', handler);
  }, [selectedContactId]);

  // Whisper count
  useEffect(() => {
    if (!selectedContactId || !profile?.id) {
      setWhisperCount(0);
      return;
    }

    // ── UUID guard ──────────────────────────────────────────────────────────
    // whisper_messages.contact_id is a uuid column. When USE_EXTERNAL_DB=true,
    // selectedContactId may be a WhatsApp JID / phone number (e.g. "551146375517")
    // instead of a UUID. PostgREST returns 400 "invalid input syntax for type uuid"
    // when a non-UUID string is used as a filter on a uuid column.
    // Skip both the count query and the realtime subscription in that case.

    if (!isUuidRef(resolveContactRef(selectedContactId))) {
      log.debug(
        '[whisperCount] selectedContactId is not a UUID — skipping whisper query (likely a WhatsApp JID)',
        { selectedContactId }
      );
      setWhisperCount(0);
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    let cancelled = false;
    const fetchWhisperCount = async () => {
      const { count, error } = await supabase
        .from('whisper_messages')
        .select('*', { count: 'exact', head: true })
        .eq('contact_id', selectedContactId)
        .eq('is_read', false);
      if (!cancelled && !error && count !== null) setWhisperCount(count);
    };
    void fetchWhisperCount();

    // Wave 2: whisper_messages is a VIEW in public schema — zapp.whisper_messages is the base table.
    // PostgreSQL views never emit WAL events, so Realtime subscriptions must target the base table.
    const channel = supabase
      .channel(`whisper-count-${selectedContactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'whisper_messages',
          filter: `contact_id=eq.${selectedContactId}`,
        },
        () => {
          void fetchWhisperCount();
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [selectedContactId, profile?.id]);

  const messageQueue = useMessageQueue(async (item: QueueItem) => {
    const { contactId, content, attachments } = item;

    // Auto-assign on reply (only valid for local team_conversations; evolution_contacts has no routing_status)
    if (!USE_EXTERNAL_DB) {
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
        log.error('Error auto-assigning on reply:', err);
      }
    }

    if (USE_EXTERNAL_DB) {
      const { sendExternalText, sendExternalMedia, sendExternalAudio } = await import('..');
      const currentAvatar = resolvedSelectedConversation?.contact.avatar_url;

      try {
        if (item.type === 'audio' && attachments?.[0]) {
          const { optimistic } = await sendExternalAudio(contactId, attachments[0], {
            contactAvatar: currentAvatar,
            isPtt: !attachments[0].name.endsWith('.mp3'),
            conversationInstance: resolvedSelectedConversation?.contact?.instance_name ?? undefined,
            onProgress: (p) => {
              messageQueue.updateProgress(item.id, p);
            },
          });
          if (optimistic.external_id) item.externalId = optimistic.external_id;
          addExternalMessage?.(toRealtimeMessage(optimistic));
        } else if (attachments && attachments.length > 0) {
          // Send all attachments, track successes. Only add optimistic bubbles
          // if ALL succeed — prevents phantom messages when one file fails.
          const results: SendExternalResult[] = [];
          let multiSendFailed = false;
          for (let i = 0; i < attachments.length; i++) {
            if (multiSendFailed) break;
            const file = attachments[i];
            try {
              const { optimistic } = await sendExternalMedia(contactId, file, {
                contactAvatar: currentAvatar,
                caption: i === 0 ? content : undefined,
                onProgress: (p) => {
                  const total = (i / attachments.length) * 100 + p / attachments.length;
                  messageQueue.updateProgress(item.id, total);
                },
              });
              results.push({ optimistic, externalId: optimistic.external_id });
            } catch {
              multiSendFailed = true;
            }
          }
          if (!multiSendFailed) {
            for (const r of results) {
              if (r.externalId) item.externalId = r.externalId;
              addExternalMessage?.(toRealtimeMessage(r.optimistic));
            }
          } else {
            // Remove the queue item so the user can retry
            messageQueue.removeFromQueue(item.id);
          }
        } else {
          const { optimistic } = await sendExternalText(contactId, content, {
            contactAvatar: currentAvatar,
            onProgress: (p) => {
              messageQueue.updateProgress(item.id, p);
            },
          });
          if (optimistic.external_id) item.externalId = optimistic.external_id;
          addExternalMessage?.(toRealtimeMessage(optimistic));
        }
      } catch (err) {
        log.error('Failed to send external message/media:', err);
        throw err;
      }

      clearTimeout(postSendTimerRef.current);
      postSendTimerRef.current = setTimeout(() => {
        void refetchSelectedMessages();
        void refetch();
      }, 1500);
      return;
    }

    // Local send
    if (attachments && attachments.length > 0) {
      for (const file of attachments) {
        await sendMessage(contactId, content, 'document', URL.createObjectURL(file));
      }
    } else {
      await sendMessage(contactId, content);
    }
    await Promise.all([refetch(), refetchSelectedMessages()]);
  });

  // Reconcile message queue with incoming messages — must be after messageQueue is initialized
  // F4-07: reconciliação COMPLETA. Antes: `selectedMessages.slice(-10)` — um
  // burst de >10 entregas deixava itens da fila sem confirmação. Agora varre
  // TODAS as mensagens da conversa e usa um Set de chaves já reconciliadas
  // (com cap, padrão F4-10) para não reprocessar a mesma entrega a cada
  // mudança de selectedMessages. O Set é resetado ao trocar de contato.
  const reconciledDeliveriesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    reconciledDeliveriesRef.current = new Set();
  }, [selectedContactId]);

  useEffect(() => {
    if (!selectedMessages || selectedMessages.length === 0 || !selectedContactId) return;
    const processed = reconciledDeliveriesRef.current;
    for (const msg of selectedMessages) {
      if (msg.sender !== 'agent' && msg.sender !== 'bot') continue;
      const status =
        msg.status === 'failed' || msg.status === 'failed_auth' || msg.status === 'failed_retries'
          ? 'failed'
          : 'confirmed';

      // Chave de dedupe: external_id quando existir; fallback content (bot sem external_id).
      const key = msg.external_id
        ? `${selectedContactId}:${msg.external_id}`
        : msg.content && msg.sender === 'bot'
          ? `${selectedContactId}:content:${msg.content}`
          : null;
      if (!key) continue;
      if (processed.has(key)) continue;

      // F4-10-style cap: evicta a entrada mais antiga (Set preserva ordem de inserção).
      if (processed.size >= RECONCILED_MAX_ENTRIES) {
        const oldest = processed.values().next().value;
        if (oldest !== undefined) processed.delete(oldest);
      }
      processed.add(key);

      messageQueue.reconcileWithDelivery(selectedContactId, msg.external_id ?? msg.content, status);
    }
  }, [selectedMessages, selectedContactId, messageQueue]);

  const handleSelectConversation = useCallback(
    (contactId: string) => {
      setSelectedContactId(contactId);
      setSelectedContact(contactId);
      setDeliveryAlert(null);

      if (USE_EXTERNAL_DB) {
        // F4-06: fire-and-forget com .catch — falha de read-messages vira log
        // (GlitchTip) em vez de unhandled rejection; UI não trava.
        void supabase.functions
          .invoke('evolution-api', {
            body: {
              action: 'read-messages',
              instanceName: instanceName ?? DEFAULT_INSTANCE,
              remoteJid: contactId,
            },
          })
          .catch((err: unknown) => {
            log.warn('[read-messages] failed', err);
          });
      } else {
        markAsRead(contactId);
      }
    },
    [setSelectedContact, markAsRead, instanceName]
  );

  const handleNotificationView = useCallback(() => {
    if (newMessageNotification) {
      handleSelectConversation(newMessageNotification.contactId);
      dismissNotification();
    }
  }, [newMessageNotification, handleSelectConversation, dismissNotification]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      setSoundEnabled(next);
      return next;
    });
  }, [setSoundEnabled]);

  const legacyConversation = useMemo(
    () => mapToLegacyConversation(resolvedSelectedConversation),
    [resolvedSelectedConversation]
  );
  const legacyMessages = useMemo(
    () =>
      mapToLegacyMessages(
        (selectedContactId
          ? selectedMessages
          : resolvedSelectedConversation?.messages || []) as RealtimeMessage[],
        resolvedSelectedConversation?.contact.id || selectedContactId || '',
        resolvedSelectedConversation?.contact.avatar_url
      ),
    [selectedMessages, resolvedSelectedConversation, selectedContactId]
  );

  return {
    selectedContactId,
    setSelectedContactId,
    showDetails,
    setShowDetails,
    isOnline,
    pipContact,
    setPipContact,
    pendingContactId,
    setPendingContactId,
    pendingMessageId,
    setPendingMessageId,
    soundOn,
    toggleSound,
    globalSearchOpen,
    setGlobalSearchOpen,
    showNewConversation,
    setShowNewConversation,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    profile,
    conversations,
    cachedConversations,
    usingCache,
    loading,
    error,
    selectedMessagesLoading,
    newMessageNotification,
    dismissNotification,
    legacyConversation,
    legacyMessages,
    handleSelectConversation,
    handleNotificationView,
    handleSendMessage: useCallback(
      (content: string, attachments?: File[], onProgress?: (p: number) => void) => {
        if (!selectedContactId) return;
        messageQueue.addToQueue(
          selectedContactId,
          content || (attachments?.length ? `Enviando ${attachments.length} anexo(s)` : ''),
          attachments,
          attachments?.length ? 'attachment' : 'text',
          onProgress
        );
      },
      [selectedContactId, messageQueue]
    ),
    handleSendAudio: useCallback(
      async (blob: Blob) => {
        if (!selectedContactId) {
          toast.error('Selecione uma conversa primeiro');
          return;
        }
        const validation = await validatePttBlob(blob);
        if (!validation.ok) {
          toast.error(validation.message ?? 'Áudio inválido.');
          return;
        }
        messageQueue.addToQueue(
          selectedContactId,
          'Mensagem de áudio',
          [new File([blob], `audio_${Date.now()}.ogg`, { type: 'audio/ogg' })],
          'audio'
        );
      },
      [selectedContactId, messageQueue]
    ),
    refetch,
    // F4-01: paginação por cursor (path local) — scroll infinito da sidebar.
    loadMoreConversations,
    hasMoreConversations,
    loadingMoreConversations,
    setSelectedContact,
    markAsRead,
    loadOlderMessages,
    cancelLoadOlderMessages,
    loadingOlderMessages,
    hasMoreMessages,
    whisperCount,
    instanceName,
    batcherStatus: USE_EXTERNAL_DB ? null : localRealtime.batcherStatus,
    deliveryAlert,
    messageQueue,
  };
}
