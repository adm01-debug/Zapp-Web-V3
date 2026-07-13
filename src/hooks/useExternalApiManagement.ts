/**
 * useExternalApiManagement
 *
 * Consolidated module for external CRM database integration.
 * Combines 9 previously separate external API hooks into one unified module.
 *
 * Sections:
 *   1. Contact 360° Data (useExternalContact360, useExternalContact360Batch)
 *   2. Contact Metadata (useExternalCargos, useExternalEmpresas)
 *   3. Evolution/Conversations (useExternalConversations, useExternalMessages)
 *   4. Catalog & Products (useExternalCatalog)
 *   5. Generic External DB (useExternalSelect, useExternalRPC, useExternalTableBrowser, useExternalMutation)
 */

// ════════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Contact 360° Data
// ════════════════════════════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { dbGet, dbRpc, getExternalSupabase } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { Contact360Data } from '@/types/contact360';
import { log } from '@/lib/logger';

function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export interface CRMBatchResult {
  company_name: string | null;
  logo_url: string | null;
  vendedor_nome: string | null;
  cliente_ativado: boolean | null;
  total_pedidos: number | null;
  valor_total_compras: number | null;
  rfm_segment: string | null;
  rfm_score: number | null;
}

export function useExternalContact360(phone: string | undefined) {
  const cleanedPhone = phone ? cleanPhone(phone) : '';

  return useQuery<Contact360Data | null>({
    queryKey: ['external-contact-360', cleanedPhone],
    queryFn: async () => {
      if (!cleanedPhone || cleanedPhone.length < 8) return null;

      const { data, error } = await dbGet(RPC.getContact360ByPhone, {
        p_phone: cleanedPhone,
      });

      if (error) {
        log.error('Error fetching external 360:', error);
        return null;
      }

      return data as Contact360Data; // ignore-audit: narrows Supabase query result to local interface
    },
    enabled: isExternalConfigured && !!cleanedPhone && cleanedPhone.length >= 8,
    staleTime: 1000 * 60 * 10, // 10 min cache
    gcTime: 1000 * 60 * 30,    // 30 min gc
    retry: 1,
  });
}

export function useExternalContact360Batch(phones: string[]) {
  // Deduplicate and clean phones
  const cleanedPhones = [...new Set(phones.map(cleanPhone).filter(p => p.length >= 8))];
  // Create a stable key from sorted phones
  const queryKey = cleanedPhones.sort().join(',');

  const query = useQuery<Map<string, CRMBatchResult>>({
    queryKey: ['external-contact-360-batch', queryKey],
    queryFn: async () => {
      if (cleanedPhones.length === 0) return new Map();

      const { data, error } = await dbRpc(RPC.getCompaniesByPhonesBatch, {
        p_phones: cleanedPhones,
      });

      if (error) {
        log.error('Batch CRM lookup error:', error);
        return new Map();
      }

      // Convert JSONB object to Map for O(1) lookups
      const map = new Map<string, CRMBatchResult>();
      if (data && typeof data === 'object') {
        for (const [phone, info] of Object.entries(data)) {
          map.set(phone, info as CRMBatchResult);
          // Also index by cleaned version (without country code)
          const clean = cleanPhone(phone);
          if (clean !== phone) map.set(clean, info as CRMBatchResult);
          // Also index with country code
          if (!phone.startsWith('55') && clean.length <= 11) {
            map.set('55' + clean, info as CRMBatchResult);
          }
        }
      }

      return map;
    },
    enabled: isExternalConfigured && cleanedPhones.length > 0,
    staleTime: 1000 * 60 * 10, // 10 min cache
    gcTime: 1000 * 60 * 30,
  });

  // Helper to lookup a single phone from the batch result
  const lookup = (phone: string): CRMBatchResult | undefined => {
    if (!query.data) return undefined;
    const clean = cleanPhone(phone);
    return query.data.get(clean) || query.data.get('55' + clean) || query.data.get(phone);
  };

  return {
    batchData: query.data || new Map<string, CRMBatchResult>(),
    lookup,
    isLoading: query.isLoading,
    isConfigured: isExternalConfigured,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════
// SECTION 2: Contact Metadata (Cargos, Empresas)
// ════════════════════════════════════════════════════════════════════════════════════

export function useExternalCargos() {
  return useQuery<string[]>({
    queryKey: ['external-cargos'],
    queryFn: async () => {
      const allCargos: string[] = [];

      // 1. Fetch from salespeople.role (accessible - no RLS blocking)
      const { data: salesRoles, error: e1 } = await getExternalSupabase()
        .from('salespeople')
        .select('role')
        .not('role', 'is', null)
        .limit(500);

      if (e1) {
        log.error('Error fetching roles from salespeople:', e1);
      } else {
        (salesRoles || []).forEach((r: Record<string, unknown>) => {
          const v = String(r.role || '').trim();
          if (v) allCargos.push(v);
        });
      }

      // 2. Extract cargos from search_contacts_advanced RPC (bypasses RLS)
      const { data: searchData, error: e2 } = await dbRpc(RPC.searchContactsAdvanced, {
        p_search: null,
        p_vendedor: null,
        p_ramo: null,
        p_rfm_segment: null,
        p_estado: null,
        p_cliente_ativado: true,
        p_ja_comprou: null,
        p_sort_by: 'name',
        p_page: 0,
        p_page_size: 200,
      });

      if (e2) {
        log.error('Error fetching cargos via RPC:', e2);
      } else {
        const results =
          ((searchData as Record<string, unknown>)?.results as Record<string, unknown>[]) || [];
        for (const r of results) {
          const v = String(r.cargo || '').trim();
          if (v) allCargos.push(v);
        }
      }

      const unique = [...new Set(allCargos)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      log.info(`[useExternalCargos] Loaded ${unique.length} unique cargos`);
      return unique;
    },
    enabled: isExternalConfigured,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}

export function useExternalEmpresas() {
  return useQuery<string[]>({
    queryKey: ['external-empresas'],
    queryFn: async () => {
      const allNames: string[] = [];
      const pageSize = 200;
      let page = 0;
      const maxPages = 10; // Safety limit: max 2000 companies

      // Use search_contacts_advanced RPC which has SECURITY DEFINER
      // Fetch multiple pages to build a comprehensive company list
      while (page < maxPages) {
        const { data, error } = await dbRpc(RPC.searchContactsAdvanced, {
          p_search: null,
          p_vendedor: null,
          p_ramo: null,
          p_rfm_segment: null,
          p_estado: null,
          p_cliente_ativado: true, // Filter to get active clients (broad set)
          p_ja_comprou: null,
          p_sort_by: 'name',
          p_page: page,
          p_page_size: pageSize,
        });

        if (error) {
          log.error('Error fetching empresas via RPC:', error);
          break;
        }

        const response = data as { results?: Array<{ company_name?: string }> } | null;
        const results = response?.results || [];

        if (results.length === 0) break;

        for (const r of results) {
          const name = String(r.company_name || '').trim();
          if (name) allNames.push(name);
        }

        // If we got fewer results than page size, we're done
        if (results.length < pageSize) break;
        page++;
      }

      const unique = [...new Set(allNames)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      log.info(`[useExternalEmpresas] Loaded ${unique.length} unique companies via RPC`);
      return unique;
    },
    enabled: isExternalConfigured,
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}

// ════════════════════════════════════════════════════════════════════════════════════
// SECTION 3: Evolution/Conversations & Messages
// ════════════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { useQueryClient } from '@tanstack/react-query';
import { evolutionToRealtimeMessage, jidToPhone } from '@/adapters/evolutionAdapter';
import type { EvolutionMessage } from '@/types/evolutionExternal';
import type { RealtimeMessage } from '@/features/inbox';
import { getLogger } from '@/lib/logger';
import { dedupedFetch, subscribeDedupe } from '@/lib/realtime/crossTabDedupe';
import {
  POLL_INTERVAL,
  DEFAULT_INSTANCE,
  SIDEBAR_DAYS_BACK,
  SIDEBAR_LIMIT,
  USE_MOCKS,
  CONVERSATION_PAGE_SIZE,
  fetchRecentMessagesWindow,
  fetchMessagesByJid,
  fetchMessagesAfter,
} from './evolutionFetchers';
import {
  contactEnrichmentCache,
  CACHE_TTL,
  safeParseTags,
  type ContactEnrichmentData,
} from './evolutionContactCache';
import { buildExternalConversations } from '@/adapters/evolutionAdapter';
import { queryExternalProxy } from '@/lib/externalProxy';
import { OPTIMISTIC_PREFIX, applyReconciliation } from './evolutionReconcile';

const logConversations = getLogger('useExternalConversations');
const logMessages = getLogger('useExternalMessages');

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

      // Enrichment: fetch contact metadata (tags, company, ai_sentiment) for top 30.
      const now = Date.now();
      const firstJids = Array.from(new Set(conversations.map((c) => c.contact.id))).slice(0, 30);

      const jidsToFetch = firstJids.filter((jid) => {
        const cached = contactEnrichmentCache.get(jid);
        if (!cached) return true;
        const conv = conversations.find((c) => c.contact.id === jid);
        const lastMsgTime = conv?.lastMessage ? new Date(conv.lastMessage.created_at).getTime() : 0;
        return now - cached.timestamp > CACHE_TTL || lastMsgTime > cached.timestamp;
      });

      if (jidsToFetch.length > 0) {
        try {
          const enrichments = await Promise.all(
            jidsToFetch.map((jid) =>
              queryExternalProxy<ContactEnrichmentData>({
                action: 'rpc',
                rpc: 'rpc_get_contact',
                params: { p_remote_jid: jid, p_instance: DEFAULT_INSTANCE },
              })
                .then((res) => ({ jid, res }))
                .catch(() => ({ jid, res: null }))
            )
          );

          enrichments.forEach(({ jid, res }) => {
            const item = res?.data?.[0];
            if (item) {
              contactEnrichmentCache.set(jid, { data: item, timestamp: now });
            }
          });
        } catch (err) {
          logConversations.warn('Failed to enrich contacts in sidebar', err);
        }
      }

      // Apply enrichment from cache to all conversations.
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
    search: '',
    setSearch: () => {},
    statusFilter: 'all',
    setStatusFilter: () => {},
    sortBy: 'lastMessage',
    setSortBy: () => {},
  };
}

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
  }, [mountedRef]);

  const getContactAvatar = useCallback(
    (jid: string) => {
      type WithAvatar = { avatar_url?: string | null };
      return (
        queryClient.getQueryData<WithAvatar>(['contact', jid])?.avatar_url ||
        queryClient.getQueryData<WithAvatar>(['external-evolution', 'contact', jid])?.avatar_url
      );
    },
    [queryClient]
  );

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
      const evoMessages = await dedupedFetch(
        `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`,
        () => fetchMessagesByJid(remoteJid, CONVERSATION_PAGE_SIZE),
        { lockTtl: 10_000, resultTtl: 15_000, waitTimeout: 8_000 }
      );
      if (!mountedRef.current) return;
      if (previousJidRef.current !== remoteJid) return;

      const mapped = evoMessages.map(evolutionToRealtimeMessage);
      const currentAvatar = getContactAvatar(remoteJid);

      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        const additionsWithAvatar = additions.map((m) => ({ ...m, contactAvatar: currentAvatar }));
        const filteredWithAvatar = filteredPrev.map((m) =>
          m.id.startsWith(OPTIMISTIC_PREFIX) ? { ...m, contactAvatar: currentAvatar } : m
        );
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
      logMessages.error('Error fetching external messages:', err);
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [remoteJid, mountedRef, getContactAvatar]);

  const pollNewMessages = useCallback(async () => {
    if (!remoteJid || !mountedRef.current) return;
    const afterDate = lastSeenRef.current;
    if (!afterDate) return;

    try {
      const newOnes = await dedupedFetch(
        `inbox:poll:${remoteJid}:${afterDate}:${DEFAULT_INSTANCE}:${jidToPhone(remoteJid)}`,
        () => fetchMessagesAfter(remoteJid, afterDate),
        { lockTtl: 4_000, resultTtl: POLL_INTERVAL - 1_000, waitTimeout: 3_000 }
      );
      if (!mountedRef.current || newOnes.length === 0) return;

      const mapped = newOnes.map(evolutionToRealtimeMessage);
      const currentAvatar = getContactAvatar(remoteJid);

      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        const additionsWithAvatar = additions.map((m) => ({ ...m, contactAvatar: currentAvatar }));
        return [...filteredPrev, ...additionsWithAvatar];
      });
      lastSeenRef.current = newOnes[newOnes.length - 1].created_at;
    } catch (err) {
      logMessages.error('Error polling external messages:', err);
    }
  }, [remoteJid, mountedRef, getContactAvatar]);

  const loadOlder = useCallback(async () => {
    if (!remoteJid || !mountedRef.current || loadingOlder || !hasMore) return;
    if (messages.length === 0) return;

    const oldest = messages[0]?.created_at;
    if (!oldest) return;

    if (loadOlderAbortRef.current) {
      loadOlderAbortRef.current.abort();
    }
    const controller = new AbortController();
    loadOlderAbortRef.current = controller;

    try {
      setLoadingOlder(true);
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
      const name = (err as { name?: string } | null)?.name;
      if (name === 'AbortError') return;
      logMessages.error('Error loading older messages:', err);
    } finally {
      if (loadOlderAbortRef.current === controller) {
        loadOlderAbortRef.current = null;
      }
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [remoteJid, messages, loadingOlder, hasMore, mountedRef]);

  // Initial fetch on jid change
  useEffect(() => {
    if (remoteJid !== previousJidRef.current) {
      previousJidRef.current = remoteJid;
      lastSeenRef.current = null;
      setHasMore(true);
      setMessages([]);
      void initialFetch();
    }
  }, [remoteJid, initialFetch]);

  // Cursor-forward polling
  useEffect(() => {
    if (!remoteJid) return;
    const interval = setInterval(pollNewMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [remoteJid, pollNewMessages]);

  // Cross-tab sync via BroadcastChannel
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
      if (source === 'local') return;
      if (!mountedRef.current || !Array.isArray(data) || data.length === 0) return;

      const isOlder = key.startsWith(`older:${remoteJid}:`);
      const ordered = isOlder ? data.slice().reverse() : data;
      const mapped = ordered.map(evolutionToRealtimeMessage);

      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        if (key.startsWith(`inbox:initial:${remoteJid}:`)) {
          if (filteredPrev.length === 0) {
            lastSeenRef.current = mapped[mapped.length - 1]?.created_at ?? null;
            return additions;
          }
          return [...filteredPrev, ...additions].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
        if (isOlder) return [...additions, ...filteredPrev];
        const next = [...filteredPrev, ...additions];
        lastSeenRef.current = additions[additions.length - 1]?.created_at ?? lastSeenRef.current;
        return next;
      });
      if (key.startsWith(`inbox:initial:${remoteJid}:`) && mountedRef.current) {
        setLoading(false);
      }
    });
    return unsub;
  }, [remoteJid, mountedRef]);

  const addMessage = useCallback((message: RealtimeMessage) => {
    setMessages((prev) => {
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

// ════════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Catalog & Products
// ════════════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/integrations/supabase/client';
import { hasField, readArray, readVariants } from '@/lib/runtimeGuards';

export interface ExternalCategory {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

export interface ExternalSupplier {
  id: string;
  name: string;
}

export interface ExternalProductVariant {
  id: string;
  product_id: string;
  sku: string;
  name: string;
  attributes: Record<string, string> | null;
  stock_quantity: number;
  color_name: string | null;
  color_hex: string | null;
  size_code: string | null;
  capacity_ml: number | null;
  selected_thumbnail: string | null;
  is_active: boolean;
}

export interface ExternalProduct {
  id: string;
  name: string;
  description: string | null;
  short_description: string | null;
  sku: string;
  sale_price: number;
  suggested_price: number | null;
  stock_quantity: number;
  primary_image_url: string | null;
  colors: string[] | null;
  brand: string | null;
  origin_country: string | null;
  min_quantity: number | null;
  dimensions_display: string | null;
  weight_g: number | null;
  combined_sizes: string | null;
  product_type: string | null;
  is_kit: boolean;
  is_active: boolean;
  is_stockout: boolean;
  allows_personalization: boolean;
  lead_time_days: number | null;
  supply_mode: string | null;
  category_id: string | null;
  supplier_id: string | null;
  slug: string | null;
  capacity_ml: number | null;
  ncm_code: string | null;
  categories: ExternalCategory | null;
  suppliers: ExternalSupplier | null;
  variants?: ExternalProductVariant[];
}

export interface CatalogFilters {
  search?: string;
  category_id?: string;
  supplier_id?: string;
  only_active?: boolean;
  only_in_stock?: boolean;
  limit?: number;
  offset?: number;
  order_by?: string;
  ascending?: boolean;
}

async function invokeAction<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('promogifts-catalog', {
    body: { action, params },
  });
  if (error) throw new Error(error.message);
  if (hasField(data, 'error') && typeof data.error === 'string') {
    throw new Error(data.error);
  }
  return data as T; // ignore-audit: narrows Supabase query result to local interface
}

export function withSafeVariants(product: ExternalProduct | null | undefined): ExternalProduct | null {
  if (!product) return null;
  return {
    ...product,
    variants: readVariants<ExternalProductVariant>(product),
  };
}

export function useExternalCatalog() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<CatalogFilters>({});
  const [ready, setReady] = useState(false);

  const logCatalog = getLogger('ExternalCatalog');

  // Products query - auto-fetches when filters change and ready=true
  const productsQuery = useQuery({
    queryKey: ['external-catalog', 'products', filters],
    queryFn: async () => {
      logCatalog.debug('Fetching products with filters:', JSON.stringify(filters));
      const result = await invokeAction<unknown>('list_products', filters as Record<string, unknown>);
      const products = readArray<ExternalProduct>(result, 'data').map((p) => ({
        ...p,
        variants: readVariants<ExternalProductVariant>(p),
      }));
      const meta = (result && typeof result === 'object' && 'meta' in result
        ? (result as { meta?: { total?: number; duration_ms?: number } }).meta
        : undefined) ?? { total: 0, duration_ms: 0 };
      logCatalog.debug('Got', products.length, 'products, total:', meta.total);
      return { data: products, meta: { total: meta.total ?? 0, duration_ms: meta.duration_ms ?? 0 } };
    },
    enabled: ready,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  // Categories
  const categoriesQuery = useQuery({
    queryKey: ['external-catalog', 'categories'],
    queryFn: async () => {
      const result = await invokeAction<unknown>('list_categories');
      return readArray<ExternalCategory>(result, 'data');
    },
    enabled: ready,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Suppliers
  const suppliersQuery = useQuery({
    queryKey: ['external-catalog', 'suppliers'],
    queryFn: async () => {
      const result = await invokeAction<unknown>('list_suppliers');
      return readArray<ExternalSupplier>(result, 'data');
    },
    enabled: ready,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // Called by component to set filters and trigger fetch
  const fetchProducts = useCallback((newFilters: CatalogFilters = {}) => {
    setFilters(newFilters);
    setReady(true);
  }, []);

  const fetchProduct = useCallback(async (productId: string): Promise<ExternalProduct | null> => {
    try {
      const result = await queryClient.fetchQuery({
        queryKey: ['external-catalog', 'product', productId],
        queryFn: async () => {
          const res = await invokeAction<unknown>('get_product', { product_id: productId });
          const product = (res && typeof res === 'object' && 'data' in res
            ? (res as { data?: ExternalProduct }).data
            : null) ?? null;
          return withSafeVariants(product);
        },
        staleTime: 5 * 60 * 1000,
      });
      return result;
    } catch (err) {
      logCatalog.error('Failed to fetch product', err);
      return null;
    }
  }, [queryClient]);

  const fetchCategories = useCallback(() => {
    setReady(true);
  }, []);

  const fetchSuppliers = useCallback(() => {
    setReady(true);
  }, []);

  return {
    products: productsQuery.data?.data || [],
    totalProducts: productsQuery.data?.meta?.total ?? 0,
    categories: categoriesQuery.data || [],
    suppliers: suppliersQuery.data || [],
    loading: productsQuery.isLoading || productsQuery.isFetching,
    error: productsQuery.error?.message || null,
    fetchProducts,
    fetchProduct,
    fetchCategories,
    fetchSuppliers,
  };
}

// ════════════════════════════════════════════════════════════════════════════════════
// SECTION 5: Generic External DB Operations
// ════════════════════════════════════════════════════════════════════════════════════

import { useMutation } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExternalDBFilter,
  ExternalDBOrder,
  ExternalDBQueryResult,
  ExternalTableName,
} from '@/types/externalDB';
import { validateEntityAccess, validateRpcAccess } from '@/integrations/datasource/sentinel';

// This hook is intentionally generic — it works with arbitrary table/rpc names
// supplied at runtime, so we use an untyped client to avoid requiring compile-time
// table name literals that SupabaseClient<Database> enforces.
const getDynamicClient = () => getExternalSupabase() as unknown as SupabaseClient; // ignore-audit — dynamic table names require untyped client; see comment above

// ─── Direct query helper ──────────────────────────────────────
async function queryExternal<T = unknown>(params: {
  table: string;
  select?: string;
  filters?: ExternalDBFilter[];
  order?: ExternalDBOrder;
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
}): Promise<ExternalDBQueryResult<T>> {
  validateEntityAccess(params.table, 'external');
  const start = performance.now();

  let query = getDynamicClient()
    .from(params.table)
    .select(params.select || '*', { count: params.countMode || undefined });

  if (params.filters) {
    for (const f of params.filters) {
      query = query.filter(f.column, f.operator, f.value as string);
    }
  }

  if (params.order) {
    query = query.order(params.order.column, { ascending: params.order.ascending ?? true });
  }

  const limit = params.limit || 50;
  const offset = params.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  const duration = Math.round(performance.now() - start);

  if (error) throw new Error(error.message);

  return {
    data: (data as T[]) || [], // ignore-audit: data from untyped external DB client requires explicit cast to generic T[]
    meta: {
      record_count: count ?? (Array.isArray(data) ? data.length : null),
      duration_ms: duration,
      severity: duration > 3000 ? 'slow' : 'ok',
    },
  };
}

// ─── Select query hook ────────────────────────────────────────
interface UseExternalSelectOptions {
  table: ExternalTableName | string;
  select?: string;
  filters?: ExternalDBFilter[];
  order?: ExternalDBOrder;
  limit?: number;
  offset?: number;
  countMode?: 'exact' | 'planned' | 'estimated';
  enabled?: boolean;
  staleTime?: number;
}

export function useExternalSelect<T = Record<string, unknown>>(options: UseExternalSelectOptions) {
  const {
    table,
    select,
    filters,
    order,
    limit = 50,
    offset = 0,
    countMode,
    enabled = true,
    staleTime = 5 * 60 * 1000,
  } = options;

  return useQuery({
    queryKey: ['external-db', table, { select, filters, order, limit, offset, countMode }],
    queryFn: () =>
      queryExternal<T>({
        table,
        select,
        filters,
        order,
        limit,
        offset,
        countMode,
      }),
    enabled: enabled && isExternalConfigured,
    staleTime,
    gcTime: staleTime * 2,
  });
}

// ─── RPC call hook ────────────────────────────────────────────
interface UseExternalRPCOptions {
  rpc: string;
  params?: Record<string, unknown>;
  enabled?: boolean;
  staleTime?: number;
}

export function useExternalRPC<T = unknown>(options: UseExternalRPCOptions) {
  return useQuery({
    queryKey: ['external-db', 'rpc', options.rpc, options.params],
    queryFn: async () => {
      validateRpcAccess(options.rpc, 'external');
      const start = performance.now();
      const { data, error } = await getDynamicClient().rpc(options.rpc, options.params || {});
      const duration = Math.round(performance.now() - start);
      if (error) throw new Error(error.message);
      return {
        data: Array.isArray(data) ? (data as T[]) : [data as T], // ignore-audit: RPC data from untyped external DB client requires explicit cast to generic T
        meta: {
          record_count: Array.isArray(data) ? data.length : 1,
          duration_ms: duration,
          severity: 'ok' as string,
        },
      };
    },
    enabled: (options.enabled ?? true) && isExternalConfigured,
    staleTime: options.staleTime ?? 10 * 60 * 1000,
  });
}

// ─── Paginated table browser ──────────────────────────────────
export function useExternalTableBrowser<T = Record<string, unknown>>(
  tableName: ExternalTableName | string
) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState<ExternalDBFilter[]>([]);
  const [order, setOrder] = useState<ExternalDBOrder | undefined>();
  const [searchTerm, setSearchTerm] = useState('');

  const query = useExternalSelect<T>({
    table: tableName,
    filters,
    order,
    limit: pageSize,
    offset: page * pageSize,
    countMode: 'estimated',
    staleTime: 2 * 60 * 1000,
  });

  const nextPage = useCallback(() => setPage((p) => p + 1), []);
  const prevPage = useCallback(() => setPage((p) => Math.max(0, p - 1)), []);
  const goToPage = useCallback((p: number) => setPage(p), []);

  const addFilter = useCallback((filter: ExternalDBFilter) => {
    setFilters((prev) => [...prev, filter]);
    setPage(0);
  }, []);

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
    setPage(0);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters([]);
    setPage(0);
  }, []);

  const setSort = useCallback((column: string, ascending = true) => {
    setOrder({ column, ascending });
    setPage(0);
  }, []);

  return {
    data: query.data?.data || [],
    totalRecords: query.data?.meta?.record_count ?? 0,
    duration: query.data?.meta?.duration_ms ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message || null,
    page,
    pageSize,
    filters,
    order,
    searchTerm,
    setSearchTerm,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(0);
    },
    nextPage,
    prevPage,
    goToPage,
    addFilter,
    removeFilter,
    clearFilters,
    setSort,
    refetch: query.refetch,
  };
}

// ─── Mutation (insert/update/delete via external client) ──────
export function useExternalMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      action: 'insert' | 'update' | 'delete';
      table: string;
      data?: Record<string, unknown> | Record<string, unknown>[];
      match?: Record<string, unknown>;
    }) => {
      validateEntityAccess(params.table, 'external');
      const dc = getDynamicClient();
      if (params.action === 'insert') {
        const { data, error } = await dc.from(params.table).insert(params.data).select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'update') {
        let q = dc.from(params.table).update(params.data);
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
      if (params.action === 'delete') {
        let q = dc.from(params.table).delete();
        if (params.match) {
          for (const [k, v] of Object.entries(params.match)) q = q.eq(k, v as string);
        }
        const { data, error } = await q.select();
        if (error) throw new Error(error.message);
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external-db', variables.table] });
    },
  });
}
