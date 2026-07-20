// Consolidated Dashboard & Data Visualization Module (ETAPA 46)
// Consolidates: useDashboardData, useDashboardWidgets, useGoalsDashboard, useLeaderboard, useWarRoomData
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { ElementType } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dbFrom } from '@/integrations/datasource/db';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';
import { useMountedRef } from '@/hooks/useMountedRef';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, Users } from 'lucide-react';
import type { DashboardFilters, QueueStats, RecentActivity } from './dashboardTypes';

/** Dashboard Widget interface definition. */
export interface DashboardWidget {
  id: string;
  title: string;
  type:
    | 'stats'
    | 'challenges'
    | 'ai-stats'
    | 'queues'
    | 'leaderboard'
    | 'activity'
    | 'achievements'
    | 'mini-games';
  visible: boolean;
  order: number;
  size: 'small' | 'medium' | 'large' | 'full';
  column?: number;
  row?: number;
  width?: number;
  height?: number;
  level: 1 | 2 | 3;
}

/** Goal interface definition. */
export interface Goal {
  id: string;
  label: string;
  description: string;
  target: number;
  current: number;
  unit: string;
  icon: ElementType;
  color: string;
  priority: 'high' | 'medium' | 'low';
}

/** Leaderboard Agent interface definition. */
export interface LeaderboardAgent {
  id: string;
  profile_id: string;
  name: string;
  avatar?: string;
  xp: number;
  level: number;
  streak: number;
  messagesHandled: number;
  avgResponseTime: number;
  satisfaction: number;
  rank: number;
  previousRank: number;
  achievements: string[];
  achievementsCount: number;
  isOnline: boolean;
}

/** War Room Agent interface definition. */
export interface WarRoomAgent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  activeChats: number;
  maxChats: number;
  avgResponseTime: number;
  resolvedToday: number;
  satisfaction: number;
}

/** War Room Queue interface definition. */
export interface WarRoomQueue {
  id: string;
  name: string;
  color: string | null;
  waiting: number;
  avgWaitTime: number;
  slaBreaches: number;
  slaWarnings: number;
  inProgress: number;
}

const DEFAULT_GOALS = {
  messages_sent: { daily: 50, weekly: 250, monthly: 1000 },
  contacts_handled: { daily: 10, weekly: 50, monthly: 200 },
  resolution_rate: { daily: 80, weekly: 80, monthly: 85 },
};

const defaultWidgets: DashboardWidget[] = [
  {
    id: 'stats',
    title: 'Estatísticas',
    type: 'stats',
    visible: true,
    order: 0,
    size: 'full',
    column: 0,
    row: 0,
    width: 4,
    height: 1,
    level: 1,
  },
  {
    id: 'challenges',
    title: 'Desafios do Dia',
    type: 'challenges',
    visible: true,
    order: 1,
    size: 'full',
    column: 0,
    row: 1,
    width: 4,
    height: 1,
    level: 2,
  },
  {
    id: 'queues',
    title: 'Status das Filas',
    type: 'queues',
    visible: true,
    order: 2,
    size: 'medium',
    column: 0,
    row: 2,
    width: 2,
    height: 1,
    level: 2,
  },
  {
    id: 'activity',
    title: 'Atividade Recente',
    type: 'activity',
    visible: true,
    order: 3,
    size: 'medium',
    column: 2,
    row: 2,
    width: 2,
    height: 1,
    level: 2,
  },
  {
    id: 'ai-stats',
    title: 'IA Stats',
    type: 'ai-stats',
    visible: true,
    order: 4,
    size: 'medium',
    column: 0,
    row: 3,
    width: 2,
    height: 1,
    level: 3,
  },
  {
    id: 'leaderboard',
    title: 'Ranking',
    type: 'leaderboard',
    visible: true,
    order: 5,
    size: 'medium',
    column: 2,
    row: 3,
    width: 2,
    height: 1,
    level: 3,
  },
  {
    id: 'achievements',
    title: 'Conquistas',
    type: 'achievements',
    visible: true,
    order: 6,
    size: 'full',
    column: 0,
    row: 4,
    width: 4,
    height: 1,
    level: 3,
  },
  {
    id: 'mini-games',
    title: 'Mini-games',
    type: 'mini-games',
    visible: true,
    order: 7,
    size: 'full',
    column: 0,
    row: 5,
    width: 4,
    height: 1,
    level: 3,
  },
];

const STORAGE_KEY = 'dashboard-widgets-config-v3';
const sizeToGrid: Record<string, { width: number; height: number }> = {
  small: { width: 1, height: 1 },
  medium: { width: 2, height: 1 },
  large: { width: 3, height: 1 },
  full: { width: 4, height: 1 },
};

function rangeStart(range: 'today' | 'week' | 'month'): Date {
  const d = new Date();
  if (range === 'today') {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (range === 'week') {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setDate(d.getDate() - 29);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDateRange(period: string) {
  const now = new Date();
  switch (period) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'week':
      return { from: startOfWeek(now, { locale: ptBR }), to: endOfWeek(now, { locale: ptBR }) };
    case 'month':
      return { from: startOfMonth(now), to: endOfMonth(now) };
    default:
      return { from: startOfDay(now), to: endOfDay(now) };
  }
}

/** Fetches and aggregates dashboard data with filtering by date range, queue, and agent. */
export function useDashboardDataManagement(filters?: DashboardFilters) {
  useAuth();
  const merged = {
    dateRange: { from: startOfDay(new Date()), to: endOfDay(new Date()) },
    queueId: null,
    agentId: null,
    ...filters,
  };

  const { data: agentsData, isLoading: loadingAgents } = useQuery({
    queryKey: queryKeys.dashboard.agents(merged.agentId),
    queryFn: async () => {
      let query = supabase.from('profiles').select('id, name, avatar_url, is_active');
      if (merged.agentId) {
        query = query.eq('id', merged.agentId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return {
        onlineAgents: (data || []).filter((p) => p.is_active).length,
        totalAgents: (data || []).length,
      };
    },
  });

  const {
    data: contactsData,
    isLoading: loadingContacts,
    error: contactsError,
  } = useQuery({
    queryKey: queryKeys.dashboard.contactsFiltered(
      merged.dateRange,
      merged.queueId,
      merged.agentId
    ),
    queryFn: async () => {
      let query = dbFrom('contacts').select('id, assigned_to, queue_id, updated_at');
      if (merged.queueId) {
        query = query.eq('queue_id', merged.queueId);
      }
      if (merged.agentId) {
        query = query.eq('assigned_to', merged.agentId);
      }
      query = query
        .gte('updated_at', merged.dateRange.from.toISOString())
        .lte('updated_at', merged.dateRange.to.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const {
    data: queuesData,
    isLoading: loadingQueues,
    error: queuesError,
  } = useQuery({
    queryKey: queryKeys.dashboard.queuesFiltered(merged.queueId),
    queryFn: async () => {
      let query = supabase
        .from('queues')
        .select('id, name, color, queue_members(is_active, profiles(is_active))');
      if (merged.queueId) {
        query = query.eq('id', merged.queueId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!contactsData || !agentsData || !queuesData) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openConversations = contactsData.filter((c) => c.assigned_to).length;
    const pendingConversations = contactsData.filter((c) => !c.assigned_to && c.queue_id).length;
    const resolvedToday = contactsData.filter((c) => {
      const updatedAt = new Date(c.updated_at);
      return updatedAt >= today && !c.assigned_to;
    }).length;

    const queuesStats: QueueStats[] = queuesData.map((queue) => {
      const members =
        (queue.queue_members as
          | {
              is_active: boolean | null;
              profiles: { is_active: boolean | null } | { is_active: boolean | null }[] | null;
            }[]
          | null) ?? [];
      const onlineMembers = members.filter((m) => {
        const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return m.is_active && profile?.is_active;
      }).length;
      return {
        id: queue.id,
        name: queue.name,
        color: queue.color,
        waitingCount: pendingConversations,
        onlineAgents: onlineMembers,
        totalAgents: members.length,
      };
    });

    const recentActivity: RecentActivity[] = contactsData.slice(0, 10).map((c) => ({
      id: c.id,
      contactName: 'Contact',
      contactPhone: '',
      contactAvatar: null,
      lastMessage: '',
      timestamp: c.updated_at,
      status: 'unread',
      unreadCount: 0,
    }));

    return {
      openConversations,
      pendingConversations,
      resolvedToday,
      totalConversations: contactsData.length,
      onlineAgents: agentsData.onlineAgents,
      totalAgents: agentsData.totalAgents,
      avgResponseTime: null,
      queuesStats,
      recentActivity,
    };
  }, [contactsData, agentsData, queuesData]);

  const isLoading = loadingAgents || loadingContacts || loadingQueues;
  const error = contactsError || queuesError;

  return { stats, isLoading, error, refetch: () => {} };
}

/** Manages dashboard widget visibility, ordering, resizing, and persistence to localStorage. */
export function useDashboardWidgetsManagement() {
  const [widgets, setWidgets] = useState<DashboardWidget[]>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const mergedWidgets = defaultWidgets.map((defaultWidget) => {
          const storedWidget = parsed.find((w: DashboardWidget) => w.id === defaultWidget.id);
          return storedWidget ? { ...defaultWidget, ...storedWidget } : defaultWidget;
        });
        return mergedWidgets.sort((a, b) => a.order - b.order);
      } catch {
        return defaultWidgets;
      }
    }
    return defaultWidgets;
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  }, [widgets]);

  const reorderWidgets = useCallback(
    (sourceIndex: number, destinationIndex: number) => {
      const result = Array.from(widgets);
      const [removed] = result.splice(sourceIndex, 1);
      result.splice(destinationIndex, 0, removed);
      const reordered = result.map((widget, index) => ({ ...widget, order: index }));
      setWidgets(reordered);
    },
    [widgets]
  );

  const toggleWidgetVisibility = useCallback((widgetId: string) => {
    setWidgets((prev) =>
      prev.map((widget) =>
        widget.id === widgetId ? { ...widget, visible: !widget.visible } : widget
      )
    );
  }, []);

  const updateWidgetSize = useCallback((widgetId: string, newSize: string) => {
    setWidgets((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? {
              ...widget,
              size: newSize as DashboardWidget['size'],
              width: sizeToGrid[newSize]?.width,
              height: sizeToGrid[newSize]?.height,
            }
          : widget
      )
    );
  }, []);

  const updateWidgetPosition = useCallback((widgetId: string, column: number, row: number) => {
    setWidgets((prev) =>
      prev.map((widget) => (widget.id === widgetId ? { ...widget, column, row } : widget))
    );
  }, []);

  const moveWidget = useCallback(
    (widgetId: string, direction: 'up' | 'down' | 'left' | 'right') => {
      setWidgets((prev) => {
        const widget = prev.find((w) => w.id === widgetId);
        if (!widget) return prev;
        let newColumn = widget.column ?? 0;
        let newRow = widget.row ?? 0;
        switch (direction) {
          case 'up':
            newRow = Math.max(0, newRow - 1);
            break;
          case 'down':
            newRow = newRow + 1;
            break;
          case 'left':
            newColumn = Math.max(0, newColumn - 1);
            break;
          case 'right':
            newColumn = Math.min(3, newColumn + 1);
            break;
        }
        return prev.map((w) => (w.id === widgetId ? { ...w, column: newColumn, row: newRow } : w));
      });
    },
    []
  );

  const resetToDefaults = useCallback(() => {
    setWidgets(defaultWidgets);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const visibleWidgets = widgets.filter((w) => w.visible);
  const level1Widgets = visibleWidgets.filter((w) => w.level === 1);
  const level2Widgets = visibleWidgets.filter((w) => w.level === 2);
  const level3Widgets = visibleWidgets.filter((w) => w.level === 3);

  return {
    widgets,
    visibleWidgets,
    level1Widgets,
    level2Widgets,
    level3Widgets,
    isEditMode,
    setIsEditMode,
    draggedWidget,
    setDraggedWidget,
    reorderWidgets,
    toggleWidgetVisibility,
    updateWidgetSize,
    updateWidgetPosition,
    moveWidget,
    resetToDefaults,
  };
}

/** Manages user goals tracking, celebration notifications, and custom goal configurations. */
export function useGoalsDashboardManagement() {
  const [period, setPeriod] = useState('today');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: '', subtitle: '', emoji: '🎉' });
  const _previousCompletedGoals = useRef<Set<string>>(new Set());
  const previousOverallComplete = useRef(false);
  const { user } = useAuth();

  const dateRange = useMemo(() => getDateRange(period), [period]);

  const { data: profile } = useQuery({
    queryKey: queryKeys.userProfile.meById(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('user_id', user.id)
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: queryKeys.goals.messages(period),
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await dbFrom('messages')
        .select('id, sender, created_at')
        .eq('agent_id', profile.id)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: queryKeys.goals.contactsFiltered(period, profile?.id),
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await dbFrom('contacts')
        .select('id, created_at')
        .eq('assigned_to', profile.id)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: customGoals = [] } = useQuery({
    queryKey: queryKeys.goals.configForProfile(profile?.id),
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('goals_configurations')
        .select('goal_type, daily_target, weekly_target, monthly_target, is_active')
        .eq('profile_id', profile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const goals = useMemo((): Goal[] => {
    const messagesSent = messagesData?.filter((m) => m.sender === 'agent').length || 0;
    const contactsHandled = contactsData?.length || 0;

    const allGoals: Goal[] = [];

    const messageConfig = customGoals.find((g) => g.goal_type === 'messages_sent');
    const messagesTarget = messageConfig
      ? messageConfig[`${period}_target` as keyof typeof messageConfig]
      : DEFAULT_GOALS.messages_sent[period as keyof typeof DEFAULT_GOALS.messages_sent];

    allGoals.push({
      id: 'messages-sent',
      label: 'Mensagens Enviadas',
      description: 'Total de mensagens enviadas no período',
      target:
        messagesTarget ||
        DEFAULT_GOALS.messages_sent[period as keyof typeof DEFAULT_GOALS.messages_sent],
      current: messagesSent,
      unit: 'mensagens',
      icon: MessageSquare,
      color: 'hsl(var(--primary))',
      priority: 'high',
    });

    const contactConfig = customGoals.find((g) => g.goal_type === 'contacts_handled');
    const contactsTarget = contactConfig
      ? contactConfig[`${period}_target` as keyof typeof contactConfig]
      : DEFAULT_GOALS.contacts_handled[period as keyof typeof DEFAULT_GOALS.contacts_handled];

    allGoals.push({
      id: 'contacts-handled',
      label: 'Contatos Atendidos',
      description: 'Novos contatos atribuídos a você',
      target:
        contactsTarget ||
        DEFAULT_GOALS.contacts_handled[period as keyof typeof DEFAULT_GOALS.contacts_handled],
      current: contactsHandled,
      unit: 'contatos',
      icon: Users,
      color: 'hsl(var(--chart-2))',
      priority: 'high',
    });
    return allGoals;
  }, [messagesData, contactsData, period, customGoals]);

  const overallProgress = useMemo(() => {
    if (goals.length === 0) return 0;
    return Math.round(
      goals.reduce((acc, g) => acc + Math.min((g.current / g.target) * 100, 100), 0) / goals.length
    );
  }, [goals]);

  const completedGoals = useMemo(() => goals.filter((g) => g.current >= g.target).length, [goals]);
  const isLoading = loadingMessages || loadingContacts;

  useEffect(() => {
    if (isLoading || goals.length === 0) return;
    const allGoalsCompleted = overallProgress >= 100;
    if (allGoalsCompleted && !previousOverallComplete.current) {
      setCelebrationData({
        title: 'Todas as Metas Alcançadas! 🏆',
        subtitle: 'Parabéns! Você completou todas as metas do período!',
        emoji: '🎉',
      });
      setShowCelebration(true);
      previousOverallComplete.current = true;
    } else if (!allGoalsCompleted) {
      previousOverallComplete.current = false;
    }
  }, [goals, overallProgress, isLoading]);

  return {
    period,
    setPeriod,
    configDialogOpen,
    setConfigDialogOpen,
    showCelebration,
    setShowCelebration,
    celebrationData,
    goals,
    overallProgress,
    completedGoals,
    isLoading,
    dateRange,
  };
}

/** Manages agent leaderboard data, rankings, XP, and real-time updates via Realtime. */
export function useLeaderboardManagement() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');
  const [agents, setAgents] = useState<LeaderboardAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchTokenRef = useRef(0);
  const mountedRef = useMountedRef();

  const fetchLeaderboard = useCallback(
    async (range: 'today' | 'week' | 'month') => {
      const token = ++fetchTokenRef.current;
      const _since = rangeStart(range).toISOString();
      try {
        const { data: rawStats, error } = await supabase
          .from('agent_stats')
          .select('*, profiles:profile_id (id, name, avatar_url, is_active)')
          .gte('updated_at', _since)
          .order('xp', { ascending: false })
          .limit(10);
        if (error) throw error;
        if (!mountedRef.current) return;
        if (!rawStats || rawStats.length === 0) {
          setAgents([]);
          return;
        }

        if (fetchTokenRef.current !== token) return;
        if (!mountedRef.current) return;

        setAgents(
          rawStats.map((stat, index) => {
            const profile = Array.isArray(stat.profiles) ? stat.profiles[0] : stat.profiles;
            return {
              id: stat.id,
              profile_id: stat.profile_id,
              name: profile?.name || 'Agente',
              avatar: profile?.avatar_url || undefined,
              xp: stat.xp,
              level: stat.level,
              streak: stat.current_streak,
              messagesHandled: 0,
              avgResponseTime: stat.avg_response_time_seconds || 0,
              satisfaction: Number(stat.customer_satisfaction_score) * 100 || 0,
              rank: index + 1,
              previousRank: index + 1,
              achievements: [],
              achievementsCount: 0,
              isOnline: profile?.is_active ?? false,
            };
          })
        );
      } catch (error) {
        log.error('Error fetching leaderboard:', error);
      } finally {
        if (fetchTokenRef.current === token && mountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [mountedRef]
  );

  useEffect(() => {
    void fetchLeaderboard(timeRange);
    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'agent_stats' }, () => {
        log.debug('Agent stats updated, refreshing leaderboard...');
        void fetchLeaderboard(timeRange);
      })
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [timeRange, fetchLeaderboard]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void fetchLeaderboard(timeRange);
  }, [fetchLeaderboard, timeRange]);

  return { agents, isLoading, isRefreshing, timeRange, setTimeRange, handleRefresh };
}

/** Fetches war room data including agents, queues, and real-time metrics. */
export function useWarRoomDataManagement() {
  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.adminOps.warroom.agents(),
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, is_active, max_chats')
        .eq('is_active', true);
      if (error) throw error;

      const { data: contacts, error: contactsErr } = await dbFrom('contacts').select('assigned_to');
      if (contactsErr) log.warn('contacts fetch failed (warroom agents)');

      const contactCounts = (contacts || []).reduce<Record<string, number>>((acc, c) => {
        if (c.assigned_to) acc[c.assigned_to] = (acc[c.assigned_to] || 0) + 1;
        return acc;
      }, {});

      return (profiles || []).map(
        (p): WarRoomAgent => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar_url || undefined,
          status: contactCounts[p.id] >= (p.max_chats || 5) ? 'busy' : 'online',
          activeChats: contactCounts[p.id] || 0,
          maxChats: p.max_chats || 5,
          avgResponseTime: 0,
          resolvedToday: 0,
          satisfaction: 0,
        })
      );
    },
    staleTime: 25_000,
    refetchInterval: 30000,
  });

  const { data: queues = [] } = useQuery({
    queryKey: queryKeys.adminOps.warroom.queues(),
    queryFn: async () => {
      const { data: dbQueues, error: dbQueuesErr } = await supabase
        .from('queues')
        .select('id, name, color, is_active')
        .eq('is_active', true);
      if (dbQueuesErr) throw dbQueuesErr;

      return (dbQueues || []).map(
        (q): WarRoomQueue => ({
          id: q.id,
          name: q.name,
          color: q.color,
          waiting: 0,
          avgWaitTime: 0,
          slaBreaches: 0,
          slaWarnings: 0,
          inProgress: 0,
        })
      );
    },
    staleTime: 30_000,
    refetchInterval: 30000,
  });

  return { agents, queues };
}

/** Re-exported module members. */
export type {
  DashboardFilters,
  DashboardStats,
  QueueStats,
  RecentActivity,
} from './dashboardTypes';
