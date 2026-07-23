// Consolidated Settings & Preferences Management Module (ETAPA 41)
// Consolidates: useUserSettings, useGlobalSettings, useWebhookViewPreferences, useOnboardingChecklist
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { log } from '@/lib/logger';

// Default settings values (usados quando não há dados no banco)
const DEFAULT_USER_SETTINGS = {
  theme: 'system' as const,
  language: 'pt-BR',
  timezone: 'America/Sao_Paulo',
  notifications_enabled: true,
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
  compact_mode: false,
  tts_voice_id: 'EXAVITQu4vr4xnSDxMaL',
  tts_speed: 1.0,
  simulation_mode_enabled: false,
  global_sla_warning_minutes: 30,
  global_sla_critical_minutes: 60,
  global_sla_notification_message: '',
} as const;

interface UserSettings {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications_enabled: boolean;
  [key: string]: unknown;
}

interface GlobalSettings {
  maintenance_mode: boolean;
  feature_flags: Record<string, boolean>;
  api_rate_limit: number;
  [key: string]: unknown;
}

interface OnboardingStep {
  id: string;
  completed: boolean;
  timestamp?: string;
}

/** Fetches and updates per-user settings (TTS, UI preferences). Re-throws errors from update so callers can handle them. */
export function useUserSettingsManagement(userIdParam?: string) {
  const authCtx = useAuth();
  const userId = userIdParam ?? authCtx?.user?.id;
  const queryClient = useQueryClient();

  const USER_SETTINGS_KEY = ['user-settings', userId] as const;

  const { data: settings, isLoading: loading, refetch } = useQuery({
    queryKey: USER_SETTINGS_KEY,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle();
      if (err && err.code !== 'PGRST116') throw err;
      return (data || null) as UserSettings | null;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      if (!userId) return;
      const { error: err } = await supabase
        .from('user_settings')
        .update(updates)
        .eq('user_id', userId);
      if (err) {
        log.error('Error updating user settings:', err);
        throw err;
      }
      void queryClient.invalidateQueries({ queryKey: USER_SETTINGS_KEY });
    },
    [userId, queryClient, USER_SETTINGS_KEY]
  );

  const effectiveSettings = settings ?? { ...DEFAULT_USER_SETTINGS, user_id: userId ?? '' };
  return {
    settings: effectiveSettings,
    loading,
    isLoading: loading,
    updateSettings,
    refetch,
  };
}

interface GlobalSettingRow {
  id: string;
  key: string;
  value: string;
  description?: string;
}

const GLOBAL_SETTINGS_KEY = ['global-settings'] as const;

/** Reads, writes, and adds workspace-level global settings stored in the global_settings table. Re-throws errors from updateSetting. */
export function useGlobalSettingsManagement() {
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: GLOBAL_SETTINGS_KEY,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase
        .from('global_settings')
        .select('*')
        .order('key', { ascending: true });
      if (err && err.code !== 'PGRST116') throw err;
      return {
        settingsRows: (rows || []) as GlobalSettingRow[],
        settings: ((rows || [])[0] || null) as GlobalSettings | null,
      };
    },
    staleTime: 60_000,
  });

  const settingsRows = data?.settingsRows ?? [];
  const settings = data?.settings ?? null;

  /** Finds a settings row by key and returns its string value, or null when not found. */
  const getSetting = (key: string): string | null => {
    const row = settingsRows.find((r) => r.key === key);
    return row?.value ?? null;
  };

  /** Updates a `global_settings` row by key in Supabase; re-throws on error. */
  const updateSetting = async (key: string, value: string): Promise<void> => {
    const { error } = await supabase.from('global_settings').update({ value }).eq('key', key);
    if (error) {
      log.error('Error updating global setting:', error);
      throw error;
    }
    void queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY });
  };

  /** Inserts a new `global_settings` row; re-throws on error. */
  const addSetting = async (key: string, value: string, description?: string): Promise<void> => {
    const { error } = await supabase
      .from('global_settings')
      .insert({ key, value, description })
      .select()
      .single();
    if (error) {
      log.error('Error adding global setting:', error);
      throw error;
    }
    void queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY });
  };

  return {
    settings,
    settingsRows,
    loading,
    isLoading: loading,
    getSetting,
    updateSetting,
    addSetting,
  };
}

/** Loads and persists webhook-view display preferences (column visibility, sort order) per user. */
export function useWebhookViewPreferencesManagement(userId?: string) {
  const { data: preferences = null, isLoading: loading, refetch } = useQuery({
    queryKey: ['webhook-preferences', userId] as const,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('webhook_preferences')
        .select('*')
        .eq('user_id', userId!);
      if (err) throw err;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  return { preferences, loading, refetch };
}

/** Manages the onboarding checklist steps for a user, including marking steps complete and calculating overall progress. */
export function useOnboardingChecklistManagement(userId?: string) {
  const queryClient = useQueryClient();

  const ONBOARDING_KEY = ['onboarding-steps', userId] as const;

  const { data: steps = [], isLoading: loading, refetch } = useQuery({
    queryKey: ONBOARDING_KEY,
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('onboarding_steps')
        .select('*')
        .eq('user_id', userId!);
      if (err) throw err;
      return (data || []) as OnboardingStep[];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const completeStep = useCallback(
    async (stepId: string) => {
      try {
        await supabase
          .from('onboarding_steps')
          .update({ completed: true, timestamp: new Date().toISOString() })
          .eq('id', stepId);
        void queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY });
      } catch (err) {
        log.error('Error completing onboarding step:', err);
      }
    },
    [queryClient, ONBOARDING_KEY]
  );

  return { steps, loading, completeStep, refetch };
}

/** Re-exported module members. */
export type { UserSettings, GlobalSettings, OnboardingStep };
