import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { getLogger } from '@/lib/logger';
import { QUERY_STALE_TIMES, QUERY_GC_TIMES } from '@/lib/queryStaleTimes';

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
  const userId = user?.id;
  const queryKey = useMemo(() => ['sla-alert-preferences', userId] as const, [userId]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: preferences = DEFAULT_SLA_ALERT_PREFERENCES, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<SLAAlertPreferences> => {
      if (!user) throw new Error('Usuário não autenticado');
      const { data, error } = await safeClient.from<SLAAlertPreferences>(
        'sla_alert_preferences',
        (q) =>
          q
            .select(
              'enabled, alert_first_response, alert_resolution, severity_warning, severity_breached'
            )
            .eq('user_id', user.id)
            .limit(1)
      );

      if (error) {
        const code = (error as { code?: string })?.code ?? '';
        const msg = (error as { message?: string })?.message ?? '';
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

      const rows = (data ?? []) as Partial<SLAAlertPreferences>[];
      const row = rows[0];
      if (row) {
        return {
          enabled: row.enabled ?? DEFAULT_SLA_ALERT_PREFERENCES.enabled,
          alert_first_response:
            row.alert_first_response ?? DEFAULT_SLA_ALERT_PREFERENCES.alert_first_response,
          alert_resolution: row.alert_resolution ?? DEFAULT_SLA_ALERT_PREFERENCES.alert_resolution,
          severity_warning: row.severity_warning ?? DEFAULT_SLA_ALERT_PREFERENCES.severity_warning,
          severity_breached:
            row.severity_breached ?? DEFAULT_SLA_ALERT_PREFERENCES.severity_breached,
        };
      }
      return DEFAULT_SLA_ALERT_PREFERENCES;
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIMES.slaAlertPreferences,
    gcTime: QUERY_GC_TIMES.slaAlertPreferences,
  });

  const setPreferences = useCallback(
    (next: SLAAlertPreferences) => queryClient.setQueryData(queryKey, next),
    [queryClient, queryKey]
  );

  const save = useCallback(
    async (next: SLAAlertPreferences) => {
      if (!userId) return { error: new Error('Not authenticated') };
      setIsSaving(true);
      const { error } = await safeClient.from('sla_alert_preferences', (q) =>
        q.upsert({ user_id: userId, ...next }, { onConflict: 'user_id' })
      );
      setIsSaving(false);
      if (!error) queryClient.setQueryData(queryKey, next);
      return { error };
    },
    [userId, queryClient, queryKey]
  );

  return { preferences, setPreferences, save, isLoading, isSaving };
}
