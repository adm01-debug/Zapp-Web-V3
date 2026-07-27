import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import {
  playNotificationSound,
  showBrowserNotification as showBrowserNotif,
} from '@/utils/notificationSound';
import { toast } from '@/hooks/use-toast';

const log = getLogger('TranscriptionNotifications');

interface TranscriptionNotificationsOptions {
  enabled?: boolean;
  showToast?: boolean;
  playSound?: boolean;
  showBrowserNotification?: boolean;
}

/** Subscribes to messages transcription_status changes and notifies the user when transcription completes or fails. First-completion guard prevents duplicate toasts on re-subscription. */
export function useTranscriptionNotifications(options: TranscriptionNotificationsOptions = {}) {
  const {
    enabled = true,
    showToast = true,
    playSound = true,
    showBrowserNotification = true,
  } = options;

  const { settings, isQuietHours } = useNotificationSettings();

  // Capture unstable references in refs so the effect dep array stays stable.
  // settings and isQuietHours change reference on every render from useNotificationSettings;
  // including them in deps would tear down and recreate the Realtime channel on every render.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const isQuietHoursRef = useRef(isQuietHours);
  isQuietHoursRef.current = isQuietHours;

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase.channel('transcription-notifications');
    logMessagesSubscribe('useTranscriptionNotifications', {
      event: 'UPDATE',
      schema: 'evo',
      table: 'evolution_messages',
    });

    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },
        wrapMessagesHandler('useTranscriptionNotifications', (payload: unknown) => {
          const p = payload as { new?: Record<string, unknown>; old?: Record<string, unknown> };
          const row = p?.new;
          if (!row?.transcription) return;
          // Only fire on first completion — skip if transcription already existed before this UPDATE
          if (p?.old?.transcription) return;

          log.info('Transcription notification received');

          const currentSettings = settingsRef.current;
          if (!isQuietHoursRef.current()) {
            if (playSound && currentSettings?.soundEnabled) {
              playNotificationSound('message');
            }
            if (showBrowserNotification && currentSettings?.browserNotifications) {
              showBrowserNotif('Transcrição concluída', String(row.transcription ?? ''));
            }
            if (showToast && currentSettings?.transcriptionNotificationEnabled) {
              toast({ title: 'Transcrição concluída', description: String(row.transcription ?? '') });
            }
          }
        })
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [enabled, showToast, playSound, showBrowserNotification]);
}