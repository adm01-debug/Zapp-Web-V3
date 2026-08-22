// Consolidated Settings & Preferences Management Module (ETAPA 41)
// Consolidates: useUserSettings, useGlobalSettings, useWebhookViewPreferences, useOnboardingChecklist
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { log } from '@/lib/logger';
import type { TablesUpdate } from '@/integrations/supabase/schema';

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
  // RCA 2026-08-22: divergia de useUserSettings.ts (DEFAULT_SETTINGS) e do
  // DEFAULT real da coluna no banco — auditoria pós-fix encontrou os dois
  // hooks de settings com defaults diferentes para o mesmo campo.
  global_sla_notification_message: 'Alerta SLA: Tempo limite excedido para resposta.',
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
  // G1 revalidação (onda QA15): invalidação cruzada — as mutações deste
  // módulo devem invalidar a query canônica do useUserSettings.
  const queryClient = useQueryClient();
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
      if (mountedRef.current && id === fetchIdRef.current) {
        setSettings(
          data
            ? {
                ...data,
                user_id: data.user_id ?? '',
                theme:
                  data.theme === 'light' || data.theme === 'dark' || data.theme === 'system'
                    ? data.theme
                    : 'system',
                language: data.language ?? 'pt-BR',
                // timezone/notifications_enabled não são colunas em user_settings:
                // mantém os defaults do módulo (paridade com o comportamento anterior).
                timezone: DEFAULT_USER_SETTINGS.timezone,
                notifications_enabled: DEFAULT_USER_SETTINGS.notifications_enabled,
              }
            : null
        );
      }
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
        // UserSettings tem index signature ([key: string]: unknown) — o Update
        // do PostgREST exige chaves conhecidas. Filtra undefined e passa o
        // restante como TablesUpdate (cast controlado, sem `as any`).
        const dbUpdates: TablesUpdate<'user_settings'> = {};
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined) continue;
          (dbUpdates as Record<string, unknown>)[key] = value;
        }
        const { error: err } = await supabase
          .from('user_settings')
          .update(dbUpdates)
          .eq('user_id', userId);

        if (err) throw err;
        await fetchSettings();
        // Invalida a query canônica ['user-settings', userId] do useUserSettings
        // (staleTime 2min) — sem isso o painel fica obsoleto até o TTL (A5 QA15).
        queryClient.invalidateQueries({ queryKey: ['user-settings', userId] });
      } catch (err) {
        if (mountedRef.current) {
          log.error('Error updating user settings:', err);
        }
      }
    },
    [userId, fetchSettings, mountedRef, queryClient]
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
  // Invalidação cruzada da query canônica ['global-settings'] (staleTime 5min).
  const queryClient = useQueryClient();
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
          setSettingsRows(
            (data ?? []).map((r) => ({
              id: r.id ?? '',
              key: r.key ?? '',
              value: r.value ?? '',
              description: r.description ?? undefined,
            }))
          );
          const first = data?.[0];
          setSettings(
            first
              ? {
                  ...first,
                  maintenance_mode: first.value === 'true',
                  feature_flags: {},
                  api_rate_limit: Number(first.value) || 0,
                }
              : null
          );
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
      // Invalida a query canônica ['global-settings'] (staleTime 5min).
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
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
      // Invalida a query canônica ['global-settings'] (staleTime 5min).
      queryClient.invalidateQueries({ queryKey: ['global-settings'] });
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

/**
 * WebhookPreferenceRow — espelho de zapp.webhook_preferences (migration
 * 20260715_create_missing_schema_objects.sql:243-249). A coluna `preferences`
 * é JSONB (configuração por usuário); o estado do hook é o ARRAY de linhas.
 */
interface WebhookPreferenceRow {
  id: string;
  user_id: string;
  preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export function useWebhookViewPreferencesManagement(userId?: string) {
  const [preferences, setPreferences] = useState<WebhookPreferenceRow[] | null>(null);
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
      if (mountedRef.current) {
        setPreferences(
          (data ?? []).map((r) => ({
            id: r.id ?? '',
            user_id: r.user_id ?? '',
            preferences:
              r.preferences && typeof r.preferences === 'object' && !Array.isArray(r.preferences)
                ? (r.preferences as Record<string, unknown>)
                : null,
            created_at: r.created_at ?? '',
            updated_at: r.updated_at ?? '',
          }))
        );
      }
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
      if (mountedRef.current) {
        setSteps(
          (data ?? []).map((r) => ({
            id: r.id ?? '',
            completed: r.completed ?? false,
            timestamp: r.timestamp ?? undefined,
          }))
        );
      }
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
