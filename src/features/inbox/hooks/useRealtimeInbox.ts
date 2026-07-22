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
import { mapToLegacyConversation, mapToLegacyMessages } from '@/adapters/inboxLegacyMapper';
import { dbFrom } from '@/integrations/datasource/db';
import { useMessageQueue, QueueItem } from './useMessageQueue';
import { useInboxHeartbeat } from './useInboxHeartbeat';
import { useInboxDeepLinks } from './useInboxDeepLinks';
import { useInboxSource } from './useInboxSource';

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
    localRealtime,
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
        (c) => c.contact.id === selectedContactId || c.contact.phone === selectedContactId
      ) || null,
    [conversations, selectedContactId]
  );

  useEffect(() => {
    if (!selectedContactId || selectedConversation || USE_EXTERNAL_DB) {
      setSelectedContactFallback(null);
      return;
    }

    let cancelled = false;
    const loadSelectedContact = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', selectedContactId)
        .maybeSingle();
      if (!cancelled && !error) setSelectedContactFallback(data || null);
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

  // Reconcile message queue with incoming messages
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
  }, [selectedMessages, selectedContactId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      supabase.removeChannel(channel);
    };
  }, [selectedContactId, profile?.id]);

  const messageQueue = useMessageQueue(async (item: QueueItem) => {
    const { contactId, content, attachments } = item;

    // Auto-assign on reply
    try {
      const tableName = USE_EXTERNAL_DB ? 'evolution_contacts' : 'team_conversations';
      const idField = USE_EXTERNAL_DB ? 'remote_jid' : 'id';
      const { data: conv } = await dbFrom(tableName)
        .select(`${idField}, routing_status`)
        .eq(idField, contactId)
        .maybeSingle();
      if (conv && conv.routing_status === 'pending') {
        await dbFrom(tableName).update({ routing_status: 'assigned' }).eq(idField, contactId);
      }
    } catch (err) {
      log.error('Error auto-assigning on reply:', err);
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
          addExternalMessage?.(optimistic as never);
        } else if (attachments && attachments.length > 0) {
          for (let i = 0; i < attachments.length; i++) {
            const file = attachments[i];
            const { optimistic } = await sendExternalMedia(contactId, file, {
              contactAvatar: currentAvatar,
              caption: i === 0 ? content : undefined,
              onProgress: (p) => {
                const total = (i / attachments.length) * 100 + p / attachments.length;
                messageQueue.updateProgress(item.id, total);
              },
            });
            if (optimistic.external_id) item.externalId = optimistic.external_id;
            addExternalMessage?.(optimistic as never);
          }
        } else {
          const { optimistic } = await sendExternalText(contactId, content, {
            contactAvatar: currentAvatar,
            onProgress: (p) => {
              messageQueue.updateProgress(item.id, p);
            },
          });
          if (optimistic.external_id) item.externalId = optimistic.external_id;
          addExternalMessage?.(optimistic as never);
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

  const handleSelectConversation = useCallback(
    (contactId: string) => {
      setSelectedContactId(contactId);
      setSelectedContact(contactId);
      setDeliveryAlert(null);

      if (USE_EXTERNAL_DB) {
        void supabase.functions.invoke('evolution-api', {
          body: { action: 'read-messages', instanceName: 'wpp2', remoteJid: contactId },
        });
      } else {
        markAsRead(contactId);
      }
    },
    [setSelectedContact, markAsRead]
  );

  const handleNotificationView = useCallback(() => {
    if (newMessageNotification) {
      handleSelectConversation(newMessageNotification.contactId);
      dismissNotification();
    }
  }, [newMessageNotification, handleSelectConversation, dismissNotification]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => !prev);
    setSoundEnabled(!soundOn);
  }, [soundOn, setSoundEnabled]);

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
    batcherStatus: USE_EXTERNAL_DB ? null : localRealtime.batcherStatus,
    deliveryAlert,
    messageQueue,
  };
}
