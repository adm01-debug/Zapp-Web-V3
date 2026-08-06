import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { MODULE_TTL_MS } from '@/lib/queryStaleTimes';

interface QueueMemberProfile {
  id: string;
  name: string;
  avatar_url: string | null;
  is_active: boolean;
}

interface QueueMember {
  id: string;
  queue_id: string;
  profile_id: string;
  is_active: boolean;
  created_at: string;
  profile?: QueueMemberProfile | null;
}

interface Queue {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  max_wait_time_minutes: number;
  priority: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface QueueWithMembers extends Queue {
  members: QueueMember[];
  waiting_count: number;
}

interface CreateQueueInput {
  name: string;
  description?: string | null;
  color?: string;
}

interface UseQueuesResult {
  loading: boolean;
  mutating: boolean;
  error: Error | null;
  queues: QueueWithMembers[];
  refetch: () => void;
  createQueue: (queue: CreateQueueInput) => Promise<boolean>;
  deleteQueue: (queueId: string) => Promise<boolean>;
  addMember: (queueId: string, profileId: string) => Promise<boolean>;
  removeMember: (queueId: string, profileId: string) => Promise<boolean>;
}

/** Re-exported module members. */
export type { Queue, QueueMember, QueueWithMembers, CreateQueueInput, UseQueuesResult };

// ── Cache module-level (TTL 5min) ─────────────────────────────────────────
// queues/queue_members são catálogo quase-estático (mudam via admin ou
// mutações locais, que forçam refresh). O cache evita o refetch completo a
// cada mount/foco — queue_positions (contagem de espera) NUNCA é cacheado,
// continua sendo buscada fresca + via realtime.
const CATALOG_TTL_MS = MODULE_TTL_MS.catalog;
type QueuesCatalog = { queues: Queue[]; members: QueueMember[]; fetchedAt: number };
let catalogCache: QueuesCatalog | null = null;

function getCachedCatalog(): QueuesCatalog | null {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS) return catalogCache;
  return null;
}

/** Fetches queues with members and positions, subscribing to realtime changes on queues, queue_members, and queue_positions tables for live updates. */
export function useQueues(): UseQueuesResult {
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [queues, setQueues] = useState<QueueWithMembers[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const channelName = useRef(`queues-realtime:${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;

    async function fetchQueues(force = false) {
      const cached = !force ? getCachedCatalog() : null;

      if (!cached) setLoading(true);
      setError(null);
      try {
        let queueList: Queue[];
        let memberList: QueueMember[];

        if (cached) {
          queueList = cached.queues;
          memberList = cached.members;
        } else {
          const [queuesRes, membersRes] = await Promise.all([
            supabase.from('queues').select('*').order('priority'),
            supabase
              .from('queue_members')
              .select('*, profile:profiles(id, name, avatar_url, is_active)'),
          ]);

          if (queuesRes.error) throw queuesRes.error;
          if (membersRes.error) throw membersRes.error;

          queueList = (queuesRes.data || []).map((q) => ({
            id: q.id,
            name: q.name,
            color: q.color ?? 'bg-primary',
            is_active: q.is_active ?? true,
            max_wait_time_minutes: q.max_wait_time_minutes ?? 0,
            priority: q.priority ?? 0,
            description: q.description ?? null,
            created_at: q.created_at,
            updated_at: q.updated_at,
          }));
          memberList = (membersRes.data || []).map((m) => ({
            id: m.id,
            queue_id: m.queue_id,
            profile_id: m.profile_id,
            is_active: m.is_active ?? true,
            created_at: m.created_at,
            profile: m.profile
              ? {
                  id: m.profile.id,
                  name: m.profile.name,
                  avatar_url: m.profile.avatar_url,
                  is_active: m.profile.is_active ?? true,
                }
              : null,
          }));
          catalogCache = { queues: queueList, members: memberList, fetchedAt: Date.now() };
        }

        // queue_positions (espera) é dinâmico — sempre busca fresca.
        const positionsRes = await supabase.from('queue_positions').select('queue_id');
        if (positionsRes.error) throw positionsRes.error;

        if (!cancelled) {
          const positionList: Array<{ queue_id: string }> = positionsRes.data || [];

          const waitingByQueue: Record<string, number> = {};
          positionList.forEach((p) => {
            waitingByQueue[p.queue_id] = (waitingByQueue[p.queue_id] || 0) + 1;
          });

          const result: QueueWithMembers[] = queueList.map((q) => ({
            ...q,
            members: memberList.filter((m) => m.queue_id === q.id),
            waiting_count: waitingByQueue[q.id] || 0,
          }));

          setQueues(result);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchQueues();

    const channel = supabase
      .channel(channelName.current)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queues' }, () =>
        fetchQueues(true)
      )
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_members' }, () =>
        fetchQueues(true)
      )
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_positions' }, () =>
        fetchQueues()
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [refreshKey]);

  const refetch = useCallback(() => {
    catalogCache = null; // mutações locais forçam busca fresca
    setRefreshKey((k) => k + 1);
  }, []);

  /**
   * Executes a mutation, keeping error/mutating state consistent and never
   * leaking an unhandled rejection to the caller (UI components only need
   * the boolean success flag).
   */
  const runMutation = useCallback(
    async (label: string, fn: () => PromiseLike<{ error: unknown }>): Promise<boolean> => {
      setMutating(true);
      try {
        const { error: err } = await fn();
        if (err) throw err instanceof Error ? err : new Error(String(err));
        setError(null);
        refetch();
        return true;
      } catch (err) {
        const normalized = err instanceof Error ? err : new Error(String(err));
        logger.error(`useQueues.${label} failed`, normalized);
        setError(normalized);
        return false;
      } finally {
        setMutating(false);
      }
    },
    [refetch]
  );

  const createQueue = useCallback(
    (queue: CreateQueueInput) =>
      runMutation('createQueue', () =>
        supabase.from('queues').insert({
          name: queue.name,
          description: queue.description ?? null,
          color: queue.color ?? 'bg-primary',
        })
      ),
    [runMutation]
  );

  const deleteQueue = useCallback(
    (queueId: string) =>
      runMutation('deleteQueue', () => supabase.from('queues').delete().eq('id', queueId)),
    [runMutation]
  );

  const addMember = useCallback(
    (queueId: string, profileId: string) =>
      runMutation('addMember', () =>
        supabase
          .from('queue_members')
          .insert({ queue_id: queueId, profile_id: profileId, is_active: true })
      ),
    [runMutation]
  );

  const removeMember = useCallback(
    (queueId: string, profileId: string) =>
      runMutation('removeMember', () =>
        supabase.from('queue_members').delete().eq('queue_id', queueId).eq('profile_id', profileId)
      ),
    [runMutation]
  );

  return {
    loading,
    mutating,
    error,
    queues,
    refetch,
    createQueue,
    deleteQueue,
    addMember,
    removeMember,
  };
}
