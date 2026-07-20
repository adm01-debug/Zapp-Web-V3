import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useSLAAlertPreferences');

export interface SLAAlertPreferences {
  enabled: boolean;
  alert_first_response: boolean;
  alert_resolution: boolean;
  severity_warning: boolean;
  severity_breached: boolean;
}

export const DEFAULT_SLA_ALERT_PREFERENCES: SLAAlertPreferences = {
  enabled: true,
  alert_first_response: true,
  alert_resolution: true,
  severity_warning: true,
  severity_breached: true,
};

/**
 * Per-user SLA alert preferences. Stored in `public.sla_alert_preferences`
 * (RLS scoped to auth.uid()).
 *
 * Falls back gracefully to "all enabled" defaults when:
 *   - the user has no row yet
 *   - the table does not exist (ambiente Lovable/cloud preview)
 *   - qualquer outro erro de DB
 *
 * Erros 404/PGRST116/PGRST204/42P01 (relação não encontrada) são
 * tratados silenciosamente — o hook simplesmente usa os defaults.
 */
export function useSLAAlertPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['sla-alert-preferences', user?.id] as const;
  const [isSaving, setIsSaving] = useState(false);

  const { data: preferences = DEFAULT_SLA_ALERT_PREFERENCES, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<SLAAlertPreferences> => {
      const { data, error } = await safeClient.from('sla_alert_preferences', (q) =>
        q
          .select(
            'enabled, alert_first_response, alert_resolution, severity_warning, severity_breached'
          )
          .eq('user_id', user!.id)
          .limit(1)
      );

      if (error) {
        const code = (error as { code?: string })?.code ?? '';
        const msg = error?.message ?? '';
        const isTableMissing =
          code === 'PGRST116' ||
          code === 'PGRST204' ||
          code === '42P01' ||
          msg.includes('relation') ||
          msg.includes('does not exist') ||
          msg.includes('404');
        if (!isTableMissing) {
          log.warn('[useSLAAlertPreferences] Erro ao carregar preferências:', msg);
        }
        return DEFAULT_SLA_ALERT_PREFERENCES;
      }

      const row = data?.[0] ?? null;
      if (row) {
        return {
          enabled: row.enabled,
          alert_first_response: row.alert_first_response,
          alert_resolution: row.alert_resolution,
          severity_warning: row.severity_warning,
          severity_breached: row.severity_breached,
        };
      }
      return DEFAULT_SLA_ALERT_PREFERENCES;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const setPreferences = useCallback(
    (next: SLAAlertPreferences) => queryClient.setQueryData(queryKey, next),
    [queryClient, queryKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const save = useCallback(
    async (next: SLAAlertPreferences) => {
      if (!user?.id) return { error: new Error('Not authenticated') };
      setIsSaving(true);
      const { error } = await safeClient.from('sla_alert_preferences', (q) =>
        q.upsert({ user_id: user.id, ...next }, { onConflict: 'user_id' })
      );
      setIsSaving(false);
      if (!error) queryClient.setQueryData(queryKey, next);
      return { error };
    },
    [user?.id, queryClient, queryKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { preferences, setPreferences, save, isLoading, isSaving };
}
