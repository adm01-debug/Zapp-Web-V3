import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

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

/** Re-exported module members. */
export type { Queue, QueueMember, QueueWithMembers };

/** Fetches queues with members and positions, subscribing to realtime changes on queues, queue_members, and queue_positions tables for live updates. */
export function useQueues() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [queues, setQueues] = useState<QueueWithMembers[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const channelName = useRef(`queues-realtime:${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let cancelled = false;

    async function fetchQueues() {
      setLoading(true);
      setError(null);
      try {
        const [queuesRes, membersRes, positionsRes] = await Promise.all([
          supabase.from('queues').select('*').order('priority'),
          supabase
            .from('queue_members')
            .select('*, profile:profiles(id, name, avatar_url, is_active)'),
          supabase.from('queue_positions').select('queue_id'),
        ]);

        if (queuesRes.error) throw queuesRes.error;
        if (membersRes.error) throw membersRes.error;
        if (positionsRes.error) throw positionsRes.error;

        if (!cancelled) {
          const queueList: Queue[] = queuesRes.data || [];
          const memberList: QueueMember[] = membersRes.data || [];
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
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queues' }, fetchQueues)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_members' }, fetchQueues)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_positions' }, fetchQueues)
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [refreshKey]);

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const createQueue = useCallback(
    async (queue: { name: string; description?: string; color?: string }) => {
      const { error: err } = await supabase.from('queues').insert({
        name: queue.name,
        description: queue.description ?? null,
        color: queue.color ?? '#3B82F6',
      });
      if (err) throw err;
      refetch();
    },
    [refetch]
  );

  const deleteQueue = useCallback(
    async (queueId: string) => {
      const { error: err } = await supabase.from('queues').delete().eq('id', queueId);
      if (err) throw err;
      refetch();
    },
    [refetch]
  );

  const addMember = useCallback(
    async (queueId: string, profileId: string) => {
      const { error: err } = await supabase
        .from('queue_members')
        .insert({ queue_id: queueId, profile_id: profileId, is_active: true });
      if (err) throw err;
      refetch();
    },
    [refetch]
  );

  const removeMember = useCallback(
    async (queueId: string, profileId: string) => {
      const { error: err } = await supabase
        .from('queue_members')
        .delete()
        .eq('queue_id', queueId)
        .eq('profile_id', profileId);
      if (err) throw err;
      refetch();
    },
    [refetch]
  );

  return { loading, error, queues, refetch, createQueue, deleteQueue, addMember, removeMember };
}
