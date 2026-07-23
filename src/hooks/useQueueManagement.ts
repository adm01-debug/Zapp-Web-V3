// Consolidated Queue Management Module (ETAPA 33)
// Consolidates: useQueues, useQueueAnalytics, useQueueGoals, useQueueSlaPanel, useQueuesComparison
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { queryKeys } from '@/services/api/queryKeys';
import { log } from '@/lib/logger';

type DynamicRpcClient = {
  rpc: (
    functionName: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
};

const rpcClient = supabase as unknown as DynamicRpcClient;

interface Queue {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  assigned_to?: string | null;
  status: 'active' | 'paused' | 'archived' | 'inactive';
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

type SlaStatusFilter = 'on_track' | 'at_risk' | 'breached';
type QueueSlaPriority = 'low' | 'medium' | 'high' | 'critical';
type QueueSlaPatch = Partial<
  Pick<QueueSlaRow, 'sla_priority' | 'routing_weight' | 'auto_rebalance_enabled'>
>;

interface QueueSlaFilters {
  skill_name: string | null;
  channel_type: string | null;
  sla_status: SlaStatusFilter | null;
}

interface QueueSlaRow {
  queue_id: string;
  queue_name: string;
  color: string;
  sla_priority: QueueSlaPriority;
  routing_weight: number;
  auto_rebalance_enabled: boolean;
  max_wait_time_minutes: number;
  active_agents: number;
  waiting_count: number;
  in_progress_count: number;
  breached_count: number;
  at_risk_count: number;
  oldest_wait_minutes: number;
  last_routed_at: string | null;
  skill_name: string | null;
  channel_type: string | null;
  sla_status: SlaStatusFilter;
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

function isQueueSlaPriority(value: unknown): value is QueueSlaPriority {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isSlaStatusFilter(value: unknown): value is SlaStatusFilter {
  return value === 'on_track' || value === 'at_risk' || value === 'breached';
}

function normalizeQueueSlaRow(row: Record<string, unknown>): QueueSlaRow {
  return {
    queue_id: String(row.queue_id ?? ''),
    queue_name: String(row.queue_name ?? 'Fila sem nome'),
    color: typeof row.color === 'string' && row.color ? row.color : 'hsl(var(--primary))',
    sla_priority: isQueueSlaPriority(row.sla_priority) ? row.sla_priority : 'medium',
    routing_weight: Number(row.routing_weight ?? 1),
    auto_rebalance_enabled: row.auto_rebalance_enabled !== false,
    max_wait_time_minutes: Number(row.max_wait_time_minutes ?? 0),
    active_agents: Number(row.active_agents ?? 0),
    waiting_count: Number(row.waiting_count ?? 0),
    in_progress_count: Number(row.in_progress_count ?? 0),
    breached_count: Number(row.breached_count ?? 0),
    at_risk_count: Number(row.at_risk_count ?? 0),
    oldest_wait_minutes: Number(row.oldest_wait_minutes ?? 0),
    last_routed_at: typeof row.last_routed_at === 'string' ? row.last_routed_at : null,
    skill_name: typeof row.skill_name === 'string' ? row.skill_name : null,
    channel_type: typeof row.channel_type === 'string' ? row.channel_type : null,
    sla_status: isSlaStatusFilter(row.sla_status) ? row.sla_status : 'on_track',
    response_time: Number(row.response_time ?? 0),
    resolution_time: Number(row.resolution_time ?? 0),
  };
}

/** Provides queue CRUD operations and management capabilities. */
export function useQueuesCrudManagement() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['queues-crud', user?.id] as const;

  const { data: queues = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error: err } = await safeFrom('queues').select('*').order('name');
      if (err) throw err;
      return (data ?? []) as Queue[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const error = queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null;

  return {
    queues,
    loading,
    error,
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** Retrieves queue performance metrics and analytics. */
export function useQueueAnalyticsManagement(params: { queueId: string; dateRange: DateRange }) {
  const { user } = useAuth();
  const { queueId, dateRange } = params;
  const startIso = dateRange.startDate.toISOString();
  const endIso = dateRange.endDate.toISOString();
  const queryClient = useQueryClient();
  const key = ['queue-analytics', queueId, startIso, endIso, user?.id] as const;

  const { data: analytics = null, isLoading: loading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error: err } = await safeFrom('queue_analytics')
        .select('*')
        .eq('queue_id', queueId)
        .gte('timestamp', startIso)
        .lte('timestamp', endIso)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (err && err.code !== 'PGRST116') throw err;
      return (data as QueueAnalytics | null) ?? null;
    },
    enabled: !!user && !!queueId,
    staleTime: 30_000,
  });

  return {
    analytics,
    loading,
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** Manages queue goals, targets, and performance thresholds. */
export function useQueueGoalsManagement(queueId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['queue-goals', queueId ?? null, user?.id] as const;

  const { data: goals = [], isLoading: loading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      let query = safeFrom('queue_goals').select('*');
      if (queueId) query = query.eq('queue_id', queueId);
      const { data, error: err } = await query;
      if (err) throw err;
      return (data ?? []) as QueueGoal[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const updateGoalStatus = useCallback(
    async (goalId: string, status: 'on_track' | 'at_risk' | 'missed') => {
      try {
        const { error: err } = await safeFrom('queue_goals').update({ status }).eq('id', goalId);
        if (err) throw err;
        await queryClient.invalidateQueries({ queryKey: key });
      } catch (err) {
        log.error('Error updating goal status:', err);
      }
    },
    [queryClient, key]
  );

  return {
    goals,
    loading,
    updateGoalStatus,
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** Monitors SLA compliance across queues with filterable metrics. */
export function useQueueSlaManagement(params: { filters: QueueSlaFilters }) {
  const { user } = useAuth();
  const { filters } = params;
  const queryClient = useQueryClient();
  const key = ['queue-sla', filters.skill_name, filters.channel_type, filters.sla_status, user?.id] as const;

  const { data: slaRows = [], isLoading: loading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error: err } = await rpcClient.rpc('rpc_queue_sla_panel', {
        p_skill_name: filters.skill_name,
        p_channel_type: filters.channel_type,
        p_sla_status: filters.sla_status,
      });
      if (err) throw err;
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeQueueSlaRow);
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const updateQueueConfig = useCallback(
    async (queueId: string, patch: QueueSlaPatch): Promise<boolean> => {
      try {
        const { error: err } = await safeFrom('queues').update(patch).eq('id', queueId);
        if (err) throw err;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: key }),
          queryClient.invalidateQueries({ queryKey: queryKeys.queues.all() }),
        ]);
        return true;
      } catch (err) {
        log.error('Error updating queue SLA config:', err);
        return false;
      }
    },
    [queryClient, key]
  );

  const triggerRebalance = useCallback(
    async (limit = 50): Promise<boolean> => {
      try {
        const { error: err } = await rpcClient.rpc('rpc_queue_rebalance_candidates', {
          p_limit: limit,
        });
        if (err) throw err;
        await queryClient.invalidateQueries({ queryKey: key });
        return true;
      } catch (err) {
        log.error('Error triggering queue rebalance:', err);
        return false;
      }
    },
    [queryClient, key]
  );

  return {
    rows: slaRows,
    slaRows,
    loading,
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
    updateQueueConfig,
    triggerRebalance,
  };
}

/** Compares queue performance metrics across time periods. */
export function useQueuesComparisonManagement(_params: { dateRange: DateRange }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ['queues-comparison', user?.id] as const;

  const { data: comparison = [], isLoading: loading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      type QueueComparisonSource = {
        id: string;
        name: string;
        queue_analytics?: Array<Partial<QueueAnalytics>> | null;
      };

      const { data, error: err } = await safeFrom('queues').select(`
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

      return ((data ?? []) as QueueComparisonSource[]).map((q) => ({
        queue_id: q.id,
        queue_name: q.name,
        metrics: {
          messageCount: q.queue_analytics?.[0]?.total_messages ?? 0,
          avgResponseTime: q.queue_analytics?.[0]?.average_response_time ?? 0,
          resolution: q.queue_analytics?.[0]?.resolution_rate ?? 0,
          satisfaction: q.queue_analytics?.[0]?.customer_satisfaction ?? 0,
        },
      }));
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  return {
    comparison,
    loading,
    refetch: () => queryClient.invalidateQueries({ queryKey: key }),
  };
}

/** Re-exported module members. */
export type {
  Queue,
  QueueMember,
  QueueWithMembers,
  QueueAnalytics,
  QueueGoal,
  QueueSLA,
  QueueSlaRow,
  QueueSlaPatch,
  QueueSlaFilters,
  SlaStatusFilter,
  QueueComparison,
  DateRange,
};
