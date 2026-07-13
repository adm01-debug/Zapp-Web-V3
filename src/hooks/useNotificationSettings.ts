// Re-export from consolidated useNotificationManagement module (ETAPA 38 consolidation)
import { useNotificationSettingsManagement } from '@/hooks/useNotificationManagement';
import type { NotificationSettings, SoundTypeOption } from '@/hooks/useNotificationManagement';

export type { NotificationSettings, SoundTypeOption };

export const useNotificationSettings = () => {
  return useNotificationSettingsManagement();
}
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (error) throw error;
      }
    } catch (error) {
      log.warn('Failed to save notification settings:', error);
      // Rollback optimistic update
      queryClient.invalidateQueries({ queryKey: [NOTIFICATION_SETTINGS_QUERY_KEY, user.id] });
    }
  }, [user, queryClient]);

  const resetSettings = useCallback(async () => {
    if (!user) return;

    queryClient.setQueryData([NOTIFICATION_SETTINGS_QUERY_KEY, user.id], DEFAULT_SETTINGS);

    try {
      await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          sound_enabled: DEFAULT_SETTINGS.soundEnabled,
          quiet_hours_enabled: DEFAULT_SETTINGS.quietHoursEnabled,
          quiet_hours_start: DEFAULT_SETTINGS.quietHoursStart,
          quiet_hours_end: DEFAULT_SETTINGS.quietHoursEnd,
          browser_notifications_enabled: DEFAULT_SETTINGS.browserNotifications,
          sentiment_alert_enabled: DEFAULT_SETTINGS.sentimentAlertEnabled,
          sentiment_alert_threshold: DEFAULT_SETTINGS.sentimentAlertThreshold,
          transcription_notification_enabled: DEFAULT_SETTINGS.transcriptionNotificationEnabled,
          sentiment_consecutive_count: DEFAULT_SETTINGS.sentimentConsecutiveCount,
          message_sound_type: DEFAULT_SETTINGS.messageSoundType,
          mention_sound_type: DEFAULT_SETTINGS.mentionSoundType,
          sla_sound_type: DEFAULT_SETTINGS.slaSoundType,
          goal_sound_type: DEFAULT_SETTINGS.goalSoundType,
          transcription_sound_type: DEFAULT_SETTINGS.transcriptionSoundType,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (error) {
      log.warn('Failed to reset notification settings:', error);
    }
  }, [user, queryClient]);

  // Check if currently in quiet hours
  const isQuietHours = useCallback(() => {
    if (!settings.quietHoursEnabled) return false;

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = settings.quietHoursStart.split(':').map(Number);
    const [endH, endM] = settings.quietHoursEnd.split(':').map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentTime >= startMinutes || currentTime < endMinutes;
    }

    return currentTime >= startMinutes && currentTime < endMinutes;
  }, [settings.quietHoursEnabled, settings.quietHoursStart, settings.quietHoursEnd]);

  return {
    settings,
    updateSettings,
    resetSettings,
    isQuietHours,
    isLoading,
    isSaving,
  };
};
