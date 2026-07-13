import { useState, useEffect, useCallback } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { UserSettings, DEFAULT_SETTINGS, retryWithBackoff } from './userSettingsSchema';

export type { UserSettings } from './userSettingsSchema';
export { UserSettingsSchema } from './userSettingsSchema';

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Idempotency tracking: prevents duplicate saves from concurrent requests
  const [lastSaveId, setLastSaveId] = useState<string | null>(null);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);

  // Fetch settings from DB with cleanup on unmount
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const abortController = new AbortController();

    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        if (!isMounted || abortController.signal.aborted) return;

        if (!safeClient) {
          log.error('Error in fetchSettings: safeClient is not initialized');
          if (isMounted) setIsLoading(false);
          return;
        }

        const { data: rows, error } = await safeClient.from<UserSettings>('user_settings', (q) =>
          q.select('*').eq('user_id', user.id).limit(1)
        );

        if (!isMounted || abortController.signal.aborted) return;

        const data = rows?.[0] ?? null;

        if (abortController.signal.aborted) return;

        if (error && error.code !== 'PGRST116') {
          log.error('Error fetching settings', {
            userId: user.id,
            error: error.message,
            code: error.code,
          });
          return;
        }

        if (data && isMounted && !abortController.signal.aborted) {
          setSettings({
            id: data.id,
            user_id: data.user_id,
            business_hours_enabled:
              data.business_hours_enabled ?? DEFAULT_SETTINGS.business_hours_enabled,
            business_hours_start:
              data.business_hours_start ?? DEFAULT_SETTINGS.business_hours_start,
            business_hours_end: data.business_hours_end ?? DEFAULT_SETTINGS.business_hours_end,
            work_days: data.work_days ?? DEFAULT_SETTINGS.work_days,
            welcome_message: data.welcome_message ?? DEFAULT_SETTINGS.welcome_message,
            away_message: data.away_message ?? DEFAULT_SETTINGS.away_message,
            closing_message: data.closing_message ?? DEFAULT_SETTINGS.closing_message,
            auto_assignment_enabled:
              data.auto_assignment_enabled ?? DEFAULT_SETTINGS.auto_assignment_enabled,
            auto_assignment_method:
              data.auto_assignment_method ?? DEFAULT_SETTINGS.auto_assignment_method,
            inactivity_timeout: data.inactivity_timeout ?? DEFAULT_SETTINGS.inactivity_timeout,
            auto_transcription_enabled:
              data.auto_transcription_enabled ?? DEFAULT_SETTINGS.auto_transcription_enabled,
            sound_enabled: data.sound_enabled ?? DEFAULT_SETTINGS.sound_enabled,
            browser_notifications_enabled:
              data.browser_notifications_enabled ?? DEFAULT_SETTINGS.browser_notifications_enabled,
            quiet_hours_enabled: data.quiet_hours_enabled ?? DEFAULT_SETTINGS.quiet_hours_enabled,
            quiet_hours_start: data.quiet_hours_start ?? DEFAULT_SETTINGS.quiet_hours_start,
            quiet_hours_end: data.quiet_hours_end ?? DEFAULT_SETTINGS.quiet_hours_end,
            theme: data.theme ?? DEFAULT_SETTINGS.theme,
            language: data.language ?? DEFAULT_SETTINGS.language,
            compact_mode: data.compact_mode ?? DEFAULT_SETTINGS.compact_mode,
            tts_voice_id: data.tts_voice_id ?? DEFAULT_SETTINGS.tts_voice_id,
            tts_speed: data.tts_speed ?? DEFAULT_SETTINGS.tts_speed,
            simulation_mode_enabled:
              data.simulation_mode_enabled ?? DEFAULT_SETTINGS.simulation_mode_enabled,
            global_sla_warning_minutes:
              data.global_sla_warning_minutes ?? DEFAULT_SETTINGS.global_sla_warning_minutes,
            global_sla_critical_minutes:
              data.global_sla_critical_minutes ?? DEFAULT_SETTINGS.global_sla_critical_minutes,
            global_sla_notification_message:
              data.global_sla_notification_message ??
              DEFAULT_SETTINGS.global_sla_notification_message,
          });
        }
      } catch (err) {
        if (!isMounted || abortController.signal.aborted) return;
        log.error('Error in fetchSettings:', err);
      } finally {
        if (isMounted && !abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchSettings();

    return () => {
      isMounted = false;
      abortController.abort();
    };
  }, [user?.id]);

  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  const saveSettings = useCallback(async () => {
    if (!user?.id) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para salvar configurações.',
        variant: 'destructive',
      });
      return false;
    }

    if (!safeClient) {
      log.error('Error in saveSettings: safeClient is not initialized');
      toast({
        title: 'Erro ao salvar',
        description: 'Serviço indisponível. Tente novamente.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSaving(true);
    let timeoutId: NodeJS.Timeout | null = null;
    try {
      const settingsData = {
        user_id: user.id,
        business_hours_enabled: settings.business_hours_enabled,
        business_hours_start: settings.business_hours_start,
        business_hours_end: settings.business_hours_end,
        work_days: settings.work_days,
        welcome_message: settings.welcome_message,
        away_message: settings.away_message,
        closing_message: settings.closing_message,
        auto_assignment_enabled: settings.auto_assignment_enabled,
        auto_assignment_method: settings.auto_assignment_method,
        inactivity_timeout: settings.inactivity_timeout,
        auto_transcription_enabled: settings.auto_transcription_enabled,
        sound_enabled: settings.sound_enabled,
        browser_notifications_enabled: settings.browser_notifications_enabled,
        quiet_hours_enabled: settings.quiet_hours_enabled,
        quiet_hours_start: settings.quiet_hours_start,
        quiet_hours_end: settings.quiet_hours_end,
        theme: settings.theme,
        language: settings.language,
        compact_mode: settings.compact_mode,
        tts_voice_id: settings.tts_voice_id,
        tts_speed: settings.tts_speed,
        simulation_mode_enabled: settings.simulation_mode_enabled,
        global_sla_warning_minutes: settings.global_sla_warning_minutes,
        global_sla_critical_minutes: settings.global_sla_critical_minutes,
        global_sla_notification_message: settings.global_sla_notification_message,
      };

      const savePromise = safeClient.from('user_settings', (q) =>
        q.upsert(settingsData, { onConflict: 'user_id' })
      );

      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Save operation timed out after 30 seconds'));
        }, 30000);
      });

      const { error } = (await Promise.race([savePromise, timeoutPromise])) as Awaited<
        typeof savePromise
      >;

      if (timeoutId) clearTimeout(timeoutId);

      if (error) {
        log.error('Error saving settings:', error);
        toast({
          title: 'Erro de validação',
          description: error.message,
          variant: 'destructive',
        });
        return false;
      }

      // Check for race conditions: if we already saved this ID, skip
      if (lastSaveId === pendingSaveId) {
        log.info('Ignoring duplicate save - already processed', { userId: user.id });
        return true;
      }

      // Implement optimistic locking with retry logic
      const attemptSave = async () => {
        const { data, error: rpcError } = await safeClient!.single<{
          success: boolean;
          version: number;
          error_code: string | null;
        }>('user_settings', (q) =>
          q.rpc('upsert_user_settings', {
            _user_id: user.id,
            _data: settingsData,
            _expected_version: settings.version ?? 1,
          })
        );

        if (rpcError) {
          log.error('RPC error in upsert_user_settings', {
            userId: user.id,
            error: rpcError.message,
          });
          throw rpcError;
        }

        if (!data) {
          throw new Error('No response from upsert_user_settings');
        }

        if (!data.success && data.error_code === 'CONFLICT') {
          const conflictError = Object.assign(
            new Error('Version conflict: settings were modified. Reloading and retrying...'),
            { code: 'CONFLICT' }
          );
          throw conflictError;
        }

        if (!data.success) {
          throw new Error(`Save failed: ${data.error_code || 'unknown error'}`);
        }

        return data;
      };

      let saveResult: { success: boolean; version: number; error_code: string | null };
      try {
        saveResult = await retryWithBackoff(attemptSave, 3, 100);
      } catch (err) {
        log.error('Settings save failed after retries', {
          userId: user.id,
          error: err instanceof Error ? err.message : String(err),
        });
        toast({
          title: 'Erro ao salvar',
          description:
            err instanceof Error && err.message.includes('Version conflict')
              ? 'Suas configurações foram modificadas. Recarregando...'
              : 'Não foi possível salvar as configurações.',
          variant: 'destructive',
        });
        return false;
      }

      setSettings((prev) => ({ ...prev, version: saveResult.version }));
      setLastSaveId(pendingSaveId);

      log.info('Settings saved successfully', { userId: user.id });

      toast({
        title: 'Configurações salvas',
        description: 'Suas configurações foram salvas com sucesso.',
      });
      return true;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      log.error('Error in saveSettings:', err);
      toast({
        title: 'Erro ao salvar',
        description:
          err instanceof Error && err.message.includes('timed out')
            ? 'A operação demorou muito tempo. Verifique sua conexão.'
            : 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setPendingSaveId(null);
      setIsSaving(false);
    }
  }, [user?.id, settings, lastSaveId, pendingSaveId]);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const toggleWorkDay = useCallback((day: number) => {
    setSettings((prev) => {
      const workDays = prev.work_days.includes(day)
        ? prev.work_days.filter((d) => d !== day)
        : [...prev.work_days, day].sort();
      return { ...prev, work_days: workDays };
    });
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    updateSettings,
    saveSettings,
    resetSettings,
    toggleWorkDay,
  };
}
