// Hook de alertas de saúde do webhook — dados REAIS (fim da fachada).
//
// Antes: fachada com setConfig/* stub */, activeBreaches/recentAlerts fixos [],
// reloadHistory/* stub */ — o painel admin fingia saudável.
// Agora:
//  - config      → lida/salva em `zapp.global_settings` (key `webhook_health_alert_config`),
//                  com fallback para localStorage legado (loadAlertConfig) e DEFAULT.
//  - activeBreaches/recentAlerts → lidos de `warroom_alerts` (fonte real de alertas vivos:
//                  HMAC self-test, SLA, idempotência, etc.), com badge/lista refletindo
//                  o que realmente está pendente.
//  - history     → loadAlertHistory() real; reloadHistory relê o store de verdade.
// Realtime INSERT/UPDATE em warroom_alerts invalida a query de alertas ativos.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { useWebhookHealthAlertsManagement } from '@/hooks/useAlertManagement';
import {
  DEFAULT_ALERT_CONFIG,
  loadAlertConfig,
  saveAlertConfig,
  type WebhookAlertConfig,
} from '@/lib/webhookHealthAlerts';
import { loadAlertHistory, type AlertHistoryEntry } from '@/lib/alertHistory';

const log = getLogger('useWebhookHealthAlerts');

/** Chave da config de alertas na tabela real de settings (zapp.global_settings). */
const CONFIG_SETTINGS_KEY = 'webhook_health_alert_config';
/** Limite de alertas recentes exibidos (warroom_alerts). */
const ACTIVE_ALERTS_LIMIT = 20;

const QUERY_KEYS = {
  config: ['webhook-health-alert-config'] as const,
  activeAlerts: ['webhook-health-active-alerts'] as const,
};

/** Hook: Recent Alert Entry. */
export interface RecentAlertEntry {
  instance: string;
  type: 'signature_spike' | 'silence' | string;
  firedAt: string;
  reason: string;
}

interface UseWebhookHealthAlertsOptions {
  enabled?: boolean;
  config?: WebhookAlertConfig;
}

/** Linha mínima de warroom_alerts (view public → zapp.warroom_alerts). */
interface WarRoomAlertRow {
  id: string | null;
  alert_type: string | null;
  title: string | null;
  message: string | null;
  source: string | null;
  is_read: boolean | null;
  resolved_at: string | null;
  created_at: string | null;
}

/** Aplica os mesmos bounds do lib (webhookHealthAlerts.numOr) a um objeto parcial. */
function sanitizeConfig(
  raw: Partial<WebhookAlertConfig> | null | undefined
): WebhookAlertConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const num = (v: unknown, fb: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fb;
  return {
    invalidRatePct: num(raw.invalidRatePct, DEFAULT_ALERT_CONFIG.invalidRatePct, 0, 100),
    minSampleSize: num(raw.minSampleSize, DEFAULT_ALERT_CONFIG.minSampleSize, 0, 10_000),
    silenceMinutes: num(raw.silenceMinutes, DEFAULT_ALERT_CONFIG.silenceMinutes, 1, 1440),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_ALERT_CONFIG.enabled,
  };
}

/** Parseia o JSON persistido em global_settings com tolerância a corrupção. */
function parseStoredConfig(raw: string | null | undefined): WebhookAlertConfig | null {
  if (!raw) return null;
  try {
    return sanitizeConfig(JSON.parse(raw) as Partial<WebhookAlertConfig> | null);
  } catch {
    return null;
  }
}

/** Persiste a config: zapp.global_settings (fonte de verdade) + espelho localStorage. */
async function persistConfig(c: WebhookAlertConfig): Promise<void> {
  const value = JSON.stringify(c);
  try {
    const { data: existing, error: selErr } = await supabase
      .from('global_settings')
      .select('id')
      .eq('key', CONFIG_SETTINGS_KEY)
      .maybeSingle();
    if (selErr) {
      log.warn('global_settings lookup falhou; mantendo apenas localStorage', selErr);
      saveAlertConfig(c);
      return;
    }
    const { error: writeErr } = existing?.id
      ? await supabase
          .from('global_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', CONFIG_SETTINGS_KEY)
      : await supabase.from('global_settings').insert({
          key: CONFIG_SETTINGS_KEY,
          value,
          description: 'Webhook health alert thresholds (useWebhookHealthAlerts)',
        });
    if (writeErr) {
      log.warn('global_settings write falhou; fallback localStorage', writeErr);
      saveAlertConfig(c);
      return;
    }
  } catch (err) {
    log.warn('persistConfig exceção; fallback localStorage', err);
  }
  // Espelho local (resiliência offline / leitura legada).
  saveAlertConfig(c);
}

/** Converte warroom_alerts → RecentAlertEntry (UI dos painéis de alerta). */
function toRecentAlert(row: WarRoomAlertRow): RecentAlertEntry {
  const src = row.source ?? '';
  const hmacMatch = src.match(/^hmac-selftest:(.+)$/);
  const instance = hmacMatch?.[1] ?? (src || 'webhook');
  const type = hmacMatch ? ('signature_spike' as const) : ('silence' as const);
  const reason = row.message ?? row.title ?? `${type} — ${instance}`;
  return {
    instance,
    type,
    firedAt: row.created_at ?? new Date().toISOString(),
    reason,
  };
}

/** Hook: use Webhook Health Alerts. */
export function useWebhookHealthAlerts(options: UseWebhookHealthAlertsOptions = {}) {
  const queryClient = useQueryClient();
  const enabled = options.enabled !== false;

  const { alerts, loading, acknowledgeAlert, checkHealth } = useWebhookHealthAlertsManagement();

  // ── Config real: zapp.global_settings → localStorage legado → DEFAULT ──────────
  const configQuery = useQuery({
    queryKey: QUERY_KEYS.config,
    queryFn: async (): Promise<WebhookAlertConfig> => {
      const { data, error } = await supabase
        .from('global_settings')
        .select('value')
        .eq('key', CONFIG_SETTINGS_KEY)
        .maybeSingle();
      if (!error) {
        const stored = parseStoredConfig(data?.value ?? null);
        if (stored) return stored;
      } else {
        log.error('Falha ao ler config de alertas (global_settings)', error);
      }
      // Fallback: config salva no localStorage antes da migração para o banco.
      const legacy = loadAlertConfig();
      if (legacy) return legacy;
      return { ...DEFAULT_ALERT_CONFIG };
    },
    enabled,
    staleTime: 60_000,
  });

  const config = options.config ?? configQuery.data ?? DEFAULT_ALERT_CONFIG;

  const setConfig = useCallback(
    (next: WebhookAlertConfig) => {
      const sanitized = sanitizeConfig(next) ?? { ...DEFAULT_ALERT_CONFIG };
      // Otimista: atualiza o cache imediatamente; a UI responde na hora.
      queryClient.setQueryData(QUERY_KEYS.config, sanitized);
      void persistConfig(sanitized);
    },
    [queryClient]
  );

  // ── Alertas reais: warroom_alerts (fonte viva de alertas do war room) ──────────
  const activeAlertsQuery = useQuery({
    queryKey: QUERY_KEYS.activeAlerts,
    queryFn: async (): Promise<WarRoomAlertRow[]> => {
      const { data, error } = await supabase
        .from('warroom_alerts')
        .select('id, alert_type, title, message, source, is_read, resolved_at, created_at')
        .order('created_at', { ascending: false })
        .limit(ACTIVE_ALERTS_LIMIT);
      if (error) {
        log.error('Falha ao ler warroom_alerts (webhook health)', error);
        return [];
      }
      return (data ?? []) as WarRoomAlertRow[];
    },
    enabled,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  // Realtime: novo alerta (ex.: HMAC self-test falhou) aparece na hora no painel.
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`webhook-health-alerts:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'warroom_alerts' },
        () => {
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activeAlerts });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'zapp', table: 'warroom_alerts' },
        () => {
          void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.activeAlerts });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  const activeRows = useMemo(() => activeAlertsQuery.data ?? [], [activeAlertsQuery.data]);

  // Violações ativas = alertas reais não lidos e não resolvidos.
  const activeBreaches = useMemo(
    () => activeRows.filter((r) => r.is_read === false && r.resolved_at == null).map(toRecentAlert),
    [activeRows]
  );

  // Últimos alertas disparados (qualquer estado) — lista real do war room.
  const recentAlerts = useMemo(() => activeRows.map(toRecentAlert), [activeRows]);

  // ── Histórico real: lib alertHistory (localStorage) + reload de verdade ────────
  const [history, setHistory] = useState<AlertHistoryEntry[]>(() => loadAlertHistory());
  const reloadHistory = useCallback(() => {
    setHistory(loadAlertHistory());
  }, []);

  return {
    config,
    setConfig,
    activeBreaches,
    recentAlerts,
    history,
    reloadHistory,
    isPolling: loading,
    alerts,
    acknowledgeAlert,
    checkHealth,
  };
}
