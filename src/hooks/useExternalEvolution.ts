/**
 * useExternalEvolution — Hooks for reading evolution_messages from external FATOR X DB
 * Replaces the local DB reads for the Inbox when external DB is the source of truth.
 *
 * Pagination strategy (post-incremental refactor):
 * - Sidebar list: only last N days, capped at 200, with instance_name filter.
 * - Per-conversation: 100 messages by jid, with cursor-based loadOlder().
 * - Polling: cursor-forward (created_at > lastSeen) instead of full re-fetch.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryExternalProxy } from '@/lib/externalProxy';
import {
  buildExternalConversations,
  evolutionToRealtimeMessage,
  jidToPhone,
} from '@/adapters/evolutionAdapter';
import type { EvolutionMessage } from '@/types/evolutionExternal';
import type { RealtimeMessage } from '@/features/inbox';
import { getLogger } from '@/lib/logger';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import { dedupedFetch, subscribeDedupe } from '@/lib/realtime/crossTabDedupe';
import { playerStateStore } from '@/features/inbox';
import { recordMatch } from '@/features/inbox';

const log = getLogger('useExternalEvolution');

/**
 * Reconcilia uma lista existente de mensagens (`prev`) com mensagens canônicas
 * recém-chegadas (`incoming`), substituindo bolhas otimistas pela versão real
 * sem duplicar bubbles. Regras:
 *
 *  1. Toda mensagem otimista (`id` começa com `optimistic:`) cujo `external_id`
 *     bate com algum `external_id` em `incoming` é **removida** — a versão
 *     canônica toma seu lugar mantendo `id` definitivo, status oficial etc.
 *  2. Fallback texto (otimista sem `external_id`): match por sender + content
 *     + janela ±2min.
 *  3. Fallback mídia (áudio/imagem/vídeo/documento/sticker): a otimista usa
 *     placeholder (`'[Áudio]'`) e signed URL local; o canônico do webhook
 *     normalmente vem com `content: ''` e `media_url` real do WhatsApp. Match
 *     por sender + mesmo `message_type` (não-text) + janela ±2min.
 *  4. A versão canônica herda `media_url` da otimista quando ela mesma vier
 *     sem URL ainda (race: webhook chegou antes do download da mídia) — assim
 *     o player não pisca enquanto o backend resolve a mídia definitiva.
 *  5. Incomings são dedupados por `id` contra `prev` final.
 *
 * Retorna apenas as **adições** que devem ser anexadas em ordem cronológica e
 * o `prev` filtrado (sem as otimistas reconciliadas) — o caller decide a
 * ordem final (poll forward, initial replace, older prepend etc).
 */
const OPTIMISTIC_PREFIX = 'optimistic:';
const OPTIMISTIC_FALLBACK_WINDOW_MS = 120_000;
const MEDIA_TYPES = new Set(['audio', 'image', 'video', 'document', 'sticker']);

/**
 * Hierarquia oficial de status do envio. Reconciliação NUNCA regride —
 * se a otimista já foi promovida a `delivered` localmente (ACK 2-step),
 * mas o webhook canônico chega como `sent`, mantemos `delivered`.
 * Inclui também `played` (PTT ouvido) acima de `read`.
 */
const STATUS_RANK: Record<string, number> = {
  sending: 0,
  retrying: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  played: 5,
};

function rankOf(status: string | null | undefined): number {
  if (!status) return -1;
  return STATUS_RANK[status] ?? -1;
}

/** Retorna o status de maior rank entre os dois (ou o do canônico em caso de empate). */
function promoteStatus(
  optimistic: RealtimeMessage,
  canonical: RealtimeMessage
): { status: RealtimeMessage['status']; status_updated_at: string | null } {
  const optRank = rankOf(optimistic.status);
  const canRank = rankOf(canonical.status);
  if (optRank > canRank) {
    return {
      status: optimistic.status,
      // Mantém o timestamp mais recente entre os dois.
      status_updated_at: optimistic.status_updated_at ?? canonical.status_updated_at,
    };
  }
  return {
    status: canonical.status,
    status_updated_at: canonical.status_updated_at ?? optimistic.status_updated_at,
  };
}

export interface ReconcileResult {
  filteredPrev: RealtimeMessage[];
  additions: RealtimeMessage[];
  /** Map<optimisticId, canonicalId> — usado para migrar estado de player. */
  remap: Map<string, string>;
}

export function reconcileOptimistic(
  prev: RealtimeMessage[],
  incoming: RealtimeMessage[]
): ReconcileResult {
  if (incoming.length === 0) {
    return { filteredPrev: prev, additions: [], remap: new Map() };
  }

  const incomingExternalIds = new Set(
    incoming.map((m) => m.external_id).filter((v): v is string => Boolean(v))
  );

  // canonical.id -> patch (media_url herdada + status promovido)
  const canonicalPatches = new Map<string, Partial<RealtimeMessage>>();
  // optimisticId -> canonicalId (para migrar estado do player)
  const remap = new Map<string, string>();

  function ensurePatch(id: string): Partial<RealtimeMessage> {
    let p = canonicalPatches.get(id);
    if (!p) {
      p = {};
      canonicalPatches.set(id, p);
    }
    return p;
  }

  const filteredPrev = prev.filter((m) => {
    if (!m.id.startsWith(OPTIMISTIC_PREFIX)) return true;

    // Caso 1: external_id já reconciliado.
    if (m.external_id && incomingExternalIds.has(m.external_id)) {
      const can = incoming.find((c) => c.external_id === m.external_id);
      if (can) {
        remap.set(m.id, can.id);
        const patch = ensurePatch(can.id);
        const promoted = promoteStatus(m, can);
        patch.status = promoted.status;
        patch.status_updated_at = promoted.status_updated_at;
        if (!can.media_url && m.media_url) patch.media_url = m.media_url;
        if (can.reactions && can.reactions.length > 0) patch.reactions = can.reactions;

        // Telemetria enriquecida para áudio (PTT vs Gravado vs Meme)
        let messageType = m.message_type;
        if (messageType === 'audio') {
          const mExt = m as Record<string, unknown>;
          const isPtt = (mExt.media_meta as Record<string, unknown> | undefined)?.ptt === true;
          const isMeme = !!mExt.audio_meme_id;
          messageType = isMeme ? 'audio_meme' : isPtt ? 'audio_ptt' : 'audio_recorded';
        }

        recordMatch({
          strategy: 'external_id',
          messageType,
          optimisticId: m.id,
          canonicalId: can.id,
        });
      }
      return false;
    }

    if (m.external_id) return true;

    const optTime = new Date(m.created_at).getTime();
    const isMediaOpt = MEDIA_TYPES.has(m.message_type);

    // Caso 3: fallback mídia.
    if (isMediaOpt) {
      const match = incoming.find(
        (inc) =>
          inc.sender === m.sender &&
          inc.message_type === m.message_type &&
          Math.abs(new Date(inc.created_at).getTime() - optTime) <= OPTIMISTIC_FALLBACK_WINDOW_MS
      );
      if (match) {
        remap.set(m.id, match.id);
        const patch = ensurePatch(match.id);
        const promoted = promoteStatus(m, match);
        patch.status = promoted.status;
        patch.status_updated_at = promoted.status_updated_at;
        if (!match.media_url && m.media_url) patch.media_url = m.media_url;
        if (match.reactions && match.reactions.length > 0) patch.reactions = match.reactions;

        // Telemetria enriquecida para áudio fallback (PTT vs Gravado vs Meme)
        let messageType = m.message_type;
        if (messageType === 'audio') {
          const mExt = m as Record<string, unknown>;
          const isPtt = (mExt.media_meta as Record<string, unknown> | undefined)?.ptt === true;
          const isMeme = !!mExt.audio_meme_id;
          messageType = isMeme ? 'audio_meme' : isPtt ? 'audio_ptt' : 'audio_recorded';
        }

        recordMatch({
          strategy: 'media_fallback',
          messageType,
          optimisticId: m.id,
          canonicalId: match.id,
          deltaMs: Math.abs(new Date(match.created_at).getTime() - optTime),
        });
        return false;
      }
      return true;
    }

    // Caso 2: fallback texto.
    const match = incoming.find(
      (inc) =>
        inc.sender === m.sender &&
        inc.message_type === m.message_type &&
        inc.content === m.content &&
        Math.abs(new Date(inc.created_at).getTime() - optTime) <= OPTIMISTIC_FALLBACK_WINDOW_MS
    );
    if (match) {
      remap.set(m.id, match.id);
      const patch = ensurePatch(match.id);
      const promoted = promoteStatus(m, match);
      patch.status = promoted.status;
      patch.status_updated_at = promoted.status_updated_at;
      recordMatch({
        strategy: 'text_fallback',
        messageType: m.message_type,
        optimisticId: m.id,
        canonicalId: match.id,
        deltaMs: Math.abs(new Date(match.created_at).getTime() - optTime),
      });
      return false;
    }
    return true;
  });

  const seen = new Set(filteredPrev.map((m) => m.id));
  const additions: RealtimeMessage[] = [];

  for (const m of incoming) {
    if (!seen.has(m.id)) {
      const patch = canonicalPatches.get(m.id);
      additions.push(patch ? { ...m, ...patch } : m);
      seen.add(m.id); // Prevent duplicates within 'additions'
    }
  }
  return { filteredPrev, additions, remap };
}

/**
 * Aplica uma reconciliação como uma transação atômica:
 *   1. Migra o estado do player (currentTime, paused, rate) do id otimista
 *      para o canônico ANTES do React renderizar a nova bolha — assim o
 *      player remontado já encontra seu estado no id correto.
 *   2. Roda o updater de mensagens em UM único setState.
 *
 * Caller passa um `merge` que recebe `(filteredPrev, additions)` e devolve
 * a lista final ordenada — assim cada callsite mantém sua lógica de ordem
 * (initial vs poll vs older vs broadcast).
 */
export function applyReconciliation(
  setMessages: (updater: (prev: RealtimeMessage[]) => RealtimeMessage[]) => void,
  incoming: RealtimeMessage[],
  merge: (filteredPrev: RealtimeMessage[], additions: RealtimeMessage[]) => RealtimeMessage[]
): { remapSize: number } {
  let remapSize = 0;
  setMessages((prev) => {
    const result = reconcileOptimistic(prev, incoming);
    // Migra o estado do player ANTES de devolver a nova lista — o React
    // só vai re-renderizar depois desse callback retornar, então a leitura
    // subsequente em useAudioPlayer já encontra o estado no id novo.
    if (result.remap.size > 0) {
      for (const [from, to] of result.remap) {
        playerStateStore.migrate(from, to);
      }
      remapSize = result.remap.size;
    }
    if (result.additions.length === 0 && result.filteredPrev.length === prev.length) {
      return prev;
    }
    return merge(result.filteredPrev, result.additions);
  });
  return { remapSize };
}

const POLL_INTERVAL = 5000; // 5s polling
const DEFAULT_INSTANCE = DEFAULT_WHATSAPP_INSTANCE;
const SIDEBAR_DAYS_BACK = 7;
const SIDEBAR_LIMIT = 200;
const CONVERSATION_PAGE_SIZE = 100;

// Slim select — drops `payload` and `raw_data` (each can be 10KB+).
const SLIM_MESSAGE_COLUMNS = [
  'id',
  'message_id',
  'remote_jid',
  'from_me',
  'message_type',
  'content',
  'media_url',
  'media_mimetype',
  'media_type',
  'media_filename',
  'media_size',
  'caption',
  'quoted_message_id',
  'is_starred',
  'is_important',
  'category',
  'sentiment',
  'tags',
  'notes',
  'follow_up_at',
  'follow_up_done',
  'created_at',
  'contact_id',
  'conversation_id',
  'direction',
  'status',
  'status_at',
  'sent_by_bot',
  'template_name',
  'instance_name',
  'push_name',
  'deleted_at',
].join(',');

// ─── Sidebar: recent window across all conversations ──────────
async function fetchRecentMessagesWindow(
  daysBack = SIDEBAR_DAYS_BACK,
  limit = SIDEBAR_LIMIT
): Promise<EvolutionMessage[]> {
  const since = new Date(Date.now() - daysBack * 86_400_000).toISOString();
  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters: [
      { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
      { column: 'created_at', operator: 'gte', value: since },
    ],
    order: { column: 'created_at', ascending: false },
    limit,
  });
  return result.data;
}

// ─── Per-conversation: paginated by jid (with optional cursor) ──
async function fetchMessagesByJid(
  remoteJid: string,
  limit = CONVERSATION_PAGE_SIZE,
  beforeDate?: string,
  signal?: AbortSignal
): Promise<EvolutionMessage[]> {
  const filters: { column: string; operator: string; value: unknown }[] = [
    { column: 'remote_jid', operator: 'eq', value: remoteJid },
    { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
  ];
  if (beforeDate) {
    filters.push({ column: 'created_at', operator: 'lt', value: beforeDate });
  }

  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters,
    // descending so the cursor (oldest in current view) works as upper bound;
    // we reverse on the client for chronological display.
    order: { column: 'created_at', ascending: false },
    limit,
    signal,
  });
  return result.data.slice().reverse();
}

// ─── Cursor-forward poll: only messages newer than lastSeen ────
async function fetchMessagesAfter(
  remoteJid: string,
  afterDate: string,
  limit = CONVERSATION_PAGE_SIZE
): Promise<EvolutionMessage[]> {
  const result = await queryExternalProxy<EvolutionMessage>({
    table: 'evolution_messages',
    select: SLIM_MESSAGE_COLUMNS,
    filters: [
      { column: 'remote_jid', operator: 'eq', value: remoteJid },
      { column: 'instance_name', operator: 'eq', value: DEFAULT_INSTANCE },
      { column: 'created_at', operator: 'gt', value: afterDate },
    ],
    order: { column: 'created_at', ascending: true },
    limit,
  });
  return result.data;
}

// Mocks são estritamente opt-in E somente em DEV: em produção NUNCA
// substituímos conversas reais por dados de demonstração. (A lógica anterior
// `!== '0'` era opt-out: qualquer usuário sem a chave no localStorage — ou
// seja, todos — via MOCK_CONVERSATIONS no lugar do inbox real.)
const USE_MOCKS =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  window.localStorage?.getItem('mockConversations') === '1';

interface ContactEnrichmentData {
  tags?: unknown;
  company?: string;
  ai_sentiment?: string;
  name?: string;
  push_name?: string;
  avatar_url?: string;
  [key: string]: unknown;
}
// ─── Global Enrichment Cache to avoid redundant RPC calls ──────────
const contactEnrichmentCache = new Map<
  string,
  { data: ContactEnrichmentData; timestamp: number }
>();
const CACHE_TTL = 300_000; // 5 minutes

// Enrichment `tags` may arrive as a JSON array string, a plain comma-separated
// string, or malformed data. Never let a single bad value throw and take down
// the whole conversation-list query (it re-runs every 5s poll).
function safeParseTags(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// ─── Hook: External Conversations (list for sidebar) ──────────
export function useExternalConversations(enabled = true) {
  const query = useQuery({
    queryKey: [
      'external-evolution',
      'conversations',
      SIDEBAR_DAYS_BACK,
      SIDEBAR_LIMIT,
      DEFAULT_INSTANCE,
    ],
    queryFn: async () => {
      if (USE_MOCKS) {
        const { MOCK_CONVERSATIONS } =
          await import('@/features/inbox/components/conversation-list/__mocks__/mockConversations');
        return MOCK_CONVERSATIONS;
      }

      const messages = await dedupedFetch(
        `inbox:sidebar:${SIDEBAR_DAYS_BACK}:${SIDEBAR_LIMIT}:${DEFAULT_INSTANCE}`,
        () => fetchRecentMessagesWindow(),
        { lockTtl: 8_000, resultTtl: POLL_INTERVAL - 500, waitTimeout: 6_000 }
      );

      const conversations = buildExternalConversations(messages);

      // ✨ Optimized Enrichment: Fetch extra contact metadata (tags, company, ai_sentiment)
      // Limit to first 30 most recent to ensure performance, but only if not cached.
      const now = Date.now();
      const firstJids = Array.from(new Set(conversations.map((c) => c.contact.id))).slice(0, 30);

      const jidsToFetch = firstJids.filter((jid) => {
        const cached = contactEnrichmentCache.get(jid);
        if (!cached) return true;

        // Se o cache é antigo (5min), ou se a conversa tem mensagem nova desde o último cache
        const conv = conversations.find((c) => c.contact.id === jid);
        const lastMsgTime = conv?.lastMessage ? new Date(conv.lastMessage.created_at).getTime() : 0;

        return now - cached.timestamp > CACHE_TTL || lastMsgTime > cached.timestamp;
      });

      if (jidsToFetch.length > 0) {
        try {
          // Individual calls are safer as rpc_get_contacts (plural) is missing in FATOR X.
          // We limit concurrent fetches to avoid overloading the proxy.
          const enrichments = await Promise.all(
            jidsToFetch.map((jid) =>
              queryExternalProxy<ContactEnrichmentData>({
                action: 'rpc',
                rpc: 'rpc_get_contact',
                params: {
                  p_remote_jid: jid,
                  p_instance: DEFAULT_INSTANCE,
                },
              })
                .then((res) => ({ jid, res }))
                .catch(() => ({ jid, res: null }))
            )
          );

          enrichments.forEach(({ jid, res }) => {
            const item = res?.data?.[0];
            if (item) {
              contactEnrichmentCache.set(jid, {
                data: item,
                timestamp: now,
              });
            }
          });
        } catch (err) {
          log.warn('Failed to enrich contacts in sidebar', err);
        }
      }

      // Apply enrichment from cache to all conversations (not just the ones we fetched now)
      conversations.forEach((conv) => {
        const cached = contactEnrichmentCache.get(conv.contact.id);
        if (cached?.data) {
          const extra = cached.data;
          if (extra.tags)
            conv.contact.tags = Array.isArray(extra.tags)
              ? (extra.tags as string[])
              : typeof extra.tags === 'string'
                ? safeParseTags(extra.tags)
                : [];
          if (extra.company) conv.contact.company = extra.company;
          if (extra.ai_sentiment) conv.contact.ai_sentiment = extra.ai_sentiment;

          // ✨ FIX: update name if current is just phone/jid AND we found a real push_name or name
          const currentName = conv.contact.name;
          const isGeneric =
            !currentName || currentName === conv.contact.phone || currentName === conv.contact.id;

          if (isGeneric) {
            const newName = extra.name || extra.push_name;
            if (newName && newName !== 'Você') {
              conv.contact.name = newName;
              conv.contact.nickname = newName;
            }
          }
        }
      });

      return conversations;
    },
    enabled,
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL - 1000,
  });

  return {
    conversations: query.data || [],
    allConversations: query.data || [],
    loading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
    // Compatibilidade com filtros locais
    search: '',
    setSearch: () => {},
    statusFilter: 'all',
    setStatusFilter: () => {},
    sortBy: 'lastMessage',
    setSortBy: () => {},
  };
}

// ─── Hook: External Messages for a specific contact/jid ───────
export function useExternalMessages(remoteJid: string | null) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useMountedRef();
  const previousJidRef = useRef<string | null>(null);
  const lastSeenRef = useRef<string | null>(null);
  const loadOlderAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      // Abort any in-flight loadOlder on unmount
      if (loadOlderAbortRef.current) {
        loadOlderAbortRef.current.abort();
        loadOlderAbortRef.current = null;
      }
    },
    []
  );

  const cancelLoadOlder = useCallback(() => {
    if (loadOlderAbortRef.current) {
      loadOlderAbortRef.current.abort();
      loadOlderAbortRef.current = null;
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, []);

  const initialFetch = useCallback(async () => {
    if (!remoteJid || !mountedRef.current) {
      if (mountedRef.current) {
        setMessages([]);
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      setError(null);
      // Dedupe cross-aba: trocar para o mesmo contato em N abas só dispara
      // 1 fetch — as demais reaproveitam via BroadcastChannel/cache.
      const evoMessages = await dedupedFetch(
        `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`,
        () => fetchMessagesByJid(remoteJid, CONVERSATION_PAGE_SIZE),
        { lockTtl: 10_000, resultTtl: 15_000, waitTimeout: 8_000 }
      );
      if (!mountedRef.current) return;
      // Guard: if the user switched contacts while this fetch was in-flight,
      // previousJidRef.current was already updated to the new jid before the
      // new initialFetch was called. Discard stale results to prevent the
      // previous contact's messages bleeding into the current conversation.
      if (previousJidRef.current !== remoteJid) return;

      const mapped = evoMessages.map(evolutionToRealtimeMessage);

      // Replace pode chegar com canônicas que substituem otimistas pendentes.
      // Mantemos quaisquer otimistas que ainda não foram reconciliadas.
      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        // Encontra o avatar do contato atual para propagar nas mensagens
        type WithAvatar = { avatar_url?: string | null };
        const currentAvatar =
          queryClient.getQueryData<WithAvatar>(['contact', remoteJid])?.avatar_url ||
          queryClient.getQueryData<WithAvatar>(['external-evolution', 'contact', remoteJid])
            ?.avatar_url;

        // Propaga o avatar para todas as mensagens (canônicas e otimistas remanescentes)
        const additionsWithAvatar = additions.map((m) => ({ ...m, contactAvatar: currentAvatar }));
        const filteredWithAvatar = filteredPrev.map((m) =>
          m.id.startsWith(OPTIMISTIC_PREFIX) ? { ...m, contactAvatar: currentAvatar } : m
        );

        // Union: mantém todas as mensagens já em estado (canônicas carregadas via
        // scroll/load-older + otimistas pendentes) e acrescenta apenas as novas vindas
        // do servidor. Na troca de jid, setMessages([]) é chamado antes de initialFetch,
        // portanto filteredPrev será [] e o resultado é equivalente a uma substituição.
        const merged = [...filteredWithAvatar, ...additionsWithAvatar];
        return merged.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
      setHasMore(evoMessages.length === CONVERSATION_PAGE_SIZE);
      lastSeenRef.current = evoMessages.length
        ? evoMessages[evoMessages.length - 1].created_at
        : null;
    } catch (err) {
      log.error('Error fetching external messages:', err);
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [remoteJid]);

  // Cursor-forward poll (only new messages since lastSeen)
  const pollNewMessages = useCallback(async () => {
    if (!remoteJid || !mountedRef.current) return;
    const afterDate = lastSeenRef.current;
    if (!afterDate) return;

    try {
      // Dedupe: várias abas pollando o mesmo jid+cursor compartilham 1 fetch
      // (TTL curto = poll seguinte ainda dispara normalmente).
      const newOnes = await dedupedFetch(
        `inbox:poll:${remoteJid}:${afterDate}:${DEFAULT_INSTANCE}:${jidToPhone(remoteJid)}`,
        () => fetchMessagesAfter(remoteJid, afterDate),
        { lockTtl: 4_000, resultTtl: POLL_INTERVAL - 1_000, waitTimeout: 3_000 }
      );
      if (!mountedRef.current || newOnes.length === 0) return;

      const mapped = newOnes.map(evolutionToRealtimeMessage);
      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        // Encontra o avatar do contato atual para propagar nas mensagens poladas
        type WithAvatar = { avatar_url?: string | null };
        const currentAvatar =
          queryClient.getQueryData<WithAvatar>(['contact', remoteJid])?.avatar_url ||
          queryClient.getQueryData<WithAvatar>(['external-evolution', 'contact', remoteJid])
            ?.avatar_url;

        const additionsWithAvatar = additions.map((m) => ({ ...m, contactAvatar: currentAvatar }));
        return [...filteredPrev, ...additionsWithAvatar];
      });
      lastSeenRef.current = newOnes[newOnes.length - 1].created_at;
    } catch (err) {
      log.error('Error polling external messages:', err);
    }
  }, [remoteJid]);

  // Load older page (scroll up) — cancellable
  const loadOlder = useCallback(async () => {
    if (!remoteJid || !mountedRef.current || loadingOlder || !hasMore) return;
    if (messages.length === 0) return;

    const oldest = messages[0]?.created_at;
    if (!oldest) return;

    // Abort any previous in-flight loadOlder before starting a new one.
    if (loadOlderAbortRef.current) {
      loadOlderAbortRef.current.abort();
    }
    const controller = new AbortController();
    loadOlderAbortRef.current = controller;

    try {
      setLoadingOlder(true);
      // Dedupe cross-aba: mesma janela (jid + cursor) compartilhada via
      // localStorage lock + BroadcastChannel. Evita N abas chamando o mesmo
      // page de mensagens antigas em paralelo.
      const dedupeKey = `older:${remoteJid}:${oldest}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`;
      const older = await dedupedFetch(
        dedupeKey,
        () => fetchMessagesByJid(remoteJid, CONVERSATION_PAGE_SIZE, oldest, controller.signal),
        { lockTtl: 10_000, resultTtl: 30_000, waitTimeout: 8_000 }
      );
      if (!mountedRef.current || controller.signal.aborted) return;

      const mapped = older.map(evolutionToRealtimeMessage);
      if (mapped.length === 0) {
        setHasMore(false);
        return;
      }

      setMessages((prev) => {
        if (controller.signal.aborted) return prev;
        const seen = new Set(prev.map((m) => m.id));
        const additions = mapped.filter((m) => !seen.has(m.id));
        return [...additions, ...prev];
      });
      setHasMore(older.length === CONVERSATION_PAGE_SIZE);
    } catch (err) {
      // Silence aborts (user navigated away or scrolled back down)
      const name = (err as { name?: string } | null)?.name;
      if (name === 'AbortError') return;
      log.error('Error loading older messages:', err);
    } finally {
      if (loadOlderAbortRef.current === controller) {
        loadOlderAbortRef.current = null;
      }
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [remoteJid, messages, loadingOlder, hasMore]);

  // Initial fetch on jid change
  useEffect(() => {
    if (remoteJid !== previousJidRef.current) {
      previousJidRef.current = remoteJid;
      lastSeenRef.current = null;
      setHasMore(true);
      // Clear state so the union merge in initialFetch starts from a clean slate
      // for this conversation — avoids stale canonical messages from the previous
      // jid bleeding into the union when the contact changes.
      setMessages([]);
      void initialFetch();
    }
  }, [remoteJid, initialFetch]);

  // Polling for new messages (cursor-forward)
  useEffect(() => {
    if (!remoteJid) return;
    const interval = setInterval(pollNewMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [remoteJid, pollNewMessages]);

  // Cross-tab sync: quando outra aba conclui um fetch (initial/poll/older)
  // para este mesmo jid, recebemos o resultado via BroadcastChannel e
  // atualizamos a UI sem refazer a requisição.
  useEffect(() => {
    if (!remoteJid) return;
    const jidPrefixes = [
      `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`,
      `inbox:poll:${remoteJid}:`,
      `older:${remoteJid}:`,
    ];
    const matcher = new RegExp(
      `^(${jidPrefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
    );

    const unsub = subscribeDedupe<EvolutionMessage[]>(matcher, (key, data, source) => {
      if (source === 'local') return; // já tratado pelo fluxo do próprio fetcher
      if (!mountedRef.current || !Array.isArray(data) || data.length === 0) return;

      // `older` é retornado em ordem desc; demais já vêm asc.
      const isOlder = key.startsWith(`older:${remoteJid}:`);
      const ordered = isOlder ? data.slice().reverse() : data;
      const mapped = ordered.map(evolutionToRealtimeMessage);

      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        if (key.startsWith(`inbox:initial:${remoteJid}:`)) {
          // Initial completo de outra aba: se não tínhamos nada, substitui
          // pelas canônicas; caso contrário mescla preservando otimistas
          // remanescentes (ainda não reconciliadas).
          if (filteredPrev.length === 0) {
            lastSeenRef.current = mapped[mapped.length - 1]?.created_at ?? null;
            return additions;
          }
          return [...filteredPrev, ...additions].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
        if (isOlder) return [...additions, ...filteredPrev];
        // poll forward
        const next = [...filteredPrev, ...additions];
        lastSeenRef.current = additions[additions.length - 1]?.created_at ?? lastSeenRef.current;
        return next;
      });
      if (key.startsWith(`inbox:initial:${remoteJid}:`) && mountedRef.current) {
        setLoading(false);
      }
    });
    return unsub;
  }, [remoteJid]);

  const addMessage = useCallback((message: RealtimeMessage) => {
    setMessages((prev) => {
      // Dedupe por id (caso já exista) e por external_id (canônica já chegou
      // via webhook/poll antes do sender resolver — não adicionamos a otimista).
      if (prev.some((m) => m.id === message.id)) return prev;
      if (message.external_id && prev.some((m) => m.external_id === message.external_id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<RealtimeMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m)));
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    refetch: initialFetch,
    loadOlder,
    cancelLoadOlder,
    addMessage,
    updateMessage,
    removeMessage,
  };
}
