// Consolidated Notification & Alerts Management Module (ETAPA 38)
// Consolidates: usePushNotifications, useNotificationSettings, useTeamChatNotifications, useSecurityPushNotifications, useGoalNotifications, useTranscriptionNotifications
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

interface NotificationSettings {
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  mute_until?: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export function usePushNotificationsManagement() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

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

  return { permission, isSupported, requestPermission, sendNotification };
}

export function useNotificationSettingsManagement(userId?: string) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current) setSettings(data || null);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching notification settings:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  const updateSettings = useCallback(
    async (updates: Partial<NotificationSettings>) => {
      if (!userId || !settings) return;

      try {
        const { error: err } = await supabase
          .from('notification_settings')
          .update(updates)
          .eq('user_id', userId);

        if (err) throw err;
        await fetchSettings();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error updating notification settings:', err);
        }
      }
    },
    [userId, settings, fetchSettings, mountedRef]
  );

  useEffect(() => {
    if (userId) fetchSettings();
  }, [userId, fetchSettings]);

  return { settings, loading, updateSettings, refetch: fetchSettings };
}

export function useTeamChatNotificationsManagement() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    channelRef.current = supabase.channel('notifications:team-chat');
    channelRef.current
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload: any) => {
        setNotifications((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      channelRef.current?.unsubscribe();
    };
  }, []);

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

export function useSecurityPushNotificationsManagement() {
  const [securityAlerts, setSecurityAlerts] = useState<Notification[]>([]);

  useEffect(() => {
    const channel = supabase.channel('notifications:security');
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'security_alerts' }, (payload: any) => {
        setSecurityAlerts((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return { securityAlerts };
}

export function useGoalNotificationsManagement() {
  const [goalNotifications, setGoalNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const channel = supabase.channel('notifications:goals');
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goal_notifications' }, (payload: any) => {
        setGoalNotifications((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return { goalNotifications };
}

export function useTranscriptionNotificationsManagement() {
  const [transcriptionNotifications, setTranscriptionNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const channel = supabase.channel('notifications:transcription');
    channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transcription_notifications' }, (payload: any) => {
        setTranscriptionNotifications((prev) => [payload.new, ...prev]);
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  return { transcriptionNotifications };
}

export type { NotificationSettings, Notification };
