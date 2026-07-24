// Consolidated Settings & Preferences Management Module (ETAPA 41)
// Consolidates: useUserSettings, useGlobalSettings, useWebhookViewPreferences, useOnboardingChecklist
import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
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

export function useUserSettingsManagement(userIdParam?: string) {
  // Fix: usar useAuth se userId não fornecido
  const authCtx = useAuth();
  const userId = userIdParam ?? authCtx?.user?.id;

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fix: setar loading=false quando não há userId
  useEffect(() => {
    if (!userId && mountedRef.current) setLoading(false);
  }, [userId]);

  const fetchSettings = useCallback(async () => {
    if (!userId) return;
    const id = ++fetchIdRef.current;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current && id === fetchIdRef.current) setSettings(data || null);
    } catch (err) {
      if (mountedRef.current && id === fetchIdRef.current) {
        log.error('Error fetching user settings:', err);
      }
    } finally {
      if (mountedRef.current && id === fetchIdRef.current) setLoading(false);
    }
  }, [userId]);

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      if (!userId) return;

      try {
        const { error: err } = await supabase
          .from('user_settings')
          .update(updates)
          .eq('user_id', userId);

        if (err) throw err;
        await fetchSettings();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error updating user settings:', err);
        }
      }
    },
    [userId, fetchSettings, mountedRef]
  );

  useEffect(() => {
    if (userId) fetchSettings();
  }, [userId, fetchSettings]);

  // Fix: defaults + isLoading alias
  const effectiveSettings = settings ?? { ...DEFAULT_USER_SETTINGS, user_id: userId ?? '' };
  return {
    settings: effectiveSettings,
    loading,
    isLoading: loading,
    updateSettings,
    refetch: fetchSettings,
  };
}

interface GlobalSettingRow {
  id: string;
  key: string;
  value: string;
  description?: string;
}

export function useGlobalSettingsManagement() {
  const [settingsRows, setSettingsRows] = useState<GlobalSettingRow[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useMountedRef();

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error: err } = await supabase
          .from('global_settings')
          .select('*')
          .order('key', { ascending: true });

        if (err && err.code !== 'PGRST116') throw err;
        if (mounted.current) {
          setSettingsRows(data || []);
          setSettings(data?.[0] || null);
        }
      } catch (err) {
        log.error('Error fetching global settings:', err);
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    fetchSettings();
  }, [mounted]);

  // Helper: buscar valor de um setting por key
  const getSetting = (key: string): string | null => {
    const row = settingsRows.find((r) => r.key === key);
    return row?.value ?? null;
  };

  // Helper: atualizar um setting existente
  const updateSetting = async (key: string, value: string): Promise<void> => {
    try {
      const { error } = await supabase.from('global_settings').update({ value }).eq('key', key);
      if (error) throw error;
      setSettingsRows((prev) => prev.map((r) => (r.key === key ? { ...r, value } : r)));
    } catch (err) {
      log.error('Error updating global setting:', err);
    }
  };

  // Helper: adicionar novo setting
  const addSetting = async (key: string, value: string, description?: string): Promise<void> => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .insert({ key, value, description })
        .select()
        .single();
      if (error) throw error;
      if (data) setSettingsRows((prev) => [...prev, data as GlobalSettingRow]);
    } catch (err) {
      log.error('Error adding global setting:', err);
    }
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

export function useWebhookViewPreferencesManagement(userId?: string) {
  const [preferences, setPreferences] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Unblock loading spinner when userId is not available.
  useEffect(() => {
    if (!userId && mountedRef.current) setLoading(false);
  }, [userId]);

  const fetchPreferences = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('webhook_preferences')
        .select('*')
        .eq('user_id', userId);

      if (err) throw err;
      if (mountedRef.current) setPreferences(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching webhook preferences:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) fetchPreferences();
  }, [userId, fetchPreferences]);

  return { preferences, loading, refetch: fetchPreferences };
}

export function useOnboardingChecklistManagement(userId?: string) {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Unblock loading spinner when userId is not available.
  useEffect(() => {
    if (!userId && mountedRef.current) setLoading(false);
  }, [userId]);

  const fetchSteps = useCallback(async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('onboarding_steps')
        .select('*')
        .eq('user_id', userId);

      if (err) throw err;
      if (mountedRef.current) setSteps(data || []);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching onboarding steps:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  const completeStep = useCallback(
    async (stepId: string) => {
      try {
        await supabase
          .from('onboarding_steps')
          .update({ completed: true, timestamp: new Date().toISOString() })
          .eq('id', stepId);
        await fetchSteps();
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error completing onboarding step:', err);
        }
      }
    },
    [fetchSteps, mountedRef]
  );

  useEffect(() => {
    if (userId) fetchSteps();
  }, [userId, fetchSteps]);

  return { steps, loading, completeStep, refetch: fetchSteps };
}

export type { UserSettings, GlobalSettings, OnboardingStep };
