import { useEffect } from 'react';
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

export function useTranscriptionNotifications(options: TranscriptionNotificationsOptions = {}) {
  const {
    enabled = true,
    showToast = true,
    playSound = true,
    showBrowserNotification = true,
  } = options;

  const { settings, isQuietHours } = useNotificationSettings();

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
          const row = (payload as { new?: Record<string, unknown> })?.new;
          if (!row?.transcription) return;

          log.info('Transcription notification received');

          if (!isQuietHours()) {
            if (playSound && settings?.soundEnabled) {
              playNotificationSound();
            }
            if (showBrowserNotification && settings?.browserNotifications) {
              showBrowserNotif('Transcrição concluída', String(row.transcription ?? ''));
            }
            if (showToast && settings?.transcriptionNotificationEnabled) {
              toast({ title: 'Transcrição concluída', description: String(row.transcription ?? '') });
            }
          }
        })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, showToast, playSound, showBrowserNotification, settings, isQuietHours]);
}
