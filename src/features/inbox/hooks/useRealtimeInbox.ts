import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import type { ConversationWithMessages, RealtimeMessage } from './realtime/types';
import { seedAvatarCache } from './realtime/avatarBatchStore';
import { useAuth } from '@/features/auth';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { validatePttBlob } from '@/lib/audio/pttLimits';
import { mapToLegacyConversation, mapToLegacyMessages } from '@/adapters/inboxLegacyMapper';
import { dbFrom } from '@/integrations/datasource/db';
import { useMessageQueue, QueueItem } from './useMessageQueue';
import { useInboxHeartbeat } from './useInboxHeartbeat';
import { useInboxDeepLinks } from './useInboxDeepLinks';
import { useInboxSource } from './useInboxSource';
import { useWhisperCount } from './useWhisperCount';
import { useFallbackContact } from './useFallbackContact';

const log = getLogger('useRealtimeInbox');

// Feature flag: use external evolution DB (FATOR X) as data source.
// FIX: tipo explícito 'boolean' (não literal 'true') para preservar a branch
// !USE_EXTERNAL_DB no compilador TypeScript quando o modo local for reativado.
const USE_EXTERNAL_DB: boolean = true;

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
        (c) =>
          c.contact.id === selectedContactId ||
          (c.contact as { remote_jid?: string }).remote_jid === selectedContactId
      ) || null,
    [conversations, selectedContactId]
  );

  const resolvedSelectedConversation = useFallbackContact(selectedContactId, selectedConversation);

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
  }, [selectedMessages, selectedContactId]);

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
  const whisperCount = useWhisperCount(selectedContactId, profile?.id);

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
      const { sendExternalText, sendExternalMedia, sendExternalAudio } =
        await import('./realtime/externalMessageSender');
      const currentAvatar = resolvedSelectedConversation?.contact.avatar_url;

      try {
        if (item.type === 'audio' && attachments?.[0]) {
          const { optimistic } = await sendExternalAudio(contactId, attachments[0], {
            contactAvatar: currentAvatar,
            isPtt: !attachments[0].name.endsWith('.mp3'),
            conversationInstance:
              (
                resolvedSelectedConversation as ConversationWithMessages & {
                  instance_name?: string;
                }
              )?.instance_name ||
              (
                resolvedSelectedConversation?.contact as ConversationContact & {
                  instance_name?: string;
                }
              )?.instance_name,
            onProgress: (p) => {
              messageQueue.updateProgress(item.id, p);
            },
          });
          if (optimistic.external_id) item.externalId = optimistic.external_id;
          addExternalMessage?.(optimistic);
        } else if (attachments && attachments.length > 0) {
          for (let i = 0; i < attachments.length; i++) {
            const file = attachments[i];
            const { optimistic } = await sendExternalMedia(contactId, file, {
              contactAvatar: currentAvatar,
              caption: i === 0 ? content : undefined,
              onProgress: (p) => {
                messageQueue.updateProgress(
                  item.id,
                  p / attachments.length + (i / attachments.length) * 100
                );
              },
            });
            if (optimistic.external_id) item.externalId = optimistic.external_id;
            addExternalMessage?.(optimistic);
          }
        } else {
          const { optimistic } = await sendExternalText(contactId, content, {
            contactAvatar: currentAvatar,
            onProgress: (p) => {
              messageQueue.updateProgress(item.id, p);
            },
          });
          if (optimistic.external_id) item.externalId = optimistic.external_id;
          addExternalMessage?.(optimistic);
        }
      } catch (err) {
        log.error('Failed to send external message/media:', err);
        throw err;
      }

      clearTimeout(postSendTimerRef.current);
      // Only refresh the sidebar list — the message list is already updated
      // via the optimistic message added above; polling handles reconciliation.
      // Calling refetchSelectedMessages() (= initialFetch) here would collapse
      // the chat to the last page, discarding any messages loaded via scroll-up.
      postSendTimerRef.current = setTimeout(() => {
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
    // FIX Bug#2-residual + TypeScript: useExternalDb é boolean (não literal 'true').
    // Permite que !inbox.useExternalDb funcione corretamente em local mode futuro.
    useExternalDb: USE_EXTERNAL_DB as boolean,
    batcherStatus: USE_EXTERNAL_DB ? null : localRealtime.batcherStatus,
    deliveryAlert,
    messageQueue,
  };
}
