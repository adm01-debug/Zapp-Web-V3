// Consolidated Notification & Alerts Management Module (ETAPA 38)
// Consolidates: usePushNotifications, useNotificationSettings, useTeamChatNotifications, useSecurityPushNotifications, useGoalNotifications, useTranscriptionNotifications
import { useState, useEffect, useCallback, useRef } from 'react';
// useRef is kept for mountedRef usage in useNotificationSettingsManagement
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import { log } from '@/lib/logger';
import type { SoundType } from '@/utils/notificationSounds';

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

export interface NotificationPayload {
  title: string;
  body?: string;
  tag?: string;
  icon?: string;
}

export interface PushNotificationState {
  permission: NotificationPermission;
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
}

const SOUND_TYPES: SoundTypeOption[] = ['beep', 'chime', 'bell', 'alert', 'soft'];

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

const normalizeSettings = (row: UserSettingsRow): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  soundEnabled: row?.sound_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.soundEnabled,
  soundType: toSoundType(row?.sound_type, DEFAULT_NOTIFICATION_SETTINGS.soundType),
  browserNotifications:
    row?.browser_notifications_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.browserNotifications,
  desktopAlerts: row?.desktop_alerts_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.desktopAlerts,
  quietHoursEnabled: row?.quiet_hours_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnabled,
  quietHoursStart: String(row?.quiet_hours_start ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursStart),
  quietHoursEnd: String(row?.quiet_hours_end ?? DEFAULT_NOTIFICATION_SETTINGS.quietHoursEnd),
  sentimentAlertEnabled:
    row?.sentiment_alert_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.sentimentAlertEnabled,
  sentimentAlertThreshold: Number(
    row?.sentiment_alert_threshold ?? DEFAULT_NOTIFICATION_SETTINGS.sentimentAlertThreshold
  ),
  sentimentConsecutiveCount: Number(
    row?.sentiment_consecutive_count ?? DEFAULT_NOTIFICATION_SETTINGS.sentimentConsecutiveCount
  ),
  autoTranscriptionEnabled:
    row?.auto_transcription_enabled ?? DEFAULT_NOTIFICATION_SETTINGS.autoTranscriptionEnabled,
  transcriptionNotificationEnabled:
    row?.transcription_notification_enabled ??
    DEFAULT_NOTIFICATION_SETTINGS.transcriptionNotificationEnabled,
  messageSoundType: toSoundType(row?.message_sound_type, DEFAULT_NOTIFICATION_SETTINGS.messageSoundType),
  mentionSoundType: toSoundType(row?.mention_sound_type, DEFAULT_NOTIFICATION_SETTINGS.mentionSoundType),
  slaSoundType: toSoundType(row?.sla_sound_type, DEFAULT_NOTIFICATION_SETTINGS.slaSoundType),
  goalSoundType: toSoundType(row?.goal_sound_type, DEFAULT_NOTIFICATION_SETTINGS.goalSoundType),
  transcriptionSoundType: toSoundType(
    row?.transcription_sound_type,
    DEFAULT_NOTIFICATION_SETTINGS.transcriptionSoundType
  ),
});

const toDbSettings = (settings: Partial<NotificationSettings>): Record<string, unknown> => {
  const db: Record<string, unknown> = {};
  if (settings.soundEnabled !== undefined) db.sound_enabled = settings.soundEnabled;
  if (settings.browserNotifications !== undefined)
    db.browser_notifications_enabled = settings.browserNotifications;
  if (settings.desktopAlerts !== undefined) db.desktop_alerts_enabled = settings.desktopAlerts;
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

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

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

/** Fetches and updates notification preferences including email, push, and SMS settings. */
export function useNotificationSettingsManagement(userId?: string) {
  const { user } = useAuth();
  const resolvedUserId = userId ?? user?.id;
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!resolvedUserId) {
      setSettings(DEFAULT_NOTIFICATION_SETTINGS);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', resolvedUserId)
        .maybeSingle();

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current) setSettings(normalizeSettings(data as UserSettingsRow));
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching notification settings:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [resolvedUserId]);

  const updateSettings = useCallback(
    async (updates: Partial<NotificationSettings>) => {
      setSettings((prev) => ({ ...prev, ...updates }));
      if (!resolvedUserId) return;

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
        await fetchSettings();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error updating notification settings:', err);
        }
      } finally {
        if (mountedRef.current) setIsSaving(false);
      }
    },
    [resolvedUserId, fetchSettings, mountedRef]
  );

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

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
    refetch: fetchSettings,
  };
}

/** Subscribes to real-time team chat notifications with read status tracking. */
export function useTeamChatNotificationsManagement() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:team-chat:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: any) => {
          setNotifications((prev) => [payload.new, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await supabase.from('notifications').update({ read: true }).eq('id', notificationId);
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));
    } catch (err) {
      log.error('Error marking notification as read:', err);
    }
  }, []);

  return { notifications, markAsRead };
}

/** Subscribes to real-time security alerts and suspicious activity notifications. */
export function useSecurityPushNotificationsManagement() {
  const [securityAlerts, setSecurityAlerts] = useState<Notification[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel('notifications:security')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs', filter: 'action=eq.security_alert' }, (payload: any) => {
        setSecurityAlerts((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { securityAlerts };
}

/** Subscribes to real-time goal achievement and progress notifications. */
export function useGoalNotificationsManagement() {
  const [goalNotifications, setGoalNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel('notifications:goals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_goals' }, (payload: any) => {
        setGoalNotifications((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { goalNotifications };
}

/** Subscribes to real-time transcription completion and processing status notifications. */
export function useTranscriptionNotificationsManagement() {
  const [transcriptionNotifications, setTranscriptionNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel('notifications:transcription')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: 'transcription_status=eq.completed' }, (payload: any) => {
        setTranscriptionNotifications((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { transcriptionNotifications };
}

export type { NotificationSettings, Notification };
