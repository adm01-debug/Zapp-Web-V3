import { useMemo, useEffect, useState } from 'react';
import { useRealtimeMessages } from './useRealtimeMessages';
import { useMessages } from './useMessages';
import { useMessagesCursor } from './useMessagesCursor';
import { resolveContactRef } from '../utils/contactRef';
import { extractMessageType } from '@/adapters/evolution/messageTypes';
import { recordSourceFallback } from './realtime/reconciliationTelemetry';
import {
  INBOX_SOURCE_PAGE_SIZE,
  INBOX_SOURCE_MODE_ENV,
  resolveInboxSourceMode,
  selectInboxSourcePaths,
  type InboxSourceMode,
} from './inboxSourceConfig';
import type { LoadOlderCallback, CancelLoadOlderCallback } from '../components/chat/loadOlderTypes';
import type { Message, MessageReaction } from '@/types/chat';
import type { EvolutionMessageLite } from '@/types/evolutionExternal';

/**
 * E36 — Dual-path zapp×evo do inbox: seleção de fonte POR CONFIGURAÇÃO.
 *
 * Paths (ver docs/adr/dual-path-inbox.md):
 *   - 'evo'  — cursor-based: useMessagesCursor → rpc_list_messages_lite
 *              (PAGE_SIZE=50), realtime em zapp.realtime_message_fanout.
 *   - 'zapp' — legado: useMessages → zapp.messages (sem cursor).
 *   - 'auto' (default) — evo quando disponível; se o path evo FALHAR, cai
 *     para o legado e grava telemetria `source_fallback` (evento
 *     `source_switch` em reconciliationTelemetry).
 *
 * A interface de retorno é ÚNICA para os dois paths — os consumidores
 * (useRealtimeInbox) não mudam. Callbacks de paginação older vêm do cursor
 * apenas em modo evo; em modo legado seguem undefined/false (contrato de
 * loadOlderTypes).
 */

/** Path ativo da fonte de mensagens (observabilidade). */
export type InboxSourcePath = 'evo' | 'zapp';

const EVO_STATUS_MAP: Record<string, Message['status']> = {
  sent: 'sent',
  delivered: 'delivered',
  received: 'delivered',
  read: 'read',
  played: 'played',
  failed: 'failed',
  error: 'failed',
  sending: 'sending',
};

const INTERNAL_TO_MESSAGE_TYPE: Record<string, Message['type']> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  sticker: 'sticker',
  location: 'location',
  interactive: 'interactive',
  unsupported: 'text',
};

/**
 * Mapeia uma EvolutionMessageLite (path evo cursor-based) para o shape
 * `Message` do path legado — preservando a interface unificada do hook.
 */
export function mapEvolutionLiteToChatMessage(
  m: EvolutionMessageLite,
  conversationId: string
): Message {
  const msgType = extractMessageType(m.message_type);
  const rawContent = m.content ?? m.caption ?? '';
  const content =
    rawContent || (msgType.category !== 'text' ? `[${msgType.label}]` : '');
  const reactions: MessageReaction[] | undefined = Array.isArray(m.reactions)
    ? m.reactions.map((r) => ({
        emoji: r.text ?? '',
        userId: r.key?.remoteJid ?? '',
        timestamp: new Date(m.created_at),
      }))
    : undefined;

  return {
    id: m.id,
    conversationId,
    content,
    type: INTERNAL_TO_MESSAGE_TYPE[msgType.internalType] ?? 'text',
    mediaUrl: m.media_url ?? undefined,
    sender: m.from_me ? 'agent' : 'contact',
    timestamp: new Date(m.created_at),
    status: EVO_STATUS_MAP[m.status] ?? 'sent',
    external_id: m.message_id ?? undefined,
    message_type: msgType.internalType,
    created_at: m.created_at,
    updated_at: m.status_at ?? m.created_at,
    is_read: m.status === 'read',
    is_deleted: m.deleted_at != null,
    deleted_at: m.deleted_at ?? null,
    reactions,
  };
}

/** Interface unificada de conversas/mensagens + callbacks de paginação (contrato E36/36.9). */
export interface UseInboxSourceReturn {
  conversations: ReturnType<typeof useRealtimeMessages>['conversations'];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: ReturnType<typeof useRealtimeMessages>['statusFilter'];
  setStatusFilter: ReturnType<typeof useRealtimeMessages>['setStatusFilter'];
  sortBy: ReturnType<typeof useRealtimeMessages>['sortBy'];
  setSortBy: ReturnType<typeof useRealtimeMessages>['setSortBy'];
  selectedMessages: Message[];
  selectedMessagesLoading: boolean;
  refetchSelectedMessages: () => Promise<void>;
  loadOlderMessages: LoadOlderCallback | undefined;
  cancelLoadOlderMessages: CancelLoadOlderCallback | undefined;
  loadingOlderMessages: boolean;
  hasMoreMessages: boolean;
  addExternalMessage: undefined;
  selectedConversationInstance: undefined;
  localRealtime: ReturnType<typeof useRealtimeMessages>;
  loadMoreConversations: () => Promise<void>;
  hasMoreConversations: boolean;
  loadingMoreConversations: boolean;
  /** Path ativo da fonte de mensagens (observabilidade E36). */
  sourcePath: InboxSourcePath;
}

/** Fonte de dados local — interface unificada de conversas/mensagens e callbacks de paginação, com seleção de fonte dual-path (E36). */
export function useInboxSource(selectedContactId: string | null): UseInboxSourceReturn {
  // Local DB source (Evolution DB via client principal)
  const localRealtime = useRealtimeMessages();

  // Selected conversation data
  const conversations = localRealtime.conversations;
  const loading = localRealtime.loading;
  const error = localRealtime.error;
  const refetch = localRealtime.refetch;

  // F4-01: paginação por cursor — exposto para o scroll infinito da sidebar.
  const loadMoreConversations = localRealtime.loadMoreConversations;
  const hasMoreConversations = localRealtime.hasMoreConversations;
  const loadingMoreConversations = localRealtime.loadingMoreConversations;

  // Search and Filter controls (sempre do localRealtime para consistência da UI)
  const { search, setSearch, statusFilter, setStatusFilter, sortBy, setSortBy } = localRealtime;

  // ── E36: seleção de fonte por configuração ───────────────────────────────
  const mode: InboxSourceMode = resolveInboxSourceMode(
    import.meta.env[INBOX_SOURCE_MODE_ENV] as string | undefined
  );
  // Fallback automático (modo 'auto'): evo falhou → legado, 1 única vez.
  const [fallbackEngaged, setFallbackEngaged] = useState(false);
  const evoAvailable = mode === 'evo' || (mode === 'auto' && !fallbackEngaged);
  const { useEvo, useLegacy } = selectInboxSourcePaths(mode, evoAvailable);
  const sourcePath: InboxSourcePath = useEvo ? 'evo' : 'zapp';

  // remoteJid do path evo: JID direto, ou UUID resolvido via conversas.
  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (c) => c.contact.id === selectedContactId || c.contact.remote_jid === selectedContactId
      ) || null,
    [conversations, selectedContactId]
  );
  const remoteJid = useMemo(() => {
    const ref = resolveContactRef(selectedContactId);
    if (!ref) return null;
    if (ref.kind === 'jid') return ref.remoteJid;
    return selectedConversation?.contact.remote_jid ?? null;
  }, [selectedContactId, selectedConversation]);

  // Messages for selected contact — BOTH paths mounted (rules of hooks),
  // gated via `enabled`: exatamente um path fica ativo por vez.
  const cursor = useMessagesCursor({
    remoteJid,
    instanceName: selectedConversation?.contact.instance_name ?? undefined,
    pageSize: INBOX_SOURCE_PAGE_SIZE,
    enabled: useEvo && Boolean(remoteJid),
  });
  const legacy = useMessages({
    contactId: selectedContactId,
    enabled: useLegacy,
  });

  // Fallback automático: auto + erro do path evo → legado + telemetria.
  useEffect(() => {
    if (mode !== 'auto' || fallbackEngaged) return;
    if (cursor.error) {
      setFallbackEngaged(true);
      recordSourceFallback(cursor.error);
    }
  }, [mode, fallbackEngaged, cursor.error]);

  const selectedMessages = useMemo(() => {
    if (!useEvo) return legacy.messages;
    return cursor.messages.map((m) =>
      mapEvolutionLiteToChatMessage(m, selectedContactId ?? m.remote_jid)
    );
  }, [useEvo, cursor.messages, legacy.messages, selectedContactId]);

  const selectedMessagesLoading = useEvo ? cursor.loading : legacy.loading;
  const refetchSelectedMessages = useEvo ? cursor.refetch : legacy.refetch;

  // Paginação older: path evo expõe o cursor; path legado não tem (contrato
  // loadOlderTypes: undefined/false desliga a maquinaria de scroll).
  const loadOlderMessages: LoadOlderCallback | undefined = useEvo
    ? cursor.loadOlder
    : undefined;
  const cancelLoadOlderMessages: CancelLoadOlderCallback | undefined = useEvo
    ? cursor.cancelLoadOlder
    : undefined;
  const loadingOlderMessages = useEvo ? cursor.loadingOlder : false;
  const hasMoreMessages = useEvo ? cursor.hasMoreOlder : false;

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
    loadingOlderMessages,
    hasMoreMessages,
    addExternalMessage: undefined,
    // WhatsApp instance da conversa selecionada — path local não usa instância externa.
    selectedConversationInstance: undefined,
    // Original realtime hooks for notifications etc
    localRealtime,
    // F4-01: paginação por cursor — load-more para scroll infinito
    loadMoreConversations,
    hasMoreConversations,
    loadingMoreConversations,
    // E36: observabilidade do path ativo
    sourcePath,
  };
}
