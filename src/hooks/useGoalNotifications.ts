import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';
import { dbFrom } from '@/integrations/datasource/db';

interface GoalConfiguration {
  id: string;
  goal_type: string;
  daily_target: number;
  weekly_target: number;
  monthly_target: number;
  profile_id: string | null;
  queue_id: string | null;
  is_active: boolean;
}

type Period = 'daily' | 'weekly' | 'monthly';

export function useGoalNotifications() {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();
  const achievedGoals = useRef<Set<string>>(new Set());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const createNotification = useCallback(async (
    title: string,
    message: string,
    metadata: { goal_id: string; goal_type: string; period: string; current: number; target: number }
  ) => {
    if (!user) return;
    
    try {
      const jsonMetadata: Json = {
        goal_id: metadata.goal_id,
        goal_type: metadata.goal_type,
        period: metadata.period,
        current: metadata.current,
        target: metadata.target
      };

      await supabase
        .from('notifications')
        .insert([{
          user_id: user.id,
          title,
          message,
          type: 'goal',
          metadata: jsonMetadata
        }]);
    } catch (error) {
      log.error('Error creating notification:', error);
    }
  }, [user]);

  const getDateRange = (period: Period) => {
    const now = new Date();
    switch (period) {
      case 'daily':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'weekly':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'monthly':
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const checkGoalProgress = useCallback(async () => {
    if (!user) return;

    try {
      // Get user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile) return;

      // Get active goal configurations
      const { data: goals, error: goalsError } = await supabase
        .from('goals_configurations')
        .select('*')
        .eq('is_active', true)
        .or(`profile_id.eq.${profile.id},profile_id.is.null`);

      if (goalsError || !goals || goals.length === 0) return;

      // Get agent stats
      const { data: agentStats } = await supabase
        .from('agent_stats')
        .select('*')
        .eq('profile_id', profile.id)
        .maybeSingle();

      // Pre-fetch all counts in parallel (at most 6 queries regardless of # of goals)
      const periods: Period[] = ['daily', 'weekly', 'monthly'];
      const dateRanges = Object.fromEntries(periods.map(p => [p, getDateRange(p)])) as Record<Period, { start: Date; end: Date }>;

      const needsMessagesSent = goals.some(g => g.goal_type === 'messages_sent');
      const needsConversationsResolved = goals.some(g => g.goal_type === 'conversations_resolved');

      const messagesCounts: Partial<Record<Period, number>> = {};
      const resolvedCounts: Partial<Record<Period, number>> = {};

      await Promise.all([
        ...periods.map(async (p) => {
          if (!needsMessagesSent) return;
          const { start, end } = dateRanges[p];
          const { count } = await dbFrom('messages')
            .select('*', { count: 'exact', head: true })
            .eq('sender', 'agent')
            .eq('agent_id', profile.id)
            .gte('created_at', start.toISOString())
            .lte('created_at', end.toISOString());
          messagesCounts[p] = count ?? 0;
        }),
        ...periods.map(async (p) => {
          if (!needsConversationsResolved) return;
          const { start, end } = dateRanges[p];
          const { count } = await supabase
            .from('conversation_sla')
            .select('*', { count: 'exact', head: true })
            .not('resolved_at', 'is', null)
            .gte('resolved_at', start.toISOString())
            .lte('resolved_at', end.toISOString());
          resolvedCounts[p] = count ?? 0;
        }),
      ]);

      // Check each goal — all counts already in memory, no extra DB calls
      for (const goal of goals) {
        for (const period of periods) {
          const targetKey = `${period}_target` as keyof GoalConfiguration;
          const target = goal[targetKey] as number;

          if (!target || target === 0) continue;

          let current = 0;

          switch (goal.goal_type) {
            case 'messages_sent':
              current = messagesCounts[period] ?? 0;
              break;
            case 'conversations_resolved':
              current = resolvedCounts[period] ?? 0;
              break;
            case 'response_time':
              current = agentStats?.avg_response_time_seconds || 0;
              break;
            case 'satisfaction':
              current = agentStats?.customer_satisfaction_score || 0;
              break;
          }

          const achievedKey = `${goal.id}-${period}-${dateRanges[period].start.toISOString().split('T')[0]}`;

          // Check if goal was achieved
          if (current >= target && !achievedGoals.current.has(achievedKey)) {
            achievedGoals.current.add(achievedKey);

            if (!mountedRef.current) continue;

            const periodLabel = period === 'daily' ? 'diária' : period === 'weekly' ? 'semanal' : 'mensal';
            const goalLabel = getGoalLabel(goal.goal_type);

            const title = `🎯 Meta ${periodLabel} alcançada!`;
            const message = `Você atingiu sua meta de ${goalLabel}: ${current}/${target}`;

            // Create notification in database
            await createNotification(title, message, {
              goal_id: goal.id,
              goal_type: goal.goal_type,
              period,
              current,
              target
            });

            if (!mountedRef.current) continue;

            // Show toast
            toast.success(title, { description: message });

            // Play sound if enabled
            if (settings.soundEnabled && !isQuietHours()) {
              playNotificationSound('goal_achieved', settings.soundType, settings.soundVolume);
            }

            // Browser notification
            if (settings.browserNotifications) {
              showBrowserNotification(title, message);
            }
          }
        }
      }
    } catch (error) {
      log.error('Error checking goal progress:', error);
    }
  }, [user, settings, isQuietHours, createNotification]);

  // Check goals periodically
  useEffect(() => {
    if (!user) return;

    // Check immediately
    void checkGoalProgress();

    // Check every 5 minutes
    checkIntervalRef.current = setInterval(checkGoalProgress, 300000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [user, checkGoalProgress]);

  return { checkGoalProgress };
}

function getGoalLabel(goalType: string): string {
  switch (goalType) {
    case 'messages_sent':
      return 'Mensagens enviadas';
    case 'conversations_resolved':
      return 'Conversas resolvidas';
    case 'response_time':
      return 'Tempo de resposta';
    case 'satisfaction':
      return 'Satisfação';
    default:
      return goalType;
  }
}