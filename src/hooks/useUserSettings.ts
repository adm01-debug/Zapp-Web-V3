import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface UserSettings {
  id?: string;
  user_id?: string;
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  work_days: number[];
  welcome_message: string;
  away_message: string;
  closing_message: string;
  auto_assignment_enabled: boolean;
  auto_assignment_method: string;
  inactivity_timeout: number;
  auto_transcription_enabled: boolean;
  sound_enabled: boolean;
  browser_notifications_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  theme: string;
  language: string;
  compact_mode: boolean;
  tts_voice_id: string;
  tts_speed: number;
  simulation_mode_enabled?: boolean;
  global_sla_warning_minutes?: number;
  global_sla_critical_minutes?: number;
  global_sla_notification_message?: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  business_hours_enabled: false,
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  welcome_message: '',
  away_message: '',
  closing_message: '',
  auto_assignment_enabled: true,
  auto_assignment_method: 'roundrobin',
  inactivity_timeout: 30,
  auto_transcription_enabled: false,
  sound_enabled: true,
  browser_notifications_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  theme: 'light',
  language: 'pt-BR',
  compact_mode: false,
  tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
  tts_speed: 1.0,
};

export function useUserSettings() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSettings() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user!.id)
          .limit(1);

        if (cancelled) return;

        if (error) {
          setSettings(DEFAULT_SETTINGS);
        } else {
          const row = Array.isArray(data) ? data[0] : data;
          if (row) {
            setSettings({
              ...DEFAULT_SETTINGS,
              ...row,
            });
          } else {
            setSettings(DEFAULT_SETTINGS);
          }
        }
      } catch {
        if (!cancelled) setSettings(DEFAULT_SETTINGS);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchSettings();
    return () => { cancelled = true; };
  }, [user?.id]);

  const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
    if (!user?.id) return;
    setSettings(prev => ({ ...prev, ...updates }));
    const { error } = await supabase
      .from('user_settings')
      .upsert({ ...updates, user_id: user.id }, { onConflict: 'user_id' });
    if (error) {
      setSettings(prev => ({ ...prev }));
    }
  }, [user?.id]);

  return { isLoading, settings, updateSettings };
}
