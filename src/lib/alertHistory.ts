/**
 * alertHistory — persistência (localStorage) do histórico de alertas
 * disparados, para auditoria de degradações.
 *
 * Mantém até MAX_HISTORY entradas, ordenadas do mais recente ao mais antigo.
 * Severidade derivada do tipo + valor observado vs threshold.
 */
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';
import type { WebhookAlertBreach, WebhookAlertConfig } from '@/lib/webhookHealthAlerts';

/** Severity classification for a triggered alert based on observed vs threshold ratio. */
export type AlertSeverity = 'critical' | 'high' | 'medium';

/** Single historical entry recorded when a webhook alert threshold is breached. */
export interface AlertHistoryEntry {
  id: string;
  firedAt: number;
  instance: string;
  type: WebhookAlertBreach['type'];
  reason: string;
  /** Métrica observada (% para spike, minutos para silêncio). */
  observed: number;
  /** Threshold efetivo aplicado. */
  threshold: number;
  severity: AlertSeverity;
}

const STORAGE_KEY = 'zappweb:webhook-alert-history';
const MAX_HISTORY = 200;

/** Classifies alert severity based on breach type and how far the observed value exceeds the configured threshold. */
export function classifySeverity(breach: WebhookAlertBreach, config: WebhookAlertConfig): AlertSeverity {
  if (breach.type === 'signature_spike') {
    const ratio = config.invalidRatePct > 0 ? breach.value / config.invalidRatePct : 1;
    if (ratio >= 3) return 'critical';
    if (ratio >= 1.5) return 'high';
    return 'medium';
  }
  // webhook_silence — value em minutos
  const ratio = config.silenceMinutes > 0 ? breach.value / config.silenceMinutes : 1;
  if (ratio >= 3) return 'critical';
  if (ratio >= 1.5) return 'high';
  return 'medium';
}

/** load Alert History function. */
export function loadAlertHistory(): AlertHistoryEntry[] {
  const raw = safeGetJSON<AlertHistoryEntry[] | null>(STORAGE_KEY, null);
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && typeof e.firedAt === 'number' && typeof e.instance === 'string');
}

/** append Alert History function. */
export function appendAlertHistory(entries: AlertHistoryEntry[]): AlertHistoryEntry[] {
  if (entries.length === 0) return loadAlertHistory();
  const current = loadAlertHistory();
  const merged = [...entries, ...current].slice(0, MAX_HISTORY);
  safeSetJSON(STORAGE_KEY, merged);
  return merged;
}

/** clear Alert History function. */
export function clearAlertHistory(): void {
  safeSetJSON(STORAGE_KEY, []);
}

/** build History Entry function. */
export function buildHistoryEntry(
  breach: WebhookAlertBreach,
  config: WebhookAlertConfig,
  firedAt: number = Date.now(),
): AlertHistoryEntry {
  const threshold =
    breach.type === 'signature_spike' ? config.invalidRatePct : config.silenceMinutes;
  return {
    id: `${breach.instance}|${breach.type}|${firedAt}`,
    firedAt,
    instance: breach.instance,
    type: breach.type,
    reason: breach.reason,
    observed: breach.value,
    threshold,
    severity: classifySeverity(breach, config),
  };
}
