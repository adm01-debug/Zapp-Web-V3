import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { generateCorrelationId } from '@/lib/correlationId';

// Default ElevenLabs voice: Custom system voice
const DEFAULT_TTS_VOICE_ID = 'TY3h8ANhQUsJaa0Bga5F';
const DEFAULT_TTS_SPEED = 1.0;

// Validation schema for user settings - prevents invalid state mutations
const TimeFormatRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

const UserSettingsSchema = z
  .object({
    user_id: z.string().uuid(),
    business_hours_enabled: z.boolean(),
    business_hours_start: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    business_hours_end: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    work_days: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
    welcome_message: z.string().max(500).default(''),
    away_message: z.string().max(500).default(''),
    closing_message: z.string().max(500).default(''),
    auto_assignment_enabled: z.boolean(),
    auto_assignment_method: z.enum(['roundrobin', 'random', 'least_active']).default('roundrobin'),
    inactivity_timeout: z.number().min(1).max(300).default(30),
    auto_transcription_enabled: z.boolean(),
    sound_enabled: z.boolean(),
    browser_notifications_enabled: z.boolean(),
    quiet_hours_enabled: z.boolean(),
    quiet_hours_start: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    quiet_hours_end: z.string().regex(TimeFormatRegex, 'Must be HH:MM format'),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    language: z.string().default('pt-BR'),
    compact_mode: z.boolean(),
    tts_voice_id: z.string().default(DEFAULT_TTS_VOICE_ID),
    tts_speed: z.number().min(0.5).max(2.0).default(DEFAULT_TTS_SPEED),
    simulation_mode_enabled: z.boolean(),
    global_sla_warning_minutes: z.number().min(1).max(1440).default(30),
    global_sla_critical_minutes: z.number().min(1).max(1440).default(60),
    global_sla_notification_message: z
      .string()
      .max(1000)
      .default('Alerta SLA: Tempo limite excedido para resposta.'),
  })
  .refine(
    (data) => {
      const [startH, startM] = data.business_hours_start.split(':').map(Number);
      const [endH, endM] = data.business_hours_end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return startMinutes < endMinutes;
    },
    { message: 'Business hours: end time must be after start time', path: ['business_hours_end'] }
  )
  .refine(
    (data) => {
      const [startH, startM] = data.quiet_hours_start.split(':').map(Number);
      const [endH, endM] = data.quiet_hours_end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      return data.quiet_hours_enabled ? startMinutes !== endMinutes : true;
    },
    { message: 'Quiet hours: start and end times must be different', path: ['quiet_hours_end'] }
  );

// Exponential backoff retry helper for optimistic locking conflicts
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 100
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if it's a version conflict (retryable)
      if (lastError.message.includes('CONFLICT') || lastError.message.includes('version')) {
        if (attempt < maxRetries - 1) {
          const delayMs = initialDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      throw err;
    }
  }

  throw lastError || new Error('Retry failed');
}

export interface UserSettings {
  id?: string;
  user_id?: string;

  // Business hours
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  work_days: number[];

  // Messages
  welcome_message: string;
  away_message: string;
  closing_message: string;

  // Automation
  auto_assignment_enabled: boolean;
  auto_assignment_method: string;
  inactivity_timeout: number;
  auto_transcription_enabled: boolean;

  // Notifications
  sound_enabled: boolean;
  browser_notifications_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;

  // Appearance
  theme: string;
  language: string;
  compact_mode: boolean;

  // TTS
  tts_voice_id: string;
  tts_speed: number;

  // Simulation
  simulation_mode_enabled: boolean;

  // SLA
  global_sla_warning_minutes: number;
  global_sla_critical_minutes: number;
  global_sla_notification_message: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  version: 1,
  business_hours_enabled: true,
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  work_days: [1, 2, 3, 4, 5],

  welcome_message: '',
  away_message: '',
  closing_message: '',

  auto_assignment_enabled: true,
  auto_assignment_method: 'roundrobin',
  inactivity_timeout: 30,
  auto_transcription_enabled: true,

  sound_enabled: true,
  browser_notifications_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',

  theme: 'system',
  language: 'pt-BR',
  compact_mode: false,

  tts_voice_id: DEFAULT_TTS_VOICE_ID,
  tts_speed: DEFAULT_TTS_SPEED,

  simulation_mode_enabled: false,

  global_sla_warning_minutes: 30,
  global_sla_critical_minutes: 60,
  global_sla_notification_message: 'Alerta SLA: Tempo limite excedido para resposta.',
};

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

        // Check if component unmounted during fetch
        if (abortController.signal.aborted) return;

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned
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

  // Update settings locally
  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // Save settings to DB with CSRF/idempotency protection
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
          description: errorMsg,
          variant: 'destructive',
        });
        return false;
      }

      // Check for race conditions: if we already saved this ID, skip
      if (lastSaveId === saveId) {
        log.info('Ignoring duplicate save - already processed', { saveId, userId: user.id });
        return true;
      }

      // Implement optimistic locking with retry logic
      const attemptSave = async () => {
        // Call RPC function with optimistic locking
        const { data, error } = await safeClient.single<{
          success: boolean;
          version: number;
          error_code: string | null;
        }>('user_settings', (q) =>
          q.rpc('upsert_user_settings', {
            _user_id: user.id,
            _data: validationResult.data,
            _expected_version: settings.version ?? 1,
          })
        );

        if (error) {
          log.error('RPC error in upsert_user_settings', {
            userId: user.id,
            saveId,
            correlationId,
            error: error.message,
          });
          throw error;
        }

        if (!data) {
          throw new Error('No response from upsert_user_settings');
        }

        // Check if update succeeded or hit version conflict
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

      // Execute with retry logic for version conflicts
      let saveResult: { success: boolean; version: number; error_code: string | null };
      try {
        saveResult = await retryWithBackoff(attemptSave, 3, 100);
      } catch (err) {
        log.error('Settings save failed after retries', {
          userId: user.id,
          saveId,
          correlationId,
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

      // Update local state with new version
      setSettings((prev) => ({ ...prev, version: saveResult.version }));

      // Mark this save as successful
      setLastSaveId(saveId);

      log.info('Settings saved successfully', {
        userId: user.id,
        saveId,
        correlationId,
      });

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
  }, [
    user?.id,
    settings.business_hours_enabled,
    settings.business_hours_start,
    settings.business_hours_end,
    settings.work_days,
    settings.welcome_message,
    settings.away_message,
    settings.closing_message,
    settings.auto_assignment_enabled,
    settings.auto_assignment_method,
    settings.inactivity_timeout,
    settings.auto_transcription_enabled,
    settings.sound_enabled,
    settings.browser_notifications_enabled,
    settings.quiet_hours_enabled,
    settings.quiet_hours_start,
    settings.quiet_hours_end,
    settings.theme,
    settings.language,
    settings.compact_mode,
    settings.tts_voice_id,
    settings.tts_speed,
    settings.simulation_mode_enabled,
    settings.global_sla_warning_minutes,
    settings.global_sla_critical_minutes,
    settings.global_sla_notification_message,
    lastSaveId,
    pendingSaveId,
  ]);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Toggle work day
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
