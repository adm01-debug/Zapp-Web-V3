import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';
import { dbFrom } from '@/integrations/datasource/db';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export type SoundTypeOption = 'beep' | 'chime' | 'bell' | 'alert' | 'soft';

export interface NotificationSettings {
  soundEnabled: boolean;
  soundVolume: number;
  soundType: SoundTypeOption;
  browserNotifications: boolean;
  slaBreachSound: boolean;
  newMessageSound: boolean;
  mentionSound: boolean;
  desktopAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  sentimentAlertEnabled: boolean;
  sentimentAlertThreshold: number;
  sentimentConsecutiveCount: number;
  transcriptionNotificationEnabled: boolean;
  messageSoundType: SoundTypeOption;
  mentionSoundType: SoundTypeOption;
  slaSoundType: SoundTypeOption;
  goalSoundType: SoundTypeOption;
  transcriptionSoundType: SoundTypeOption;
}

export interface GoalConfiguration {
  id: string;
  goal_type: string;
  daily_target: number;
  weekly_target: number;
  monthly_target: number;
  profile_id: string | null;
  queue_id: string | null;
  is_active: boolean;
}

export interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isLoading: boolean;
}

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  requireInteraction?: boolean;
  silent?: boolean;
  vibrate?: number[];
}

export interface SecurityNotificationConfig {
  enabled: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  types: string[];
}

export interface TeamChatNotification {
  id: string;
  team_id: string;
  user_id: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export interface UseNotificationSettingsResult {
  settings: NotificationSettings;
  isLoading: boolean;
  updateSettings: (updates: Partial<NotificationSettings>) => Promise<void>;
  isQuietHours: () => boolean;
}

export interface UseGoalNotificationsResult {
  checkGoalProgress: () => Promise<void>;
}

export interface UsePushNotificationsResult {
  state: PushNotificationState;
  requestPermission: () => Promise<NotificationPermission | null>;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  sendNotification: (payload: NotificationPayload) => Promise<void>;
}

export interface UseSecurityNotificationsResult {
  config: SecurityNotificationConfig;
  updateConfig: (config: Partial<SecurityNotificationConfig>) => Promise<void>;
  sendSecurityAlert: (title: string, message: string, riskLevel: 'low' | 'medium' | 'high' | 'critical') => Promise<void>;
}

export interface UseTeamChatNotificationsResult {
  notifications: TeamChatNotification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export interface UseTranscriptionNotificationsResult {
  isEnabled: boolean;
  sendTranscriptionNotification: (title: string, message: string, transcriptionId: string) => Promise<void>;
  subscribeToTranscriptionUpdates: () => () => void;
}

type NotificationPeriod = 'daily' | 'weekly' | 'monthly';

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  soundVolume: 70,
  soundType: 'chime',
  browserNotifications: true,
  slaBreachSound: true,
  newMessageSound: true,
  mentionSound: true,
  desktopAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  sentimentAlertEnabled: true,
  sentimentAlertThreshold: 30,
  sentimentConsecutiveCount: 3,
  transcriptionNotificationEnabled: true,
  messageSoundType: 'chime',
  mentionSoundType: 'bell',
  slaSoundType: 'alert',
  goalSoundType: 'chime',
  transcriptionSoundType: 'soft',
};

const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const NOTIFICATION_SETTINGS_QUERY_KEY = 'notification-settings';

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// NOTIFICATION SETTINGS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

function mapDbToSettings(data: Record<string, unknown>): NotificationSettings {
  return {
    ...DEFAULT_SETTINGS,
    soundEnabled: (data.sound_enabled as boolean) ?? DEFAULT_SETTINGS.soundEnabled,
    quietHoursEnabled: (data.quiet_hours_enabled as boolean) ?? DEFAULT_SETTINGS.quietHoursEnabled,
    quietHoursStart: (data.quiet_hours_start as string) ?? DEFAULT_SETTINGS.quietHoursStart,
    quietHoursEnd: (data.quiet_hours_end as string) ?? DEFAULT_SETTINGS.quietHoursEnd,
    browserNotifications: (data.browser_notifications_enabled as boolean) ?? DEFAULT_SETTINGS.browserNotifications,
    sentimentAlertEnabled: (data.sentiment_alert_enabled as boolean) ?? DEFAULT_SETTINGS.sentimentAlertEnabled,
    sentimentAlertThreshold: (data.sentiment_alert_threshold as number) ?? DEFAULT_SETTINGS.sentimentAlertThreshold,
    sentimentConsecutiveCount: (data.sentiment_consecutive_count as number) ?? DEFAULT_SETTINGS.sentimentConsecutiveCount,
    transcriptionNotificationEnabled: (data.transcription_notification_enabled as boolean) ?? DEFAULT_SETTINGS.transcriptionNotificationEnabled,
    messageSoundType: (data.message_sound_type as SoundTypeOption) ?? DEFAULT_SETTINGS.messageSoundType,
    mentionSoundType: (data.mention_sound_type as SoundTypeOption) ?? DEFAULT_SETTINGS.mentionSoundType,
    slaSoundType: (data.sla_sound_type as SoundTypeOption) ?? DEFAULT_SETTINGS.slaSoundType,
    goalSoundType: (data.goal_sound_type as SoundTypeOption) ?? DEFAULT_SETTINGS.goalSoundType,
    transcriptionSoundType: (data.transcription_sound_type as SoundTypeOption) ?? DEFAULT_SETTINGS.transcriptionSoundType,
  };
}

export function useNotificationSettingsManagement(): UseNotificationSettingsResult {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings = DEFAULT_SETTINGS, isLoading } = useQuery({
    queryKey: [NOTIFICATION_SETTINGS_QUERY_KEY, user?.id],
    queryFn: async () => {
      if (!user) return DEFAULT_SETTINGS;
      const { data, error } = await supabase
        .from('user_settings')
        .select(
          'sound_enabled, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, browser_notifications_enabled, sentiment_alert_enabled, sentiment_alert_threshold, sentiment_consecutive_count, transcription_notification_enabled, message_sound_type, mention_sound_type, sla_sound_type, goal_sound_type, transcription_sound_type'
        )
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        log.warn('Failed to load notification settings:', error);
        return DEFAULT_SETTINGS;
      }
      return data ? mapDbToSettings(data as Record<string, unknown>) : DEFAULT_SETTINGS;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const updateSettings = useCallback(
    async (updates: Partial<NotificationSettings>) => {
      if (!user) return;
      queryClient.setQueryData(
        [NOTIFICATION_SETTINGS_QUERY_KEY, user.id],
        (prev: NotificationSettings | undefined) => ({ ...(prev ?? DEFAULT_SETTINGS), ...updates })
      );
      try {
        const dbUpdates: Record<string, unknown> = {};
        if ('soundEnabled' in updates) dbUpdates.sound_enabled = updates.soundEnabled;
        if ('quietHoursEnabled' in updates) dbUpdates.quiet_hours_enabled = updates.quietHoursEnabled;
        if ('quietHoursStart' in updates) dbUpdates.quiet_hours_start = updates.quietHoursStart;
        if ('quietHoursEnd' in updates) dbUpdates.quiet_hours_end = updates.quietHoursEnd;
        if ('browserNotifications' in updates) dbUpdates.browser_notifications_enabled = updates.browserNotifications;
        if ('sentimentAlertEnabled' in updates) dbUpdates.sentiment_alert_enabled = updates.sentimentAlertEnabled;
        if ('sentimentAlertThreshold' in updates) dbUpdates.sentiment_alert_threshold = updates.sentimentAlertThreshold;
        if ('sentimentConsecutiveCount' in updates) dbUpdates.sentiment_consecutive_count = updates.sentimentConsecutiveCount;
        if ('transcriptionNotificationEnabled' in updates) dbUpdates.transcription_notification_enabled = updates.transcriptionNotificationEnabled;
        if ('messageSoundType' in updates) dbUpdates.message_sound_type = updates.messageSoundType;
        if ('mentionSoundType' in updates) dbUpdates.mention_sound_type = updates.mentionSoundType;
        if ('slaSoundType' in updates) dbUpdates.sla_sound_type = updates.slaSoundType;
        if ('goalSoundType' in updates) dbUpdates.goal_sound_type = updates.goalSoundType;
        if ('transcriptionSoundType' in updates) dbUpdates.transcription_sound_type = updates.transcriptionSoundType;
        const { error } = await supabase.from('user_settings').update(dbUpdates).eq('user_id', user.id);
        if (error) throw error;
      } catch (error) {
        log.error('Failed to update notification settings:', error);
        queryClient.invalidateQueries({ queryKey: [NOTIFICATION_SETTINGS_QUERY_KEY, user.id] });
      }
    },
    [user, queryClient]
  );

  const isQuietHours = useCallback(() => {
    if (!settings.quietHoursEnabled) return false;
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const start = settings.quietHoursStart;
    const end = settings.quietHoursEnd;
    if (start < end) {
      return currentTime >= start && currentTime < end;
    }
    return currentTime >= start || currentTime < end;
  }, [settings]);

  return { settings, isLoading, updateSettings, isQuietHours };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// GOAL NOTIFICATIONS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export function useGoalNotificationsManagement(): UseGoalNotificationsResult {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettingsManagement();
  const achievedGoals = useRef<Set<string>>(new Set());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const createNotification = useCallback(
    async (
      title: string,
      message: string,
      metadata: {
        goal_id: string;
        goal_type: string;
        period: string;
        current: number;
        target: number;
      }
    ) => {
      if (!user) return;
      try {
        const jsonMetadata: Json = {
          goal_id: metadata.goal_id,
          goal_type: metadata.goal_type,
          period: metadata.period,
          current: metadata.current,
          target: metadata.target,
        };
        await supabase.from('notifications').insert([
          {
            user_id: user.id,
            title,
            message,
            type: 'goal',
            metadata: jsonMetadata,
          },
        ]);
      } catch (error) {
        log.error('Error creating notification:', error);
      }
    },
    [user]
  );

  const getDateRange = (period: NotificationPeriod) => {
    const now = new Date();
    switch (period) {
      case 'daily':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'weekly':
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        };
      case 'monthly':
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const getGoalLabel = (goalType: string): string => {
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
  };

  const checkGoalProgress = useCallback(async () => {
    if (!user) return;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!profile) return;

      const { data: goals, error: goalsError } = await supabase
        .from('goals_configurations')
        .select('*')
        .eq('is_active', true)
        .or(`profile_id.eq.${profile.id},profile_id.is.null`);
      if (goalsError || !goals || goals.length === 0) return;

      const { data: agentStats } = await supabase
        .from('agent_stats')
        .select('*')
        .eq('profile_id', profile.id)
        .maybeSingle();

      for (const goal of goals) {
        const periods: NotificationPeriod[] = ['daily', 'weekly', 'monthly'];
        for (const period of periods) {
          const targetKey = `${period}_target` as keyof GoalConfiguration;
          const target = goal[targetKey] as number;
          if (!target || target === 0) continue;

          const { start, end } = getDateRange(period);
          let current = 0;

          switch (goal.goal_type) {
            case 'messages_sent': {
              const { count } = await dbFrom('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender', 'agent')
                .eq('agent_id', profile.id)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
              current = count || 0;
              break;
            }
            case 'conversations_resolved': {
              const { count } = await supabase
                .from('conversation_sla')
                .select('*', { count: 'exact', head: true })
                .not('resolved_at', 'is', null)
                .gte('resolved_at', start.toISOString())
                .lte('resolved_at', end.toISOString());
              current = count || 0;
              break;
            }
            case 'response_time':
              current = agentStats?.avg_response_time_seconds || 0;
              break;
            case 'satisfaction':
              current = agentStats?.customer_satisfaction_score || 0;
              break;
          }

          const achievedKey = `${goal.id}-${period}-${start.toISOString().split('T')[0]}`;
          if (current >= target && !achievedGoals.current.has(achievedKey)) {
            achievedGoals.current.add(achievedKey);
            if (!mountedRef.current) continue;

            const periodLabel = period === 'daily' ? 'diária' : period === 'weekly' ? 'semanal' : 'mensal';
            const goalLabel = getGoalLabel(goal.goal_type);
            const title = `🎯 Meta ${periodLabel} alcançada!`;
            const message = `Você atingiu sua meta de ${goalLabel}: ${current}/${target}`;

            await createNotification(title, message, {
              goal_id: goal.id,
              goal_type: goal.goal_type,
              period,
              current,
              target,
            });

            if (!mountedRef.current) continue;
            toast.success(title, { description: message });

            if (settings.soundEnabled && !isQuietHours()) {
              playNotificationSound('goal_achieved', settings.goalSoundType, settings.soundVolume);
            }

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

  useEffect(() => {
    if (!user) return;
    void checkGoalProgress();
    checkIntervalRef.current = setInterval(checkGoalProgress, 300000);
    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [user, checkGoalProgress]);

  return { checkGoalProgress };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

async function waitForServiceWorkerRegistration(timeoutMs = 15_000, pollMs = 500): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) return registration;
    } catch {
      return null;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

export function usePushNotificationsManagement(): UsePushNotificationsResult {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'default',
    isSubscribed: false,
    isLoading: true,
  });

  useEffect(() => {
    let mounted = true;
    const checkSupport = async () => {
      const isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!isSupported) {
        if (mounted) setState((prev) => ({ ...prev, isSupported: false, isLoading: false }));
        return;
      }

      const permission = Notification.permission;
      if (mounted) setState((prev) => ({ ...prev, isSupported: true, permission }));

      const registration = await waitForServiceWorkerRegistration();
      if (!registration || !mounted) return;

      try {
        const subscription = await registration.pushManager.getSubscription();
        if (mounted) {
          setState((prev) => ({
            ...prev,
            isSubscribed: !!subscription,
            isLoading: false,
          }));
        }
      } catch (error) {
        log.error('Error checking push subscription:', error);
        if (mounted) setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    checkSupport();
    return () => {
      mounted = false;
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission | null> => {
    if (!('Notification' in window)) return null;
    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));
      return permission;
    } catch (error) {
      log.error('Error requesting notification permission:', error);
      return null;
    }
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    try {
      const registration = await waitForServiceWorkerRegistration();
      if (!registration) return false;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      if (subscription) {
        setState((prev) => ({ ...prev, isSubscribed: true }));
        return true;
      }
      return false;
    } catch (error) {
      log.error('Error subscribing to push notifications:', error);
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      const registration = await waitForServiceWorkerRegistration();
      if (!registration) return false;

      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        setState((prev) => ({ ...prev, isSubscribed: false }));
        return true;
      }
      return false;
    } catch (error) {
      log.error('Error unsubscribing from push notifications:', error);
      return false;
    }
  }, []);

  const sendNotification = useCallback(async (payload: NotificationPayload): Promise<void> => {
    try {
      const registration = await waitForServiceWorkerRegistration();
      if (!registration) return;
      await registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        data: payload.data,
        requireInteraction: payload.requireInteraction,
        silent: payload.silent,
        vibrate: payload.vibrate,
      });
    } catch (error) {
      log.error('Error sending notification:', error);
    }
  }, []);

  return { state, requestPermission, subscribe, unsubscribe, sendNotification };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// SECURITY NOTIFICATIONS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export function useSecurityNotificationsManagement(): UseSecurityNotificationsResult {
  const { user } = useAuth();
  const { settings } = useNotificationSettingsManagement();
  const [config, setConfig] = useState<SecurityNotificationConfig>({
    enabled: true,
    riskLevel: 'high',
    types: ['login_attempt', 'permission_change', 'data_access'],
  });

  useEffect(() => {
    if (!user) return;
    const loadConfig = async () => {
      try {
        const { data } = await supabase
          .from('security_notification_config')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data) {
          setConfig({
            enabled: data.enabled,
            riskLevel: data.risk_level,
            types: data.types || [],
          });
        }
      } catch (error) {
        log.error('Error loading security notification config:', error);
      }
    };
    loadConfig();
  }, [user]);

  const updateConfig = useCallback(
    async (updates: Partial<SecurityNotificationConfig>) => {
      if (!user) return;
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      try {
        await supabase.from('security_notification_config').upsert({
          user_id: user.id,
          enabled: newConfig.enabled,
          risk_level: newConfig.riskLevel,
          types: newConfig.types,
        });
      } catch (error) {
        log.error('Error updating security notification config:', error);
      }
    },
    [user, config]
  );

  const sendSecurityAlert = useCallback(
    async (
      title: string,
      message: string,
      riskLevel: 'low' | 'medium' | 'high' | 'critical'
    ) => {
      if (!user || !config.enabled) return;
      try {
        await supabase.from('notifications').insert([
          {
            user_id: user.id,
            title,
            message,
            type: 'security',
            metadata: { risk_level: riskLevel },
          },
        ]);

        toast.error(title, { description: message });
        if (settings.browserNotifications) {
          showBrowserNotification(title, message);
        }
      } catch (error) {
        log.error('Error sending security alert:', error);
      }
    },
    [user, config, settings]
  );

  return { config, updateConfig, sendSecurityAlert };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TEAM CHAT NOTIFICATIONS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export function useTeamChatNotificationsManagement(): UseTeamChatNotificationsResult {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<TeamChatNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const loadNotifications = async () => {
      try {
        const { data } = await supabase
          .from('team_chat_notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (data) setNotifications(data);
      } catch (error) {
        log.error('Error loading team chat notifications:', error);
      } finally {
        setLoading(false);
      }
    };
    loadNotifications();

    const channel = supabase
      .channel(`team-chat-notifications:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'team_chat_notifications' }, loadNotifications)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!user) return;
      try {
        await supabase.from('team_chat_notifications').update({ read: true }).eq('id', notificationId);
        setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));
      } catch (error) {
        log.error('Error marking notification as read:', error);
      }
    },
    [user]
  );

  const clearAll = useCallback(async () => {
    if (!user) return;
    try {
      await supabase.from('team_chat_notifications').delete().eq('user_id', user.id);
      setNotifications([]);
    } catch (error) {
      log.error('Error clearing notifications:', error);
    }
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, loading, markAsRead, clearAll };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION NOTIFICATIONS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════

export function useTranscriptionNotificationsManagement(): UseTranscriptionNotificationsResult {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettingsManagement();

  const sendTranscriptionNotification = useCallback(
    async (title: string, message: string, transcriptionId: string) => {
      if (!user || !settings.transcriptionNotificationEnabled) return;
      try {
        await supabase.from('notifications').insert([
          {
            user_id: user.id,
            title,
            message,
            type: 'transcription',
            metadata: { transcription_id: transcriptionId },
          },
        ]);

        toast.success(title, { description: message });

        if (settings.soundEnabled && !isQuietHours()) {
          playNotificationSound('transcription_complete', settings.transcriptionSoundType, settings.soundVolume);
        }

        if (settings.browserNotifications) {
          showBrowserNotification(title, message);
        }
      } catch (error) {
        log.error('Error sending transcription notification:', error);
      }
    },
    [user, settings, isQuietHours]
  );

  const subscribeToTranscriptionUpdates = useCallback(() => {
    if (!user) return () => {};

    const channel = supabase
      .channel(`transcriptions:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'zapp', table: 'transcriptions' }, (payload) => {
        if (payload.new && payload.new.status === 'completed') {
          sendTranscriptionNotification('Transcrição concluída', 'Sua transcrição foi concluída com sucesso.', payload.new.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sendTranscriptionNotification]);

  return {
    isEnabled: settings.transcriptionNotificationEnabled,
    sendTranscriptionNotification,
    subscribeToTranscriptionUpdates,
  };
}
