import { useRealtimeMessages } from './useRealtimeMessages';
import { useMessages } from './useMessages';
import type { LoadOlderCallback, CancelLoadOlderCallback } from '../components/chat/loadOlderTypes';

/** Fonte de dados local (Realtime via client principal self-hosted) — interface unificada de conversas/mensagens e callbacks de paginação. */
export function useInboxSource(selectedContactId: string | null) {
  // Local DB source (Evolution DB via client principal)
  const localRealtime = useRealtimeMessages();

  // Selected conversation data
  const conversations = localRealtime.conversations;
  const loading = localRealtime.loading;
  const error = localRealtime.error;
  const refetch = localRealtime.refetch;

  // F4-01: paginação por cursor — exposto para o scroll infinito da sidebar.
  // Páginas de CONTACTS_PAGE_SIZE/MESSAGES_PAGE_SIZE com cursor
  // (updated_at+id / created_at+id).
  const loadMoreConversations = localRealtime.loadMoreConversations;
  const hasMoreConversations = localRealtime.hasMoreConversations;
  const loadingMoreConversations = localRealtime.loadingMoreConversations;

  // Search and Filter controls (sempre do localRealtime para consistência da UI)
  const { search, setSearch, statusFilter, setStatusFilter, sortBy, setSortBy } = localRealtime;

  // Messages for selected contact (local DB)
  const localMsgs = useMessages({
    contactId: selectedContactId,
    enabled: Boolean(selectedContactId),
  });

  const selectedMessages = localMsgs.messages;
  const selectedMessagesLoading = localMsgs.loading;
  const refetchSelectedMessages = localMsgs.refetch;

  // Pagination for older messages — o path local não expõe loadOlder
  // (a paginação de histórico roda dentro de useMessages/components de chat).
  const loadOlderMessages: LoadOlderCallback | undefined = undefined;
  const cancelLoadOlderMessages: CancelLoadOlderCallback | undefined = undefined;

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
    loadingOlderMessages: false,
    hasMoreMessages: false,
    addExternalMessage: undefined,
    // WhatsApp instance da conversa selecionada — path local não usa instância externa.
    selectedConversationInstance: undefined,
    // Original realtime hooks for notifications etc
    localRealtime,
    // F4-01: paginação por cursor — load-more para scroll infinito
    loadMoreConversations,
    hasMoreConversations,
    loadingMoreConversations,
  };
}
