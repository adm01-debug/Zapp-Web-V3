// Consolidated Notification & Alerts Management Module (ETAPA 38)
// Consolidates: usePushNotifications, useNotificationSettings, useTeamChatNotifications, useSecurityPushNotifications, useGoalNotifications, useTranscriptionNotifications
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';
import type { SoundType } from '@/utils/notificationSounds';

/** Sound Type Option type alias. */
export type SoundTypeOption = SoundType;

interface NotificationSettings {
  soundEnabled: boolean;
  soundType: SoundTypeOption;
  soundVolume: number;
  browserNotifications: boolean;
  desktopAlerts: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  newMessageSound: boolean;
  mentionSound: boolean;
  slaBreachSound: boolean;
  sentimentAlertEnabled: boolean;
  sentimentAlertThreshold: number;
  sentimentConsecutiveCount: number;
  autoTranscriptionEnabled: boolean;
  transcriptionNotificationEnabled: boolean;
  messageSoundType: SoundTypeOption;
  mentionSoundType: SoundTypeOption;
  slaSoundType: SoundTypeOption;
  goalSoundType: SoundTypeOption;
  transcriptionSoundType: SoundTypeOption;
}

/** Notification Payload interface definition. */
export interface NotificationPayload {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
}

/** Push Notification State interface definition. */
export interface PushNotificationState {
  permission: NotificationPermission;
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
}

const SOUND_TYPES: SoundTypeOption[] = ['beep', 'chime', 'bell', 'alert', 'soft'];

/** Coerces an unknown value to a valid SoundTypeOption, returning the fallback when the value is absent, non-string, or not in the allowed set. */
const toSoundType = (value: unknown, fallback: SoundTypeOption = 'chime'): SoundTypeOption =>
  typeof value === 'string' && SOUND_TYPES.includes(value as SoundTypeOption)
    ? (value as SoundTypeOption)
    : fallback;

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  soundType: 'chime',
  soundVolume: 70,
  browserNotifications: true,
  desktopAlerts: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  newMessageSound: true,
  mentionSound: true,
  slaBreachSound: true,
  sentimentAlertEnabled: true,
  sentimentAlertThreshold: 30,
  sentimentConsecutiveCount: 2,
  autoTranscriptionEnabled: true,
  transcriptionNotificationEnabled: true,
  messageSoundType: 'chime',
  mentionSoundType: 'bell',
  slaSoundType: 'alert',
  goalSoundType: 'chime',
  transcriptionSoundType: 'soft',
};

type UserSettingsRow = Record<string, unknown> | null;

/** Maps a raw user_settings database row (keyed by snake_case column names) to a typed NotificationSettings object, applying DEFAULT_NOTIFICATION_SETTINGS for any missing or null fields. */
const normalizeSettings = (row: UserSettingsRow): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  soundEnabled: Boolean(row?.sound_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.soundEnabled),
  browserNotifications: Boolean(
    row?.browser_notifications_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.browserNotifications
  ),
  desktopAlerts: Boolean(
    row?.browser_notifications_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.desktopAlerts
  ),
  quietHoursEnabled: Boolean(
    row?.quiet_hours_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnabled
  ),
  quietHoursStart: String(row?.quiet_hours_start ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursStart),
  quietHoursEnd: String(row?.quiet_hours_end ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnd),
  sentimentAlertEnabled: Boolean(
    row?.sentiment_alert_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.sentimentAlertEnabled
  ),
  sentimentAlertThreshold: Number(
    row?.sentiment_alert_threshold ?? DEFAULT_NOTIFICATION_SETTINGS.sentimentAlertThreshold
  ),
  sentimentConsecutiveCount: Number(
    row?.sentiment_consecutive_count ?? DEFAULT_NOTIFICATION_SETTINGS.sentimentConsecutiveCount
  ),
  autoTranscriptionEnabled: Boolean(
    row?.auto_transcription_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.autoTranscriptionEnabled
  ),
  transcriptionNotificationEnabled: Boolean(
    row?.transcription_notification_enabled ??
    DEFAULT_NOTIFICATION_SETTINGS.transcriptionNotificationEnabled
  ),
  messageSoundType: toSoundType(
    row?.message_sound_type,
    DEFAULT_NOTIFICATION_SETTINGS.messageSoundType
  ),
  mentionSoundType: toSoundType(
    row?.mention_sound_type,
    DEFAULT_NOTIFICATION_SETTINGS.mentionSoundType
  ),
  slaSoundType: toSoundType(row?.sla_sound_type, DEFAULT_NOTIFICATION_SETTINGS.slaSoundType),
  goalSoundType: toSoundType(row?.goal_sound_type, DEFAULT_NOTIFICATION_SETTINGS.goalSoundType),
  transcriptionSoundType: toSoundType(
    row?.transcription_sound_type,
    DEFAULT_NOTIFICATION_SETTINGS.transcriptionSoundType
  ),
});

/** Converts a partial NotificationSettings object to a flat snake_case record suitable for upserting into the user_settings table, omitting keys whose values are undefined. */
const toDbSettings = (settings: Partial<NotificationSettings>): Record<string, unknown> => {
  const db: Record<string, unknown> = {};
  if (settings.soundEnabled !== undefined) db.sound_enabled = settings.soundEnabled;
  if (settings.browserNotifications !== undefined)
    db.browser_notifications_enabled = settings.browserNotifications;
  if (settings.desktopAlerts !== undefined)
    db.browser_notifications_enabled = settings.desktopAlerts;
  if (settings.quietHoursEnabled !== undefined) db.quiet_hours_enabled = settings.quietHoursEnabled;
  if (settings.quietHoursStart !== undefined) db.quiet_hours_start = settings.quietHoursStart;
  if (settings.quietHoursEnd !== undefined) db.quiet_hours_end = settings.quietHoursEnd;
  if (settings.sentimentAlertEnabled !== undefined)
    db.sentiment_alert_enabled = settings.sentimentAlertEnabled;
  if (settings.sentimentAlertThreshold !== undefined)
    db.sentiment_alert_threshold = settings.sentimentAlertThreshold;
  if (settings.sentimentConsecutiveCount !== undefined)
    db.sentiment_consecutive_count = settings.sentimentConsecutiveCount;
  if (settings.autoTranscriptionEnabled !== undefined)
    db.auto_transcription_enabled = settings.autoTranscriptionEnabled;
  if (settings.transcriptionNotificationEnabled !== undefined)
    db.transcription_notification_enabled = settings.transcriptionNotificationEnabled;
  if (settings.soundType !== undefined) db.sound_type = settings.soundType;
  if (settings.messageSoundType !== undefined) db.message_sound_type = settings.messageSoundType;
  if (settings.mentionSoundType !== undefined) db.mention_sound_type = settings.mentionSoundType;
  if (settings.slaSoundType !== undefined) db.sla_sound_type = settings.slaSoundType;
  if (settings.goalSoundType !== undefined) db.goal_sound_type = settings.goalSoundType;
  if (settings.transcriptionSoundType !== undefined)
    db.transcription_sound_type = settings.transcriptionSoundType;
  return db;
};

/** App Notification interface definition. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

/** Team Chat Notification type alias. */
export type TeamChatNotification = AppNotification;

/** Manages browser push notifications with permission requests and notification sending. */
export function usePushNotificationsManagement() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsSupported('Notification' in window);
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) return;
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      return perm;
    } catch (err) {
      log.error('Error requesting notification permission:', err);
    }
  }, [isSupported]);

  const sendNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission === 'granted' && isSupported) {
        new Notification(title, options);
      }
    },
    [permission, isSupported]
  );

  const showNotification = useCallback(
    async (payload: NotificationPayload) => {
      const currentPermission = permission === 'granted' ? permission : await requestPermission();
      if (currentPermission === 'granted') {
        sendNotification(payload.title, {
          body: payload.body,
          tag: payload.tag,
          icon: payload.icon,
        });
      }
    },
    [permission, requestPermission, sendNotification]
  );

  const toggleSubscription = useCallback(async () => {
    setIsLoading(true);
    try {
      if (!isSubscribed) {
        const nextPermission = permission === 'granted' ? permission : await requestPermission();
        setIsSubscribed(nextPermission === 'granted');
      } else {
        setIsSubscribed(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSubscribed, permission, requestPermission]);

  return {
    permission,
    isSupported,
    isSubscribed,
    isLoading,
    requestPermission,
    sendNotification,
    showNotification,
    toggleSubscription,
  };
}

const NOTIFICATION_SETTINGS_KEY = (userId: string | undefined) =>
  ['notification-settings', userId] as const;

/** Fetches and updates notification preferences including email, push, and SMS settings. */
export function useNotificationSettingsManagement(userId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const resolvedUserId = userId ?? user?.id;
  const [isSaving, setIsSaving] = useState(false);

  const {
    data: settings = DEFAULT_NOTIFICATION_SETTINGS,
    isLoading: loading,
    refetch: refetchSettings,
  } = useQuery({
    queryKey: NOTIFICATION_SETTINGS_KEY(resolvedUserId),
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', resolvedUserId!)
        .maybeSingle();
      if (err && err.code !== 'PGRST116') throw err;
      return normalizeSettings(data as UserSettingsRow);
    },
    enabled: !!resolvedUserId,
    staleTime: 60_000,
  });

  const updateSettings = useCallback(
    async (updates: Partial<NotificationSettings>) => {
      if (!resolvedUserId) return;
      queryClient.setQueryData(
        NOTIFICATION_SETTINGS_KEY(resolvedUserId),
        (old: NotificationSettings | undefined) => ({
          ...(old ?? DEFAULT_NOTIFICATION_SETTINGS),
          ...updates,
        })
      );
      try {
        setIsSaving(true);
        const { error: err } = await supabase.from('user_settings').upsert(
          {
            user_id: resolvedUserId,
            ...toDbSettings(updates),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
        if (err) throw err;
        await queryClient.invalidateQueries({
          queryKey: NOTIFICATION_SETTINGS_KEY(resolvedUserId),
        });
      } catch (err) {
        log.error('Error updating notification settings:', err);
        await queryClient.invalidateQueries({
          queryKey: NOTIFICATION_SETTINGS_KEY(resolvedUserId),
        });
      } finally {
        setIsSaving(false);
      }
    },
    [resolvedUserId, queryClient]
  );

  const resetSettings = useCallback(() => {
    void updateSettings(DEFAULT_NOTIFICATION_SETTINGS);
  }, [updateSettings]);

  const isQuietHours = useCallback(() => {
    if (!settings.quietHoursEnabled) return false;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (value: string) => {
      const [hours = '0', mins = '0'] = value.split(':');
      return Number(hours) * 60 + Number(mins);
    };
    const start = toMinutes(settings.quietHoursStart);
    const end = toMinutes(settings.quietHoursEnd);
    return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  }, [settings.quietHoursEnabled, settings.quietHoursEnd, settings.quietHoursStart]);

  return {
    settings,
    loading,
    isLoading: loading,
    isSaving,
    updateSettings,
    resetSettings,
    isQuietHours,
    refetch: refetchSettings,
  };
}

/** Subscribes to real-time team chat notifications with read status tracking. */
export function useTeamChatNotificationsManagement() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  useEffect(() => {
    channelRef.current = supabase.channel('notifications:team-chat');
    channelRef.current
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'notifications' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          setNotifications((prev) => [payload.new as AppNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch(() => {});
      }
    };
  }, []);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      if (error) {
        log.error('Error marking notification as read:', error.message);
        return;
      }
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      log.error('Error marking notification as read:', err);
    }
  }, []);

  return { notifications, markAsRead };
}

/** Subscribes to real-time security alerts and suspicious activity notifications. */
export function useSecurityPushNotificationsManagement() {
  const [securityAlerts, setSecurityAlerts] = useState<AppNotification[]>([]);

  useEffect(() => {
    const channel = supabase.channel('notifications:security');
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'security_alerts' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          setSecurityAlerts((prev) => [payload.new as AppNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, []);

  return { securityAlerts };
}

/** Subscribes to real-time goal achievement and progress notifications. */
export function useGoalNotificationsManagement() {
  const [goalNotifications, setGoalNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    const channel = supabase.channel('notifications:goals');
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'goal_notifications' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          setGoalNotifications((prev) => [payload.new as AppNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, []);

  return { goalNotifications };
}

/** Subscribes to real-time transcription completion and processing status notifications. */
export function useTranscriptionNotificationsManagement() {
  const [transcriptionNotifications, setTranscriptionNotifications] = useState<AppNotification[]>(
    []
  );

  useEffect(() => {
    const channel = supabase.channel('notifications:transcription');
    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'transcription_notifications' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          setTranscriptionNotifications((prev) => [payload.new as AppNotification, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, []);

  return { transcriptionNotifications };
}

/** Re-exported module members. */
export type { NotificationSettings, AppNotification as Notification };
