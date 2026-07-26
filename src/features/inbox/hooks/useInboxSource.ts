import { useMemo } from 'react';
import { useRealtimeMessages } from './useRealtimeMessages';
import { useExternalConversations, useExternalMessages } from '@/hooks/useExternalApiManagement';
import { useMessages } from './useMessages';
import type { LoadOlderCallback, CancelLoadOlderCallback } from '../components/chat/loadOlderTypes';

/** Multiplexes between the local Realtime data source and the external FATOR-X evolution DB, returning a unified conversation/message interface and pagination callbacks. */
export function useInboxSource(useExternalDb: boolean, selectedContactId: string | null) {
  // Local DB source
  const localRealtime = useRealtimeMessages();
  // External DB source (FATOR X)
  const externalData = useExternalConversations(useExternalDb);

  // Selected conversation data
  const conversations = useExternalDb ? externalData.conversations : localRealtime.conversations;
  const loading = useExternalDb ? externalData.loading : localRealtime.loading;
  const error = useExternalDb ? externalData.error : localRealtime.error;
  const refetch = useExternalDb
    ? () => {
        externalData.refetch();
      }
    : localRealtime.refetch;

  // Search and Filter controls (always from localRealtime for UI consistency)
  const { search, setSearch, statusFilter, setStatusFilter, sortBy, setSortBy } = localRealtime;

  // Deriva a instancia WhatsApp da conversa selecionada.
  // Isso garante que ao adicionar uma segunda instancia (ex.: wpp3), o hook de
  // mensagens busque na particao correta em vez de filtrar sempre por DEFAULT_INSTANCE.
  const selectedConversationInstance = useMemo(() => {
    if (!useExternalDb || !selectedContactId) return undefined;
    const found = conversations.find(
      (c) =>
        c.contact.id === selectedContactId ||
        (c.contact.remote_jid != null && c.contact.remote_jid === selectedContactId)
    );
    return found?.contact.instance_name ?? undefined;
  }, [useExternalDb, selectedContactId, conversations]);

  // Messages for selected contact
  const externalMsgs = useExternalMessages(
    useExternalDb ? selectedContactId : null,
    selectedConversationInstance
  );
  const localMsgs = useMessages({
    contactId: useExternalDb ? null : selectedContactId,
    enabled: !useExternalDb && Boolean(selectedContactId),
  });

  const selectedMessages = useExternalDb ? externalMsgs.messages : localMsgs.messages;
  const selectedMessagesLoading = useExternalDb ? externalMsgs.loading : localMsgs.loading;
  const refetchSelectedMessages = useExternalDb ? externalMsgs.refetch : localMsgs.refetch;

  // Pagination for older messages
  const loadOlderMessages = useMemo<LoadOlderCallback | undefined>(
    () =>
      useExternalDb
        ? () => {
            void externalMsgs.loadOlder();
          }
        : undefined,
    [useExternalDb, externalMsgs]
  );

  const cancelLoadOlderMessages = useMemo<CancelLoadOlderCallback | undefined>(
    () =>
      useExternalDb
        ? () => {
            externalMsgs.cancelLoadOlder();
          }
        : undefined,
    [useExternalDb, externalMsgs]
  );

  return {
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
    loadingOlderMessages: useExternalDb ? externalMsgs.loadingOlder : false,
    hasMoreMessages: useExternalDb ? externalMsgs.hasMore : false,
    addExternalMessage: useExternalDb ? externalMsgs.addMessage : undefined,
    // Original realtime hooks for notifications etc
    localRealtime,
  };
}
