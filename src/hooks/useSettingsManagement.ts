// Consolidated Settings & Preferences Management Module (ETAPA 41)
// Consolidates: useUserSettings, useGlobalSettings, useWebhookViewPreferences, useOnboardingChecklist
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

interface UserSettings {
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  notifications_enabled: boolean;
  [key: string]: any;
}

interface GlobalSettings {
  maintenance_mode: boolean;
  feature_flags: Record<string, boolean>;
  api_rate_limit: number;
  [key: string]: any;
}

interface OnboardingStep {
  id: string;
  completed: boolean;
  timestamp?: string;
}

export function useUserSettingsManagement(userId?: string) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
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
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (err && err.code !== 'PGRST116') throw err;
      if (mountedRef.current) setSettings(data || null);
    } catch (err) {
      if (mountedRef.current) {
        log.error('Error fetching user settings:', err);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
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

  return { settings, loading, updateSettings, refetch: fetchSettings };
}

export function useGlobalSettingsManagement() {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error: err } = await supabase
          .from('global_settings')
          .select('*')
          .limit(1)
          .single();

        if (err && err.code !== 'PGRST116') throw err;
        setSettings(data || null);
      } catch (err) {
        log.error('Error fetching global settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  return { settings, loading };
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
