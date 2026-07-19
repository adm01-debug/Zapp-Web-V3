import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { externalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { safeClient } from '@/integrations/supabase/safeClient';
import { dbList } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { addHours, startOfTomorrow, addDays, setHours } from 'date-fns';

/* ============================================================================
   SECTION 1: useConversationActions - Pin, favorite, snooze management
   ============================================================================ */

interface FavoriteContact {
  contact_id: string;
}

/** Manages conversation pinning, archiving, and status operations. */
export function useConversationActions() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const [profileId, setProfileId] = useState<string | null>(null);
  const mountedRef = useMountedRef();

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !mountedRef.current) return;
    const { data } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle(); // ✅ fix: maybeSingle evita PGRST116
    if (data && mountedRef.current) setProfileId(data.id);
  }, []);

  const loadPinned = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('pinned_conversations')
      .select('contact_id')
      .eq('pinned_by', pid);
    if (data && mountedRef.current) setPinnedIds(new Set(data.map((p) => p.contact_id)));
  }, []);

  const loadFavorites = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !mountedRef.current) return;
    const { data } = await supabase
      .from('favorite_contacts')
      .select('contact_id')
      .eq('user_id', user.id);
    if (data && mountedRef.current)
      setFavoriteIds(new Set(data.map((f: FavoriteContact) => f.contact_id)));
  }, []);

  const loadSnoozed = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('conversation_snoozes')
      .select('contact_id')
      .eq('snoozed_by', pid)
      .gt('snooze_until', new Date().toISOString());
    if (data && mountedRef.current) setSnoozedIds(new Set(data.map((s) => s.contact_id)));
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profileId) {
      loadPinned(profileId);
      loadFavorites();
      loadSnoozed(profileId);
    }
  }, [profileId, loadPinned, loadFavorites, loadSnoozed]);

  const pinConversation = useCallback(
    async (contactId: string) => {
      if (!profileId) return;
      const { error } = await supabase
        .from('pinned_conversations')
        .insert({ contact_id: contactId, pinned_by: profileId, position: 0 });
      if (!error) {
        setPinnedIds((prev) => new Set([...prev, contactId]));
        toast.success('Conversa fixada');
      } else {
        toast.error(`Erro ao fixar conversa: ${error.message}`);
      }
    },
    [profileId]
  );

  const unpinConversation = useCallback(
    async (contactId: string) => {
      if (!profileId) return;
      const { error } = await supabase
        .from('pinned_conversations')
        .delete()
        .eq('contact_id', contactId)
        .eq('pinned_by', profileId);
      if (!error) {
        setPinnedIds((prev) => {
          const n = new Set(prev);
          n.delete(contactId);
          return n;
        });
        toast.success('Conversa desafixada');
      } else {
        toast.error(`Erro ao desafixar conversa: ${error.message}`);
      }
    },
    [profileId]
  );

  const favoriteContact = useCallback(async (contactId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('favorite_contacts')
      .insert({ contact_id: contactId, user_id: user.id });
    if (!error) {
      setFavoriteIds((prev) => new Set([...prev, contactId]));
      toast.success('Contato favoritado');
    } else {
      toast.error(`Erro ao favoritar contato: ${error.message}`);
    }
  }, []);

  const unfavoriteContact = useCallback(async (contactId: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from('favorite_contacts')
      .delete()
      .eq('contact_id', contactId)
      .eq('user_id', user.id);
    if (!error) {
      setFavoriteIds((prev) => {
        const n = new Set(prev);
        n.delete(contactId);
        return n;
      });
      toast.success('Favorito removido');
    } else {
      toast.error(`Erro ao remover favorito: ${error.message}`);
    }
  }, []);

  const snoozeConversation = useCallback(
    async (contactId: string, duration: string) => {
      if (!profileId) return;
      let snoozeUntil: Date;
      const now = new Date();
      switch (duration) {
        case '1h':
          snoozeUntil = addHours(now, 1);
          break;
        case '3h':
          snoozeUntil = addHours(now, 3);
          break;
        case 'tomorrow':
          snoozeUntil = setHours(startOfTomorrow(), 9);
          break;
        case 'nextweek': {
          const daysUntilMonday = ((1 - now.getDay() + 7) % 7) || 7;
          snoozeUntil = setHours(addDays(now, daysUntilMonday), 9);
          break;
        }
        default:
          snoozeUntil = addHours(now, 1);
      }

      const { error } = await supabase
        .from('conversation_snoozes')
        .upsert(
          {
            contact_id: contactId,
            snoozed_by: profileId,
            snooze_until: snoozeUntil.toISOString(),
          },
          { onConflict: 'contact_id,snoozed_by' }
        );
      if (!error) {
        setSnoozedIds((prev) => new Set([...prev, contactId]));
        toast.success('Conversa adiada');
      } else {
        toast.error(`Erro ao adiar conversa: ${error.message}`);
      }
    },
    [profileId]
  );

  const isPinned = useCallback((contactId: string) => pinnedIds.has(contactId), [pinnedIds]);
  const isFavorite = useCallback((contactId: string) => favoriteIds.has(contactId), [favoriteIds]);
  const isSnoozed = useCallback((contactId: string) => snoozedIds.has(contactId), [snoozedIds]);

  return {
    pinnedIds,
    favoriteIds,
    snoozedIds,
    isPinned,
    isFavorite,
    isSnoozed,
    pinConversation,
    unpinConversation,
    favoriteContact,
    unfavoriteContact,
    snoozeConversation,
    profileId,
  };
}

/* ============================================================================
   SECTION 2: useConversationAnalyses - Conversation analysis & sentiment
   ============================================================================ */

export interface ConversationAnalysis {
  id: string;
  contact_id: string;
  analyzed_by: string | null;
  summary: string;
  status: string;
  key_points: string[];
  next_steps: string[];
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'critico';
  sentiment_score: number;
  topics: string[];
  urgency: 'baixa' | 'media' | 'alta' | 'critica' | null;
  customer_satisfaction: number;
  message_count: number;
  created_at: string;
}

/** Retrieves AI-generated conversation analyses and insights. */
export function useConversationAnalyses(contactId: string | null) {
  const [analyses, setAnalyses] = useState<ConversationAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    if (!contactId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setAnalyses((data || []) as ConversationAnalysis[]);
    } catch (err) {
      log.error('Error fetching analyses:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void fetchAnalyses();
  }, [fetchAnalyses]);

  const saveAnalysis = async (
    analysis: Omit<ConversationAnalysis, 'id' | 'created_at' | 'analyzed_by'>
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let profileId = null;

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        profileId = profile?.id || null;
      }

      const { data, error } = await supabase
        .from('conversation_analyses')
        .insert({
          ...analysis,
          analyzed_by: profileId,
        })
        .select()
        .single();

      if (error) throw error;

      setAnalyses((prev) => [data as ConversationAnalysis, ...prev]);

      return data as ConversationAnalysis;
    } catch (err) {
      log.error('Error saving analysis:', err);
      throw err;
    }
  };

  const getLatestAnalysis = () => {
    return analyses[0] || null;
  };

  const getSentimentTrend = () => {
    if (analyses.length < 2) return null;

    const recent = analyses.slice(0, 5);
    const avgRecent = recent.reduce((sum, a) => sum + a.sentiment_score, 0) / recent.length;

    const older = analyses.slice(5, 10);
    if (older.length === 0) return null;

    const avgOlder = older.reduce((sum, a) => sum + a.sentiment_score, 0) / older.length;

    const diff = avgRecent - avgOlder;

    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  };

  return {
    analyses,
    loading,
    error,
    saveAnalysis,
    getLatestAnalysis,
    getSentimentTrend,
    refetch: fetchAnalyses,
  };
}

/* ============================================================================
   SECTION 3: useConversationSLATimeline - SLA milestones & attribution
   ============================================================================ */

export interface SLAAttribution {
  agentId: string | null;
  agentName: string | null;
  queueId: string | null;
  queueName: string | null;
}

export type FirstResponseAttributionSource =
  | 'assign-event'
  | 'pre-contact-assign'
  | 'insufficient-events'
  | 'not-applicable';

export interface SLATimelineData {
  firstContactAt: Date | null;
  firstResponseAt: Date | null;
  firstResponseDurationMs: number | null;
  lastMessageAt: Date | null;
  closedAt: Date | null;
  resolutionDurationMs: number | null;
  reopenedAt: Date | null;
  isAwaitingFirstResponse: boolean;
  awaitingMs: number | null;
  totalMessages: number;
  firstResponseBy: SLAAttribution | null;
  firstResponseAttributionWindow: { from: Date; to: Date } | null;
  firstResponseAttributionSource: FirstResponseAttributionSource;
  resolvedBy: SLAAttribution | null;
}

interface EvolutionMessageRow {
  created_at: string;
  direction: string | null;
  from_me: boolean | null;
}

interface ConversationEventRow {
  event_type: string;
  created_at: string;
  performed_by: string | null;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_queue_id: string | null;
  to_queue_id: string | null;
  performed_by_profile?: { id: string; name: string | null } | null;
  to_agent?: { id: string; name: string | null } | null;
  to_queue?: { id: string; name: string | null } | null;
}

const EMPTY: SLATimelineData = {
  firstContactAt: null,
  firstResponseAt: null,
  firstResponseDurationMs: null,
  lastMessageAt: null,
  closedAt: null,
  resolutionDurationMs: null,
  reopenedAt: null,
  isAwaitingFirstResponse: false,
  awaitingMs: null,
  totalMessages: 0,
  firstResponseBy: null,
  firstResponseAttributionWindow: null,
  firstResponseAttributionSource: 'not-applicable',
  resolvedBy: null,
};

/** Tracks SLA compliance and timeline events for conversations. */
export function useConversationSLATimeline(remoteJid: string | null, contactId: string | null) {
  const enabled = Boolean(remoteJid && isExternalConfigured);

  return useQuery({
    queryKey: queryKeys.sla.timelineDetailed(remoteJid ?? undefined, contactId ?? undefined),
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data as SLATimelineData | undefined;
      return data?.isAwaitingFirstResponse ? 30_000 : false;
    },
    queryFn: async (): Promise<SLATimelineData> => {
      if (!remoteJid || !externalSupabase) return EMPTY;

      const { data: msgs, error: msgErr } = await dbList(RPC.listMessagesLite, {
        p_remote_jid: remoteJid,
        p_limit: 500,
      });
      if (msgErr) throw msgErr;

      const rows = (msgs || []) as EvolutionMessageRow[];
      const sorted = [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      const firstInbound = sorted.find((m) => m.from_me === false || m.direction === 'inbound');
      const firstOutbound = sorted.find((m) => m.from_me === true || m.direction === 'outbound');
      const last = sorted[sorted.length - 1];

      const firstContactAt = firstInbound ? new Date(firstInbound.created_at) : null;
      const firstResponseAt = firstOutbound ? new Date(firstOutbound.created_at) : null;
      const lastMessageAt = last ? new Date(last.created_at) : null;

      const firstResponseDurationMs =
        firstContactAt && firstResponseAt && firstResponseAt > firstContactAt
          ? firstResponseAt.getTime() - firstContactAt.getTime()
          : null;

      const isAwaitingFirstResponse = Boolean(firstContactAt && !firstResponseAt);
      const awaitingMs =
        isAwaitingFirstResponse && firstContactAt ? Date.now() - firstContactAt.getTime() : null;

      let closedAt: Date | null = null;
      let reopenedAt: Date | null = null;
      let resolvedBy: SLAAttribution | null = null;
      let firstResponseBy: SLAAttribution | null = null;
      let firstResponseAttributionWindow: { from: Date; to: Date } | null = null;
      let firstResponseAttributionSource: FirstResponseAttributionSource = firstResponseAt
        ? 'insufficient-events'
        : 'not-applicable';

      if (contactId) {
        const { data: events } = await safeClient.from<ConversationEventRow>(
          'conversation_events',
          (q) =>
            q
              .select(
                `
            event_type, created_at, performed_by, from_agent_id, to_agent_id,
            from_queue_id, to_queue_id,
            performed_by_profile:profiles!conversation_events_performed_by_fkey(id, name),
            to_agent:profiles!conversation_events_to_agent_id_fkey(id, name),
            to_queue:queues!conversation_events_to_queue_id_fkey(id, name)
          `
              )
              .eq('contact_id', contactId)
              .in('event_type', ['close', 'reopen', 'assign'])
              .order('created_at', { ascending: false })
              .limit(50)
        );

        const eventRows = events ?? [];
        const lastClose = eventRows.find((e) => e.event_type === 'close');
        const lastReopen = eventRows.find((e) => e.event_type === 'reopen');

        if (lastClose) {
          closedAt = new Date(lastClose.created_at);
          resolvedBy = {
            agentId: lastClose.performed_by_profile?.id ?? lastClose.performed_by ?? null,
            agentName: lastClose.performed_by_profile?.name ?? null,
            queueId: lastClose.to_queue?.id ?? lastClose.to_queue_id ?? null,
            queueName: lastClose.to_queue?.name ?? null,
          };
        }
        if (lastReopen) reopenedAt = new Date(lastReopen.created_at);

        if (closedAt && reopenedAt && reopenedAt > closedAt) {
          closedAt = null;
          resolvedBy = null;
        }

        if (firstResponseAt) {
          const assignsAsc = eventRows
            .filter((e) => e.event_type === 'assign')
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          const responseTs = firstResponseAt.getTime();
          const contactTs = firstContactAt?.getTime() ?? -Infinity;

          const inWindow = assignsAsc.filter((e) => {
            const ts = new Date(e.created_at).getTime();
            return ts >= contactTs && ts <= responseTs;
          });

          if (inWindow.length > 0) {
            const firstAssign = inWindow[0];
            const lastAssign = inWindow[inWindow.length - 1];
            firstResponseBy = {
              agentId: lastAssign.to_agent?.id ?? lastAssign.to_agent_id ?? null,
              agentName: lastAssign.to_agent?.name ?? null,
              queueId: lastAssign.to_queue?.id ?? lastAssign.to_queue_id ?? null,
              queueName: lastAssign.to_queue?.name ?? null,
            };
            firstResponseAttributionWindow = {
              from: new Date(firstAssign.created_at),
              to: firstResponseAt,
            };
            firstResponseAttributionSource = 'assign-event';
          } else {
            const preContact = [...assignsAsc]
              .reverse()
              .find((e) => new Date(e.created_at).getTime() < contactTs);
            if (preContact) {
              firstResponseBy = {
                agentId: preContact.to_agent?.id ?? preContact.to_agent_id ?? null,
                agentName: preContact.to_agent?.name ?? null,
                queueId: preContact.to_queue?.id ?? preContact.to_queue_id ?? null,
                queueName: preContact.to_queue?.name ?? null,
              };
              firstResponseAttributionSource = 'pre-contact-assign';
            } else {
              firstResponseAttributionSource = 'insufficient-events';
            }
          }
        }
      }

      const resolutionDurationMs =
        firstContactAt && closedAt && closedAt > firstContactAt
          ? closedAt.getTime() - firstContactAt.getTime()
          : null;

      return {
        firstContactAt,
        firstResponseAt,
        firstResponseDurationMs,
        lastMessageAt,
        closedAt,
        resolutionDurationMs,
        reopenedAt,
        isAwaitingFirstResponse,
        awaitingMs,
        totalMessages: sorted.length,
        firstResponseBy,
        firstResponseAttributionWindow,
        firstResponseAttributionSource,
        resolvedBy,
      };
    },
  });
}