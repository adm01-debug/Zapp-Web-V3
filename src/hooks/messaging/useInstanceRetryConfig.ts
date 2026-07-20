import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('useInstanceRetryConfig');
import {
  loadRetryConfig,
  invalidateRetryConfigCache,
  clampToRange,
  settingKeyFor,
  validateRetryConfig,
  hasRetryConfigErrors,
  RetryConfigValidationError,
  DEFAULT_RETRY_CONFIG,
  RETRY_CONFIG_FIELDS,
  type RetryConfig,
} from '@/lib/retryConfig';

const GLOBAL = '_global';

const RETRY_CONFIG_KEY = (instanceName: string) =>
  ['instance-retry-config', instanceName] as const;

/** Use Instance Retry Config Result interface definition. */
export interface UseInstanceRetryConfigResult {
  config: RetryConfig;
  globalConfig: RetryConfig;
  isLoading: boolean;
  isSaving: boolean;
  hasInstanceOverride: boolean;
  reload: () => Promise<void>;
  save: (partial: Partial<RetryConfig>) => Promise<void>;
  resetToGlobal: () => Promise<void>;
  resetToDefault: () => Promise<void>;
}

/**
 * Lê + grava overrides de retry para uma instância (ou global se '_global'/undefined).
 * Persistência em `global_settings` via upsert/delete por chave.
 */
export function useInstanceRetryConfig(
  instanceName: string = GLOBAL
): UseInstanceRetryConfigResult {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: RETRY_CONFIG_KEY(instanceName),
    queryFn: async () => {
      invalidateRetryConfigCache(instanceName);
      const [resolved, global] = await Promise.all([
        loadRetryConfig(instanceName === GLOBAL ? undefined : instanceName),
        loadRetryConfig(),
      ]);

      let hasInstanceOverride = false;
      if (instanceName !== GLOBAL) {
        const keys = RETRY_CONFIG_FIELDS.map((f) => settingKeyFor(f, instanceName));
        const { data: rows } = await supabase.from('global_settings').select('key').in('key', keys);
        hasInstanceOverride = (rows?.length ?? 0) > 0;
      }

      return { config: resolved, globalConfig: global, hasInstanceOverride };
    },
    staleTime: 60_000,
  });

  const config: RetryConfig = data?.config ?? DEFAULT_RETRY_CONFIG;
  const globalConfig: RetryConfig = data?.globalConfig ?? DEFAULT_RETRY_CONFIG;
  const hasInstanceOverride = data?.hasInstanceOverride ?? false;

  const invalidateAndReload = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: RETRY_CONFIG_KEY(instanceName) });
  }, [queryClient, instanceName]);

  const save = useCallback(
    async (partial: Partial<RetryConfig>) => {
      setIsSaving(true);
      try {
        const clampedPartial: Partial<RetryConfig> = {};
        for (const [field, value] of Object.entries(partial)) {
          if (value == null || !Number.isFinite(value as number)) continue;
          clampedPartial[field as keyof RetryConfig] = clampToRange(
            field as keyof RetryConfig,
            value as number
          );
        }
        const projected: RetryConfig = { ...config, ...clampedPartial };
        const errors = validateRetryConfig(projected);
        if (hasRetryConfigErrors(errors)) {
          const err = new RetryConfigValidationError(errors);
          toast.error(err.message);
          throw err;
        }

        const rows = Object.entries(clampedPartial).map(([field, value]) => ({
          key: settingKeyFor(field as keyof RetryConfig, instanceName),
          value: String(value),
          description:
            instanceName === GLOBAL
              ? `Retry global: ${field}`
              : `Retry override para instância ${instanceName}: ${field}`,
        }));
        if (rows.length === 0) return;

        const { error } = await supabase
          .from('global_settings')
          .upsert(rows, { onConflict: 'key' });
        if (error) throw error;

        invalidateRetryConfigCache(instanceName === GLOBAL ? undefined : instanceName);
        await invalidateAndReload();
        toast.success('Configuração de retry salva');
      } catch (err) {
        if (err instanceof RetryConfigValidationError) throw err;
        log.error('[useInstanceRetryConfig] save failed', err);
        toast.error('Falha ao salvar configuração');
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [instanceName, invalidateAndReload, config]
  );

  const resetToGlobal = useCallback(async () => {
    if (instanceName === GLOBAL) return;
    setIsSaving(true);
    try {
      const keys = RETRY_CONFIG_FIELDS.map((f) => settingKeyFor(f, instanceName));
      const { error } = await supabase.from('global_settings').delete().in('key', keys);
      if (error) throw error;
      invalidateRetryConfigCache(instanceName);
      await invalidateAndReload();
      toast.success('Override removido — herdando do global');
    } catch (err) {
      log.error('[useInstanceRetryConfig] resetToGlobal failed', err);
      toast.error('Falha ao restaurar global');
    } finally {
      setIsSaving(false);
    }
  }, [instanceName, invalidateAndReload]);

  const resetToDefault = useCallback(async () => {
    if (instanceName !== GLOBAL) return;
    setIsSaving(true);
    try {
      const keys = RETRY_CONFIG_FIELDS.map((f) => settingKeyFor(f));
      const { error } = await supabase.from('global_settings').delete().in('key', keys);
      if (error) throw error;
      invalidateRetryConfigCache();
      await invalidateAndReload();
      toast.success('Configuração restaurada ao padrão de fábrica');
    } catch (err) {
      log.error('[useInstanceRetryConfig] resetToDefault failed', err);
      toast.error('Falha ao restaurar default');
    } finally {
      setIsSaving(false);
    }
  }, [instanceName, invalidateAndReload]);

  const reload = useCallback(async () => {
    await invalidateAndReload();
  }, [invalidateAndReload]);

  return {
    config,
    globalConfig,
    isLoading,
    isSaving,
    hasInstanceOverride,
    reload,
    save,
    resetToGlobal,
    resetToDefault,
  };
}
