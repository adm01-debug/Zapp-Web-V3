import { useQuery } from '@tanstack/react-query';
import { queryExternalProxy } from '@/lib/externalProxy';
import { buildExternalConversations } from '@/adapters/evolutionAdapter';
import { getLogger } from '@/lib/logger';
import { dedupedFetch } from '@/lib/realtime/crossTabDedupe';
import {
  POLL_INTERVAL,
  DEFAULT_INSTANCE,
  SIDEBAR_DAYS_BACK,
  SIDEBAR_LIMIT,
  USE_MOCKS,
  fetchRecentMessagesWindow,
} from './evolutionFetchers';
import {
  contactEnrichmentCache,
  CACHE_TTL,
  safeParseTags,
  type ContactEnrichmentData,
} from './evolutionContactCache';

const log = getLogger('useExternalConversations');

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
          log.warn('Failed to enrich contacts in sidebar', err);
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
