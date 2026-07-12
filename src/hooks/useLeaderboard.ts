// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { dbFrom } from '@/integrations/datasource/db';
import { log } from '@/lib/logger';

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

export function useLeaderboard() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('week');
  const [agents, setAgents] = useState<LeaderboardAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Monotonically-increasing token: prevents a slower earlier request from
  // overwriting state committed by a faster later request when the user
  // rapidly switches the time range.
  const fetchTokenRef = useRef(0);

  const fetchLeaderboard = useCallback(async (range: 'today' | 'week' | 'month') => {
    const token = ++fetchTokenRef.current;
    const since = rangeStart(range).toISOString();
    try {
      type AgentStatRow = {
        id: string;
        profile_id: string;
        xp: number;
        level: number;
        current_streak: number;
        avg_response_time_seconds: number | null;
        customer_satisfaction_score: number | null;
        achievements_count: number;
        profiles: {
          id: string;
          name: string;
          avatar_url: string | null;
          is_active: boolean | null;
        } | null;
      };
      const { data: rawStats, error } = await safeClient.from<AgentStatRow>(
        'agent_stats',
        (q) => q
          .select('*, profiles:profile_id (id, name, avatar_url, is_active)')
          .order('xp', { ascending: false })
          .limit(10),
      );
      const stats = rawStats ?? null;

      if (error) throw error;
      if (!stats || stats.length === 0) {
        setAgents([]);
        return;
      }

      const profileIds = stats.map((s) => s.profile_id);

      // Achievements earned within the selected period
      const { data: achievements } = await supabase
        .from('agent_achievements')
        .select('profile_id, achievement_type')
        .in('profile_id', profileIds)
        .gte('earned_at', since)
        .order('earned_at', { ascending: false });

      const achievementsByProfile: Record<string, string[]> = {};
      achievements?.forEach((a) => {
        if (!achievementsByProfile[a.profile_id]) achievementsByProfile[a.profile_id] = [];
        if (!achievementsByProfile[a.profile_id].includes(a.achievement_type))
          achievementsByProfile[a.profile_id].push(a.achievement_type);
      });

      // Messages handled in the selected period — join through contacts.assigned_to (profile_id)
      const msgsByProfile: Record<string, number> = {};
      try {
        const { data: contactRows } = await dbFrom('contacts')
          .select('id, assigned_to')
          .in('assigned_to', profileIds);
        if (contactRows && contactRows.length > 0) {
          const contactToProfile: Record<string, string> = {};
          contactRows.forEach((c: { id: string; assigned_to: string | null }) => {
            if (c.assigned_to) contactToProfile[c.id] = c.assigned_to;
          });
          const contactIds = contactRows.map((c: { id: string }) => c.id);
          const { data: msgRows } = await dbFrom('messages')
            .select('contact_id')
            .in('contact_id', contactIds)
            .gte('created_at', since);
          msgRows?.forEach((m: { contact_id: string }) => {
            const pid = contactToProfile[m.contact_id];
            if (pid) msgsByProfile[pid] = (msgsByProfile[pid] || 0) + 1;
          });
        }
      } catch (msgErr) {
        log.warn('Could not compute period message counts for leaderboard:', msgErr);
      }

      // Discard results if a newer fetchLeaderboard call has already started.
      if (fetchTokenRef.current !== token) return;

      setAgents(
        stats.map((stat, index) => {
          const profile = Array.isArray(stat.profiles) ? (stat.profiles[0] ?? null) : stat.profiles;
          const agentAchievements = achievementsByProfile[stat.profile_id] || [];
          return {
            id: stat.id,
            profile_id: stat.profile_id,
            name: profile?.name || 'Agente',
            avatar: profile?.avatar_url || undefined,
            xp: stat.xp,
            level: stat.level,
            streak: stat.current_streak,
            messagesHandled: msgsByProfile[stat.profile_id] ?? 0,
            avgResponseTime: stat.avg_response_time_seconds || 0,
            satisfaction: Number(stat.customer_satisfaction_score) * 100 || 0,
            rank: index + 1,
            previousRank: index + 1,
            achievements: agentAchievements.slice(0, 5),
            achievementsCount: agentAchievements.length,
            isOnline: profile?.is_active ?? false,
          };
        })
      );
    } catch (error) {
      log.error('Error fetching leaderboard:', error);
    } finally {
      if (fetchTokenRef.current === token) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

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
      supabase.removeChannel(channel);
    };
  }, [timeRange, fetchLeaderboard]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    void fetchLeaderboard(timeRange);
  }, [fetchLeaderboard, timeRange]);

  return { agents, isLoading, isRefreshing, timeRange, setTimeRange, handleRefresh };
}
