import { useCallback, useEffect, useState } from 'react';
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
  const [preferences, setPreferences] = useState<SLAAlertPreferences>(
    DEFAULT_SLA_ALERT_PREFERENCES
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    void safeClient
      .from('sla_alert_preferences', (q) =>
        q
          .select(
            'enabled, alert_first_response, alert_resolution, severity_warning, severity_breached'
          )
          .eq('user_id', user.id)
          .limit(1)
      )
      .then(({ data, error }) => {
        if (cancelled) return;

        if (error) {
          // Codigos que indicam tabela inexistente (ambiente sem migration)
          // ou linha não encontrada: tratar como defaults silenciosamente.
          // safeClient wraps errors to standard Error — check message only.
          const msg = error?.message ?? '';
          const isTableMissing =
            msg.includes('relation') ||
            msg.includes('does not exist') ||
            msg.includes('Recurso indisponível') ||
            msg.includes('não disponível') ||
            msg.includes('404');

          if (!isTableMissing) {
            log.warn('[useSLAAlertPreferences] Erro ao carregar preferências:', msg);
          }
          // Em qualquer caso de erro: manter defaults (já é o estado inicial).
          setIsLoading(false);
          return;
        }

        const row = data?.[0] ?? null;
        if (row) {
          setPreferences({
            enabled: row.enabled,
            alert_first_response: row.alert_first_response,
            alert_resolution: row.alert_resolution,
            severity_warning: row.severity_warning,
            severity_breached: row.severity_breached,
          });
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const save = useCallback(
    async (next: SLAAlertPreferences) => {
      if (!user?.id) return { error: new Error('Not authenticated') };
      setIsSaving(true);
      const { error } = await safeClient.from('sla_alert_preferences', (q) =>
        q.upsert({ user_id: user.id, ...next }, { onConflict: 'user_id' })
      );
      setIsSaving(false);
      if (!error) setPreferences(next);
      return { error };
    },
    [user?.id]
  );

  return { preferences, setPreferences, save, isLoading, isSaving };
}
