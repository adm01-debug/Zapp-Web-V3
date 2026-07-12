import { useMemo } from 'react';
import { useRealtimeMessages } from './useRealtimeMessages';
import { useExternalConversations, useExternalMessages } from '@/hooks/useExternalEvolution';
import { useMessages } from './useMessages';
import { resolveContactJid } from '@/adapters/evolutionAdapter';
import type { LoadOlderCallback, CancelLoadOlderCallback } from '@/features/inbox';

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

  // Messages for selected contact — useExternalMessages needs the bare JID (not a composite key).
  const externalMsgs = useExternalMessages(
    useExternalDb ? resolveContactJid(selectedContactId) : null
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
