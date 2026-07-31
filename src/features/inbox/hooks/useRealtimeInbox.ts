import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import {
  type ConversationWithMessages,
  type ConversationContact,
  type RealtimeMessage,
} from '@/features/inbox';
import { useAuth } from '@/features/auth';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { validatePttBlob } from '@/lib/audio/pttLimits';
import { seedAvatarCache } from '@/features/inbox';
import { isValidUUID } from '@/utils/uuid';
import { resolveContactRef, isUuidRef, isJidRef, contactRefToString } from '../utils/contactRef';
import { mapToLegacyConversation, mapToLegacyMessages } from '@/adapters/inboxLegacyMapper';
import { dbFrom } from '@/integrations/datasource/db';
import { queryExternalProxy } from '@/lib/externalProxy';
import { useMessageQueue, QueueItem } from './useMessageQueue';
import { useInboxHeartbeat } from './useInboxHeartbeat';
import { useInboxDeepLinks } from './useInboxDeepLinks';
import { useInboxSource } from './useInboxSource';
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

// Feature flag: use external evolution DB (FATOR X) as data source.
const USE_EXTERNAL_DB = true;

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
  const [selectedContactFallback, setSelectedContactFallback] =
    useState<ConversationContact | null>(null);
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
  } = source;

  // ── Resolved instance name ──────────────────────────────────────────────
  // Priority: inbox source (from conversation list) > fallback contact >
  // undefined (causes dev warning + disables edit/automations)
  const instanceName = useMemo<string | undefined>(() => {
    if (selectedConversationInstance) return selectedConversationInstance;
    const fb = selectedContactFallback as { instance_name?: string } | null;
    return fb?.instance_name ?? undefined;
  }, [selectedConversationInstance, selectedContactFallback]);

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
  const seededAvatarsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!conversations || conversations.length === 0) return;
    conversations.forEach((c) => {
      if (c.contact.avatar_url && !seededAvatarsRef.current.has(c.contact.id)) {
        seedAvatarCache(c.contact.id, c.contact.avatar_url);
        seededAvatarsRef.current.add(c.contact.id);
      }
    });
  }, [conversations]);

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
  // try multiple strategies to find/build a contact so ChatPanel renders:
  //   1. LOCAL (all modes): search contacts by id / phone / remote_jid
  //   2. EXTERNAL PROXY (USE_EXTERNAL_DB only): query rpc_get_contact by JID
  //   3. SYNTHETIC (last resort): build a minimal contact from the raw ID
  useEffect(() => {
    if (!selectedContactId || selectedConversation) {
      setSelectedContactFallback(null);
      return;
    }

    let cancelled = false;
    const loadSelectedContact = async () => {
      const ref = resolveContactRef(selectedContactId);
      if (!ref) {
        if (!cancelled) setSelectedContactFallback(null);
        return;
      }

      // ── Strategy A: local Supabase lookup, ramificada por tipo ──────────
      let localResult: Record<string, unknown> | null = null;

      if (isUuidRef(ref)) {
        // UUID → contacts.id
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('id', ref.uuid)
          .maybeSingle();
        if (error) {
          log.warn('[fallbackContact] erro ao buscar contato por UUID', {
            uuid: ref.uuid,
            code: error.code,
            message: error.message,
          });
        } else if (data) {
          localResult = data as Record<string, unknown>;
        }
      } else if (isJidRef(ref)) {
        // JID → busca por phone (contatos locais sincronizados)
        if (ref.phone) {
          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('phone', ref.phone)
            .maybeSingle();
          if (error) {
            log.warn('[fallbackContact] erro ao buscar contato por phone', {
              phone: ref.phone,
              code: error.code,
              message: error.message,
            });
          } else if (data) {
            localResult = data as Record<string, unknown>;
          }
        }
        // Se phone não encontrou, tenta por remote_jid em evolution_contacts
        if (!localResult) {
          const { data, error } = await supabase
            .from('evolution_contacts')
            .select('*')
            .eq('remote_jid', ref.remoteJid)
            .order('updated_at', { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          if (error) {
            log.warn('[fallbackContact] erro ao buscar evolution_contacts por JID', {
              remoteJid: ref.remoteJid,
              code: error.code,
              message: error.message,
            });
          } else if (data) {
            localResult = data as Record<string, unknown>;
          }
        }
      }

      // ── Strategy B: external proxy rpc_get_contact (USE_EXTERNAL_DB) ────
      if (!localResult && USE_EXTERNAL_DB && isJidRef(ref)) {
        try {
          const proxyResult = await queryExternalProxy<Record<string, unknown>>({
            action: 'rpc',
            rpc: 'rpc_get_contact',
            params: { p_remote_jid: ref.remoteJid, p_instance: DEFAULT_INSTANCE },
          });
          const first = proxyResult?.data?.[0];
          if (first) {
            const ext = first as Record<string, unknown>;
            localResult = {
              id: ref.remoteJid,
              name: (ext.name || ext.push_name || ref.phone || ref.remoteJid) as string,
              phone: ref.phone ?? ref.remoteJid,
              remote_jid: ref.remoteJid,
              avatar_url: (ext.avatar_url || null) as string | null,
              company: (ext.company || null) as string | null,
              tags: ext.tags ?? null,
              instance_name: DEFAULT_INSTANCE,
            };
          }
        } catch (err) {
          log.warn('[fallbackContact] external proxy indisponível', {
            remoteJid: ref.remoteJid,
            error: String(err),
          });
        }
      }

      // ── Strategy C: synthetic fallback (last resort) ────────────────────
      if (!localResult && USE_EXTERNAL_DB) {
        localResult = {
          id: contactRefToString(ref),
          name: isJidRef(ref) ? ref.remoteJid.split('@')[0] : ref.raw,
          phone: isJidRef(ref) ? (ref.phone ?? ref.raw) : ref.raw,
          remote_jid: isJidRef(ref) ? ref.remoteJid : null,
          avatar_url: null,
          company: null,
          tags: null,
          instance_name: DEFAULT_INSTANCE,
        };
      }

      if (!cancelled) setSelectedContactFallback(localResult as ConversationContact | null);
    };
    void loadSelectedContact();
    return () => {
      cancelled = true;
    };
  }, [selectedContactId, selectedConversation]);

  const resolvedSelectedConversation = useMemo<ConversationWithMessages | null>(() => {
    if (selectedConversation) return selectedConversation;
    if (!selectedContactFallback) return null;
    return { contact: selectedContactFallback, messages: [], unreadCount: 0, lastMessage: null };
  }, [selectedConversation, selectedContactFallback]);

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

    if (!isValidUUID(selectedContactId)) {
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
  useEffect(() => {
    if (!selectedMessages || selectedMessages.length === 0 || !selectedContactId) return;
    const recent = selectedMessages.slice(-10);
    recent.forEach((msg) => {
      if (msg.external_id && (msg.sender === 'agent' || msg.sender === 'bot')) {
        const status =
          msg.status === 'failed' || msg.status === 'failed_auth' || msg.status === 'failed_retries'
            ? 'failed'
            : 'confirmed';
        messageQueue.reconcileWithDelivery(selectedContactId, msg.external_id, status);
      } else if (msg.content && msg.sender === 'bot') {
        messageQueue.reconcileWithDelivery(
          selectedContactId,
          msg.content,
          msg.status === 'failed' ? 'failed' : 'confirmed'
        );
      }
    });
  }, [selectedMessages, selectedContactId, messageQueue]);

  const handleSelectConversation = useCallback(
    (contactId: string) => {
      setSelectedContactId(contactId);
      setSelectedContact(contactId);
      setDeliveryAlert(null);

      if (USE_EXTERNAL_DB) {
        void supabase.functions.invoke('evolution-api', {
          body: {
            action: 'read-messages',
            instanceName: instanceName ?? DEFAULT_INSTANCE,
            remoteJid: contactId,
          },
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
      (content: string, attachments?: File[]) => {
        if (!selectedContactId) return;
        messageQueue.addToQueue(
          selectedContactId,
          content || (attachments?.length ? `Enviando ${attachments.length} anexo(s)` : ''),
          attachments,
          attachments?.length ? 'attachment' : 'text'
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
