// @ts-nocheck
// Consolidated Queue Management Module (ETAPA 33)
// Consolidates: useQueues, useQueueAnalytics, useQueueGoals, useQueueSlaPanel, useQueuesComparison
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';

interface Queue {
  id: string;
  name: string;
  color?: string | null;
  description?: string;
  assigned_to?: string;
  status: 'active' | 'inactive';
  waiting_count?: number | null;
  max_wait_time_minutes?: number | null;
  created_at: string;
  updated_at: string;
}

interface QueueMember {
  id: string;
  queue_id: string;
  user_id: string;
  profile_id?: string;
  name: string;
  email: string;
  status: string;
  is_active?: boolean;
  profile?: {
    id?: string;
    name?: string | null;
    avatar_url?: string | null;
    is_active?: boolean | null;
  } | null;
}

interface QueueWithMembers extends Queue {
  members: QueueMember[];
}

interface QueueAnalytics {
  queue_id: string;
  total_messages: number;
  average_response_time: number;
  first_response_time?: number;
  resolution_rate: number;
  customer_satisfaction: number;
  timestamp: string;
}

interface QueueGoal {
  id: string;
  queue_id: string;
  metric: string;
  target_value: number;
  current_value: number;
  period: 'daily' | 'weekly' | 'monthly';
  status: 'on_track' | 'at_risk' | 'missed';
  max_waiting_contacts?: number;
  max_avg_wait_minutes?: number;
  min_assignment_rate?: number;
  max_messages_pending?: number;
  alerts_enabled?: boolean;
  updated_at: string;
}

interface QueueSLA {
  id: string;
  queue_id: string;
  response_time_minutes: number;
  resolution_time_minutes: number;
  adherence_percentage: number;
  breaches: number;
  timestamp: string;
}

interface QueueSlaRow {
  id: string;
  queue_id: string;
  skill_name: string | null;
  channel_type: string | null;
  sla_status: 'on_track' | 'at_risk' | 'breached';
  response_time: number;
  resolution_time: number;
}

interface QueueComparison {
  queue_id: string;
  queue_name: string;
  metrics: {
    messageCount: number;
    avgResponseTime: number;
    resolution: number;
    satisfaction: number;
  };
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

/** Provides queue CRUD operations and management capabilities. */
export function useQueuesCrudManagement() {
  const { user } = useAuth();
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchQueues = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('queues')
        .select('*')
        .order('name');

      if (err) throw err;
      if (mountedRef.current) setQueues(data || []);
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to fetch queues';
        setError(message);
        log.error('Error fetching queues:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchQueues();
  }, [user, fetchQueues]);

  return { queues, loading, error, refetch: fetchQueues };
}

/** Retrieves queue performance metrics and analytics. */
export function useQueueAnalyticsManagement(params: { queueId: string; dateRange: DateRange }) {
  const { user } = useAuth();
  const { queueId } = params;
  const [analytics, setAnalytics] = useState<QueueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchAnalytics = useCallback(async () => {
    if (!user || !queueId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('queue_analytics')
        .select('*')
        .eq('queue_id', queueId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current) setAnalytics(data || null);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching queue analytics:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, queueId]);

  useEffect(() => {
    if (user && queueId) fetchAnalytics();
  }, [user, queueId, fetchAnalytics]);

  return { analytics, loading, refetch: fetchAnalytics };
}

/** Manages queue goals, targets, and performance thresholds. */
export function useQueueGoalsManagement(queueId?: string) {
  const { user } = useAuth();
  const [goals, setGoals] = useState<QueueGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchGoals = useCallback(async () => {
    if (!user || !queueId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('queue_goals')
        .select('*')
        .eq('queue_id', queueId);

      if (err) throw err;
      if (mountedRef.current) setGoals(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching queue goals:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, queueId]);

  const updateGoalStatus = useCallback(
    async (goalId: string, status: 'on_track' | 'at_risk' | 'missed') => {
      try {
        const { error: err } = await supabase
          .from('queue_goals')
          .update({ status })
          .eq('id', goalId);

        if (err) throw err;
        await fetchGoals();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error updating goal status:', err);
        }
      }
    },
    [fetchGoals, mountedRef]
  );

  useEffect(() => {
    if (user && queueId) fetchGoals();
  }, [user, queueId, fetchGoals]);

  return { goals, loading, updateGoalStatus, refetch: fetchGoals };
}

/** Monitors SLA compliance across queues with filterable metrics. */
export function useQueueSlaManagement(params: { filters: { skill_name: string | null; channel_type: string | null; sla_status: 'on_track' | 'at_risk' | 'breached' | null } }) {
  const { user } = useAuth();
  const { filters } = params;
  const [slaRows, setSlaRows] = useState<QueueSlaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSla = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      let query = supabase.from('queue_sla_rows').select('*');

      if (filters.skill_name) {
        query = query.eq('skill_name', filters.skill_name);
      }
      if (filters.channel_type) {
        query = query.eq('channel_type', filters.channel_type);
      }
      if (filters.sla_status) {
        query = query.eq('sla_status', filters.sla_status);
      }

      const { data, error: err } = await query;

      if (err) throw err;
      if (mountedRef.current) setSlaRows(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching SLA data:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user, filters]);

  useEffect(() => {
    if (user) fetchSla();
  }, [user, fetchSla]);

  return { slaRows, loading, refetch: fetchSla };
}

/** Compares queue performance metrics across time periods. */
export function useQueuesComparisonManagement(params: { dateRange: DateRange }) {
  const { user } = useAuth();
  const [comparison, setComparison] = useState<QueueComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchComparison = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('queues')
        .select(`
          id,
          name,
          queue_analytics(
            total_messages,
            average_response_time,
            resolution_rate,
            customer_satisfaction
          )
        `);

      if (err) throw err;

      const formatted = (data || []).map((q: any) => ({
        queue_id: q.id,
        queue_name: q.name,
        metrics: {
          messageCount: q.queue_analytics?.[0]?.total_messages || 0,
          avgResponseTime: q.queue_analytics?.[0]?.average_response_time || 0,
          resolution: q.queue_analytics?.[0]?.resolution_rate || 0,
          satisfaction: q.queue_analytics?.[0]?.customer_satisfaction || 0,
        },
      }));

      if (mountedRef.current) setComparison(formatted);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching queue comparison:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchComparison();
  }, [user, fetchComparison]);

  return { comparison, loading, refetch: fetchComparison };
}

export type { Queue, QueueMember, QueueWithMembers, QueueAnalytics, QueueGoal, QueueSLA, QueueSlaRow, QueueComparison, DateRange };
