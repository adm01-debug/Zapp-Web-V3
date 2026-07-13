import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient, safeFrom } from '@/integrations/supabase/safeClient';
import { useToast } from '@/hooks/use-toast';
import { useMountedRef } from '@/hooks/useMountedRef';
import { log } from '@/lib/logger';
import { dbFrom } from '@/integrations/datasource/db';
import {
  startOfDay,
  format,
  startOfHour,
  eachDayOfInterval,
  eachHourOfInterval,
  startOfToday,
  differenceInDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface Queue {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  max_wait_time_minutes: number;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface QueueMember {
  id: string;
  queue_id: string;
  profile_id: string;
  is_active: boolean;
  created_at: string;
  profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_active: boolean;
  };
}

export interface QueueWithMembers extends Queue {
  members: QueueMember[];
  waiting_count: number;
}

export interface QueueGoal {
  id: string;
  queue_id: string;
  max_waiting_contacts: number;
  max_avg_wait_minutes: number;
  min_assignment_rate: number;
  max_messages_pending: number;
  alerts_enabled: boolean;
}

export interface QueueSlaRow {
  queue_id: string;
  queue_name: string;
  color: string;
  sla_priority: 'low' | 'medium' | 'high' | 'critical';
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
}

export type SlaStatusFilter = 'on_track' | 'at_risk' | 'breached' | null;

export interface QueueSlaFilters {
  skill_name: string | null;
  channel_type: string | null;
  sla_status: SlaStatusFilter;
}

interface DailyData {
  day: string;
  date: string;
  mensagens: number;
  resolvidos: number;
  novos: number;
}

interface HourlyData {
  hora: string;
  atendimentos: number;
}

interface AgentPerformance {
  name: string;
  atendimentos: number;
  profile_id: string;
}

interface StatusData {
  name: string;
  value: number;
  color: string;
}

interface DateRange {
  from: Date;
  to: Date;
}

interface QueueAnalytics {
  dailyData: DailyData[];
  hourlyData: HourlyData[];
  agentPerformance: AgentPerformance[];
  statusData: StatusData[];
  loading: boolean;
}

interface QueuePerformance {
  id: string;
  name: string;
  color: string;
  totalContacts: number;
  assignedContacts: number;
  waitingContacts: number;
  totalMessages: number;
  avgMessagesPerContact: number;
  agentsCount: number;
}

// ═══════════════════════════════════════════════════════════
// Queue CRUD Management
// ═══════════════════════════════════════════════════════════

export interface UseQueuesCrudParams {
  // no params needed
}

export interface UseQueuesCrudResult {
  queues: QueueWithMembers[];
  loading: boolean;
  error: Error | null;
  createQueue: (queue: Partial<Queue>) => Promise<Queue | undefined>;
  updateQueue: (id: string, updates: Partial<Queue>) => Promise<void>;
  deleteQueue: (id: string) => Promise<void>;
  addMember: (queueId: string, profileId: string) => Promise<void>;
  removeMember: (queueId: string, profileId: string) => Promise<void>;
  assignContactToQueue: (contactId: string, queueId: string | null) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useQueuesCrudManagement(_params: UseQueuesCrudParams = {}): UseQueuesCrudResult {
  const [queues, setQueues] = useState<QueueWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();
  const mountedRef = useMountedRef();

  const fetchQueues = useCallback(async () => {
    try {
      setLoading(true);

      const { data: queuesData, error: queuesError } = await safeFrom('queues')
        .select('*')
        .order('priority', { ascending: false });
      if (!mountedRef.current) return;

      if (queuesError) throw queuesError;

      const { data: membersData, error: membersError } = await safeClient.from<QueueMember>(
        'queue_members',
        (q) => q.select('*, profile:profiles(id, name, avatar_url, is_active)')
      );
      if (!mountedRef.current) return;

      if (membersError) throw membersError;

      const { data: waitingData, error: waitingError } =
        await dbFrom('queue_positions').select('queue_id');
      if (!mountedRef.current) return;

      if (waitingError) throw waitingError;

      const waitingCounts: Record<string, number> = {};
      (waitingData as { queue_id: string | null }[] | null)?.forEach((row) => {
        if (row.queue_id) {
          waitingCounts[row.queue_id] = (waitingCounts[row.queue_id] || 0) + 1;
        }
      });

      const queuesWithMembers: QueueWithMembers[] = (queuesData || []).map((queue) => ({
        ...queue,
        members: (membersData || []).filter((m) => m.queue_id === queue.id) as QueueMember[],
        waiting_count: waitingCounts[queue.id] || 0,
      }));

      setQueues(queuesWithMembers);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      log.error('Error fetching queues:', err);
      setError(err as Error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [mountedRef]);

  const createQueue = async (queue: Partial<Queue>) => {
    try {
      const { data, error } = await safeFrom('queues')
        .insert({
          name: queue.name!,
          description: queue.description,
          color: queue.color || '#3B82F6',
          max_wait_time_minutes: queue.max_wait_time_minutes || 30,
          priority: queue.priority || 0,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Fila criada',
        description: `A fila "${queue.name}" foi criada com sucesso.`,
      });

      await fetchQueues();
      return data;
    } catch (err) {
      log.error('Error creating queue:', err);
      toast({
        title: 'Erro ao criar fila',
        description: 'Não foi possível criar a fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const updateQueue = async (id: string, updates: Partial<Queue>) => {
    try {
      const { error } = await safeFrom('queues').update(updates).eq('id', id);

      if (error) throw error;

      toast({
        title: 'Fila atualizada',
        description: 'A fila foi atualizada com sucesso.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error updating queue:', err);
      toast({
        title: 'Erro ao atualizar fila',
        description: 'Não foi possível atualizar a fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const deleteQueue = async (id: string) => {
    try {
      const { error } = await safeFrom('queues').delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Fila excluída',
        description: 'A fila foi excluída com sucesso.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error deleting queue:', err);
      toast({
        title: 'Erro ao excluir fila',
        description: 'Não foi possível excluir a fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const addMember = async (queueId: string, profileId: string) => {
    try {
      const { error } = await safeFrom('queue_members').insert({
        queue_id: queueId,
        profile_id: profileId,
      });

      if (error) throw error;

      toast({
        title: 'Membro adicionado',
        description: 'O atendente foi adicionado à fila.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error adding member:', err);
      toast({
        title: 'Erro ao adicionar membro',
        description: 'Não foi possível adicionar o atendente.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const removeMember = async (queueId: string, profileId: string) => {
    try {
      const { error } = await safeFrom('queue_members')
        .delete()
        .eq('queue_id', queueId)
        .eq('profile_id', profileId);

      if (error) throw error;

      toast({
        title: 'Membro removido',
        description: 'O atendente foi removido da fila.',
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error removing member:', err);
      toast({
        title: 'Erro ao remover membro',
        description: 'Não foi possível remover o atendente.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const assignContactToQueue = async (contactId: string, queueId: string | null) => {
    try {
      const { error } = await dbFrom('contacts')
        .update({ queue_id: queueId, assigned_to: null })
        .eq('id', contactId);

      if (error) throw error;

      toast({
        title: queueId ? 'Contato atribuído' : 'Contato removido da fila',
        description: queueId
          ? 'O contato foi atribuído à fila e será distribuído automaticamente.'
          : 'O contato foi removido da fila.',
      });
    } catch (err) {
      log.error('Error assigning contact:', err);
      toast({
        title: 'Erro ao atribuir contato',
        description: 'Não foi possível atribuir o contato à fila.',
        variant: 'destructive',
      });
      throw err;
    }
  };

  useEffect(() => {
    void fetchQueues();

    const channelName = `queues-changes:${Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
    const queuesChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queues' }, fetchQueues)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_members' }, fetchQueues)
      .subscribe();

    return () => {
      supabase.removeChannel(queuesChannel);
    };
  }, [fetchQueues]);

  return {
    queues,
    loading,
    error,
    createQueue,
    updateQueue,
    deleteQueue,
    addMember,
    removeMember,
    assignContactToQueue,
    refetch: fetchQueues,
  };
}

// ═══════════════════════════════════════════════════════════
// Queue Analytics Management
// ═══════════════════════════════════════════════════════════

export interface UseQueueAnalyticsParams {
  queueId: string;
  dateRange: DateRange;
}

export interface UseQueueAnalyticsResult extends QueueAnalytics {
  refetch: () => Promise<void>;
}

export function useQueueAnalyticsManagement(params: UseQueueAnalyticsParams): UseQueueAnalyticsResult {
  const { queueId, dateRange } = params;
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useMountedRef();

  const generateEmptyDailyData = (range: DateRange): DailyData[] => {
    const days = eachDayOfInterval({
      start: range.from,
      end: range.to,
    });

    return days.map((date) => ({
      day: format(date, 'dd/MM', { locale: ptBR }),
      date: format(date, 'yyyy-MM-dd'),
      mensagens: 0,
      resolvidos: 0,
      novos: 0,
    }));
  };

  const generateEmptyHourlyData = (): HourlyData[] => {
    return Array.from({ length: 12 }, (_, i) => ({
      hora: `${8 + i}h`,
      atendimentos: 0,
    }));
  };

  const processDailyData = (
    messages: Array<{ id: string; contact_id: string; created_at: string; sender: string }>,
    contacts: Array<{ id: string; assigned_to: string | null; created_at: string }>,
    range: DateRange
  ): DailyData[] => {
    const days = eachDayOfInterval({
      start: range.from,
      end: range.to,
    });

    const totalDays = differenceInDays(range.to, range.from) + 1;
    const showEveryNth = totalDays > 14 ? Math.ceil(totalDays / 14) : 1;

    return days
      .filter((_, index) => index % showEveryNth === 0 || index === days.length - 1)
      .map((date) => {
        const dayStart = startOfDay(date);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + showEveryNth);

        const periodMessages = messages.filter((m) => {
          const msgDate = new Date(m.created_at);
          return msgDate >= dayStart && msgDate < dayEnd;
        });

        const newContacts = contacts.filter((c) => {
          const contactDate = new Date(c.created_at);
          return contactDate >= dayStart && contactDate < dayEnd;
        });

        const resolvedContacts = contacts.filter((c) => {
          if (!c.assigned_to) return false;
          const contactDate = new Date(c.created_at);
          return contactDate >= dayStart && contactDate < dayEnd;
        });

        return {
          day: format(date, totalDays > 14 ? 'dd/MM' : 'EEE', { locale: ptBR }),
          date: format(date, 'yyyy-MM-dd'),
          mensagens: periodMessages.length,
          resolvidos: resolvedContacts.length,
          novos: newContacts.length,
        };
      });
  };

  const processHourlyData = (messages: Array<{ id: string; created_at: string }>): HourlyData[] => {
    const today = startOfToday();
    const hours = eachHourOfInterval({
      start: new Date(today.setHours(8)),
      end: new Date(today.setHours(19)),
    });

    return hours.map((hour) => {
      const hourStart = startOfHour(hour);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const hourMessages = messages.filter((m) => {
        const msgDate = new Date(m.created_at);
        return msgDate >= hourStart && msgDate < hourEnd;
      });

      return {
        hora: format(hour, "HH'h'"),
        atendimentos: hourMessages.length,
      };
    });
  };

  const processAgentPerformance = async (
    messages: Array<{ id: string; agent_id: string | null; sender: string }>
  ): Promise<AgentPerformance[]> => {
    const agentMessages: Record<string, number> = {};

    messages.forEach((m) => {
      if (m.sender === 'agent' && m.agent_id) {
        agentMessages[m.agent_id] = (agentMessages[m.agent_id] || 0) + 1;
      }
    });

    const agentIds = Object.keys(agentMessages);
    if (agentIds.length === 0) return [];

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', agentIds);

    if (error || !profiles) return [];

    return profiles
      .map((p) => ({
        name: p.name,
        profile_id: p.id,
        atendimentos: agentMessages[p.id] || 0,
      }))
      .sort((a, b) => b.atendimentos - a.atendimentos)
      .slice(0, 5);
  };

  const processStatusData = (
    contacts: Array<{ id: string; assigned_to: string | null }>
  ): StatusData[] => {
    const total = contacts.length;
    if (total === 0) {
      return [
        { name: 'Resolvidos', value: 0, color: 'hsl(var(--primary))' },
        { name: 'Em Atendimento', value: 0, color: 'hsl(var(--secondary))' },
        { name: 'Aguardando', value: 0, color: 'hsl(var(--accent-foreground))' },
      ];
    }

    const assigned = contacts.filter((c) => c.assigned_to).length;
    const resolved = Math.floor(assigned * 0.7);
    const inProgress = assigned - resolved;

    const resolvedPercent = Math.round((resolved / total) * 100);
    const inProgressPercent = Math.round((inProgress / total) * 100);
    const waitingPercent = 100 - resolvedPercent - inProgressPercent;

    return [
      { name: 'Resolvidos', value: resolvedPercent, color: 'hsl(var(--primary))' },
      { name: 'Em Atendimento', value: inProgressPercent, color: 'hsl(var(--secondary))' },
      { name: 'Aguardando', value: waitingPercent, color: 'hsl(var(--accent-foreground))' },
    ];
  };

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);

      const { data: contacts, error: contactsError } = await dbFrom('contacts')
        .select('id, assigned_to, created_at')
        .eq('queue_id', queueId);

      if (contactsError) throw contactsError;
      if (!mountedRef.current) return;

      const contactIds = contacts?.map((c) => c.id) || [];

      if (contactIds.length === 0) {
        setDailyData(generateEmptyDailyData(dateRange));
        setHourlyData(generateEmptyHourlyData());
        setAgentPerformance([]);
        setStatusData([
          { name: 'Resolvidos', value: 0, color: 'hsl(var(--primary))' },
          { name: 'Em Atendimento', value: 0, color: 'hsl(var(--secondary))' },
          { name: 'Aguardando', value: 0, color: 'hsl(var(--accent-foreground))' },
        ]);
        setLoading(false);
        return;
      }

      const { data: messages, error: messagesError } = await dbFrom('messages')
        .select('id, contact_id, created_at, sender, agent_id')
        .in('contact_id', contactIds)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;
      if (!mountedRef.current) return;

      const dailyAggregation = processDailyData(messages || [], contacts || [], dateRange);
      setDailyData(dailyAggregation);

      const hourlyAggregation = processHourlyData(messages || []);
      setHourlyData(hourlyAggregation);

      const agentAggregation = await processAgentPerformance(messages || []);
      if (!mountedRef.current) return;
      setAgentPerformance(agentAggregation);

      const statusAggregation = processStatusData(contacts || []);
      setStatusData(statusAggregation);
    } catch (error) {
      log.error('Error fetching queue analytics:', error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [queueId, dateRange, mountedRef]);

  useEffect(() => {
    if (queueId && dateRange.from && dateRange.to) {
      void fetchAnalytics();
    }
  }, [queueId, dateRange.from.toISOString(), dateRange.to.toISOString(), fetchAnalytics]);

  return {
    dailyData,
    hourlyData,
    agentPerformance,
    statusData,
    loading,
    refetch: fetchAnalytics,
  };
}

// ═══════════════════════════════════════════════════════════
// Queue Goals Management
// ═══════════════════════════════════════════════════════════

const DEFAULT_GOAL_VALUES = {
  max_waiting_contacts: 10,
  max_avg_wait_minutes: 15,
  min_assignment_rate: 80,
  max_messages_pending: 50,
  alerts_enabled: true,
} as const;

function normalizeQueueGoal(row: Record<string, unknown>): QueueGoal {
  return {
    id: String(row.id ?? ''),
    queue_id: String(row.queue_id ?? ''),
    max_waiting_contacts:
      (row.max_waiting_contacts as number | null) ?? DEFAULT_GOAL_VALUES.max_waiting_contacts,
    max_avg_wait_minutes:
      (row.max_avg_wait_minutes as number | null) ?? DEFAULT_GOAL_VALUES.max_avg_wait_minutes,
    min_assignment_rate:
      (row.min_assignment_rate as number | null) ?? DEFAULT_GOAL_VALUES.min_assignment_rate,
    max_messages_pending:
      (row.max_messages_pending as number | null) ?? DEFAULT_GOAL_VALUES.max_messages_pending,
    alerts_enabled: (row.alerts_enabled as boolean | null) ?? DEFAULT_GOAL_VALUES.alerts_enabled,
  };
}

export interface UseQueueGoalsParams {
  // no params needed
}

export interface UseQueueGoalsResult {
  goals: Record<string, QueueGoal>;
  loading: boolean;
  saveGoal: (queueId: string, goalData: Partial<QueueGoal>) => Promise<void>;
  getDefaultGoal: () => Omit<QueueGoal, 'id' | 'queue_id'>;
  refetch: () => Promise<void>;
}

export function useQueueGoalsManagement(_params: UseQueueGoalsParams = {}): UseQueueGoalsResult {
  const [goals, setGoals] = useState<Record<string, QueueGoal>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const mountedRef = useMountedRef();

  const fetchGoals = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('queue_goals').select('*');

      if (!mountedRef.current) return;
      if (error) throw error;

      const goalsMap: Record<string, QueueGoal> = {};
      data?.forEach((goal) => {
        const normalized = normalizeQueueGoal(goal as unknown as Record<string, unknown>);
        goalsMap[normalized.queue_id] = normalized;
      });

      setGoals(goalsMap);
    } catch (error) {
      log.error('Error fetching queue goals:', error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [mountedRef]);

  useEffect(() => {
    void fetchGoals();

    const channel = supabase
      .channel('queue-goals-changes')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'queue_goals' }, fetchGoals)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchGoals]);

  const saveGoal = async (queueId: string, goalData: Partial<QueueGoal>) => {
    try {
      const existingGoal = goals[queueId];

      if (existingGoal) {
        const { error } = await supabase
          .from('queue_goals')
          .update(goalData)
          .eq('queue_id', queueId);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('queue_goals').insert({
          queue_id: queueId,
          ...goalData,
        });

        if (error) throw error;
      }

      toast({
        title: 'Metas salvas',
        description: 'As metas da fila foram atualizadas com sucesso.',
      });

      await fetchGoals();
    } catch (error) {
      log.error('Error saving queue goal:', error);
      toast({
        title: 'Erro ao salvar metas',
        description: 'Não foi possível salvar as metas.',
        variant: 'destructive',
      });
    }
  };

  const getDefaultGoal = (): Omit<QueueGoal, 'id' | 'queue_id'> => ({
    max_waiting_contacts: 10,
    max_avg_wait_minutes: 15,
    min_assignment_rate: 80,
    max_messages_pending: 50,
    alerts_enabled: true,
  });

  return {
    goals,
    loading,
    saveGoal,
    getDefaultGoal,
    refetch: fetchGoals,
  };
}

// ═══════════════════════════════════════════════════════════
// Queue SLA Panel Management
// ═══════════════════════════════════════════════════════════

export interface UseQueueSlaParams {
  filters: QueueSlaFilters;
}

export interface UseQueueSlaResult {
  rows: QueueSlaRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateQueueConfig: (
    queueId: string,
    patch: Partial<Pick<QueueSlaRow, 'sla_priority' | 'routing_weight' | 'auto_rebalance_enabled'>>
  ) => Promise<boolean>;
  triggerRebalance: (limit?: number) => Promise<{ processed: number; assigned: number; skipped: number; errors: number } | null>;
}

export function useQueueSlaManagement(params: UseQueueSlaParams): UseQueueSlaResult {
  const { filters } = params;
  const [rows, setRows] = useState<QueueSlaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await safeClient.rpc<QueueSlaRow[]>('rpc_queue_sla_panel', {
      p_skill_name: filters.skill_name,
      p_channel_type: filters.channel_type,
      p_sla_status: filters.sla_status,
    });
    if (!mountedRef.current) return;
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  }, [filters.skill_name, filters.channel_type, filters.sla_status]);

  useEffect(() => {
    fetchRows();
    const id = setInterval(fetchRows, 30_000);
    return () => clearInterval(id);
  }, [fetchRows]);

  const updateQueueConfig = async (
    queueId: string,
    patch: Partial<Pick<QueueSlaRow, 'sla_priority' | 'routing_weight' | 'auto_rebalance_enabled'>>
  ) => {
    const { error } = await safeClient.from('queues', (q) => q.update(patch).eq('id', queueId));
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return false;
    }
    setRows((prev) => prev.map((r) => (r.queue_id === queueId ? { ...r, ...patch } : r)));
    toast({ title: 'Fila atualizada' });
    return true;
  };

  const triggerRebalance = async (limit = 50) => {
    const { data, error } = await supabase.functions.invoke('queue-rebalance', {
      body: { limit, source: 'panel' },
    });
    if (error) {
      toast({
        title: 'Falha no redistribuidor',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
    toast({
      title: 'Redistribuição concluída',
      description: `${data?.assigned ?? 0} atribuídos, ${data?.skipped ?? 0} sem agente disponível.`,
    });
    fetchRows();
    return data as { processed: number; assigned: number; skipped: number; errors: number };
  };

  return { rows, loading, error, refetch: fetchRows, updateQueueConfig, triggerRebalance };
}

// ═══════════════════════════════════════════════════════════
// Queues Comparison Management
// ═══════════════════════════════════════════════════════════

export interface UseQueuesComparisonParams {
  dateRange: DateRange;
}

export interface UseQueuesComparisonResult {
  queuesPerformance: QueuePerformance[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useQueuesComparisonManagement(params: UseQueuesComparisonParams): UseQueuesComparisonResult {
  const { dateRange } = params;
  const [queuesPerformance, setQueuesPerformance] = useState<QueuePerformance[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComparison = useCallback(async () => {
    try {
      setLoading(true);

      const { data: queues, error: queuesError } = await supabase
        .from('queues')
        .select('id, name, color')
        .eq('is_active', true);

      if (queuesError) throw queuesError;
      if (!queues || queues.length === 0) {
        setQueuesPerformance([]);
        setLoading(false);
        return;
      }

      const { data: contacts, error: contactsError } = await dbFrom('contacts')
        .select('id, queue_id, assigned_to, created_at')
        .not('queue_id', 'is', null);

      if (contactsError) throw contactsError;

      const { data: members, error: membersError } = await supabase
        .from('queue_members')
        .select('queue_id, profile_id')
        .eq('is_active', true);

      if (membersError) throw membersError;

      const contactIds = contacts?.map((c) => c.id) || [];

      let messages: Array<{ contact_id: string }> = [];
      if (contactIds.length > 0) {
        const { data: messagesData, error: messagesError } = await dbFrom('messages')
          .select('contact_id')
          .in('contact_id', contactIds)
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());

        if (messagesError) throw messagesError;
        messages = messagesData || [];
      }

      const messagesPerContact: Record<string, number> = {};
      messages.forEach((m) => {
        messagesPerContact[m.contact_id] = (messagesPerContact[m.contact_id] || 0) + 1;
      });

      const contactToQueue: Record<string, string> = {};
      contacts?.forEach((c) => {
        if (c.queue_id) {
          contactToQueue[c.id] = c.queue_id;
        }
      });

      const messagesPerQueue: Record<string, number> = {};
      Object.entries(messagesPerContact).forEach(([contactId, count]) => {
        const queueId = contactToQueue[contactId];
        if (queueId) {
          messagesPerQueue[queueId] = (messagesPerQueue[queueId] || 0) + count;
        }
      });

      const performance: QueuePerformance[] = queues.map((queue) => {
        const queueContacts = contacts?.filter((c) => c.queue_id === queue.id) || [];
        const assignedContacts = queueContacts.filter((c) => c.assigned_to);
        const waitingContacts = queueContacts.filter((c) => !c.assigned_to);
        const queueMembers = members?.filter((m) => m.queue_id === queue.id) || [];
        const totalMessages = messagesPerQueue[queue.id] || 0;

        return {
          id: queue.id,
          name: queue.name,
          color: queue.color,
          totalContacts: queueContacts.length,
          assignedContacts: assignedContacts.length,
          waitingContacts: waitingContacts.length,
          totalMessages,
          avgMessagesPerContact:
            queueContacts.length > 0
              ? Math.round((totalMessages / queueContacts.length) * 10) / 10
              : 0,
          agentsCount: queueMembers.length,
        };
      });

      performance.sort((a, b) => b.totalContacts - a.totalContacts);

      setQueuesPerformance(performance);
    } catch (error) {
      log.error('Error fetching queues comparison:', error);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchComparison();
  }, [dateRange.from.toISOString(), dateRange.to.toISOString(), fetchComparison]);

  return {
    queuesPerformance,
    loading,
    refetch: fetchComparison,
  };
}
