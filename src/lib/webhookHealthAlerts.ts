/**
 * Webhook health alerts — config + evaluator puros.
 * Espelha o padrão de src/lib/retryAlerts.ts.
 *
 * Dois tipos de alerta:
 *  - signature_spike: taxa de signature_valid=false acima do threshold
 *  - webhook_silence: nenhum evento recebido por X minutos numa instância
 *    que normalmente é ativa
 */
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';

export interface WebhookAlertConfig {
  /** % de assinaturas inválidas tolerado antes de alertar (0-100). */
  invalidRatePct: number;
  /** Amostra mínima de eventos para uma instância ser avaliada (anti-ruído). */
  minSampleSize: number;
  /** Minutos sem eventos para disparar alerta de silêncio. */
  silenceMinutes: number;
  /** Master switch — desativa todos os alertas. */
  enabled: boolean;
}

export type WebhookAlertType = 'signature_spike' | 'webhook_silence';

export interface InstanceHealthStats {
  instance: string;
  /** Total de eventos na janela curta avaliada (ex.: 15 min). */
  total: number;
  /** Eventos com signature_valid=false na mesma janela. */
  invalid: number;
  /** Total de eventos nas últimas 24h (qualifica instância como ativa). */
  total24h: number;
  /** Timestamp ISO do último evento recebido (qualquer janela). */
  lastEventAt: string | null;
}

export interface WebhookAlertBreach {
  type: WebhookAlertType;
  instance: string;
  reason: string;
  /** Métrica numérica relevante para a UI (rate% ou minutos). */
  value: number;
}

export const DEFAULT_ALERT_CONFIG: WebhookAlertConfig = {
  invalidRatePct: 5,
  minSampleSize: 20,
  silenceMinutes: 10,
  enabled: true,
};

const STORAGE_KEY = 'zappweb:webhook-health-alerts';

/** load Alert Config function. */
export function loadAlertConfig(): WebhookAlertConfig {
  const raw = safeGetJSON<Partial<WebhookAlertConfig> | null>(STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ALERT_CONFIG };
  return {
    invalidRatePct: numOr(raw.invalidRatePct, DEFAULT_ALERT_CONFIG.invalidRatePct, 0, 100),
    minSampleSize: numOr(raw.minSampleSize, DEFAULT_ALERT_CONFIG.minSampleSize, 0),
    silenceMinutes: numOr(raw.silenceMinutes, DEFAULT_ALERT_CONFIG.silenceMinutes, 1),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_ALERT_CONFIG.enabled,
  };
}

/** save Alert Config function. */
export function saveAlertConfig(c: WebhookAlertConfig): boolean {
  return safeSetJSON(STORAGE_KEY, c);
}

function numOr(v: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  if (v < min || v > max) return fallback;
  return v;
}

/**
 * Avalia uma instância e retorna a lista de violações ativas (vazia = saudável).
 * `nowMs` injetado para testabilidade.
 */
export function evaluateInstanceHealth(
  stats: InstanceHealthStats,
  config: WebhookAlertConfig,
  nowMs: number = Date.now(),
): WebhookAlertBreach[] {
  if (!config.enabled) return [];
  const breaches: WebhookAlertBreach[] = [];

  // Signature spike — só avalia com amostra suficiente.
  if (stats.total >= config.minSampleSize && stats.total > 0) {
    const rate = (stats.invalid / stats.total) * 100;
    if (rate >= config.invalidRatePct) {
      breaches.push({
        type: 'signature_spike',
        instance: stats.instance,
        reason: `${rate.toFixed(1)}% de assinaturas inválidas (${stats.invalid}/${stats.total}) ≥ ${config.invalidRatePct}%`,
        value: Math.round(rate * 10) / 10,
      });
    }
  }

  // Silence — só alerta se a instância foi ativa nas últimas 24h.
  // Instâncias dormentes (total24h=0) não geram ruído.
  if (stats.total24h > 0 && stats.lastEventAt) {
    const lastMs = new Date(stats.lastEventAt).getTime();
    if (Number.isFinite(lastMs)) {
      const silentMin = (nowMs - lastMs) / 60_000;
      if (silentMin >= config.silenceMinutes) {
        breaches.push({
          type: 'webhook_silence',
          instance: stats.instance,
          reason: `Sem eventos há ${Math.round(silentMin)} min ≥ ${config.silenceMinutes} min`,
          value: Math.round(silentMin),
        });
      }
    }
  }

  return breaches;
}

/** Avalia todas as instâncias e devolve apenas as que violam. */
export function evaluateAllInstances(
  list: InstanceHealthStats[],
  config: WebhookAlertConfig,
  nowMs: number = Date.now(),
): WebhookAlertBreach[] {
  const out: WebhookAlertBreach[] = [];
  for (const s of list) out.push(...evaluateInstanceHealth(s, config, nowMs));
  return out;
}

/**
 * Decide se um alerta deve disparar respeitando cooldown.
 * Retorna `true` quando passou tempo suficiente desde o último disparo
 * para a chave (instance|type).
 */
export function shouldFireAlert(
  key: string,
  cooldownMs: number,
  lastFired: Map<string, number>,
  nowMs: number = Date.now(),
): boolean {
  const last = lastFired.get(key) ?? 0;
  if (nowMs - last < cooldownMs) return false;
  lastFired.set(key, nowMs);
  return true;
}

/** A L E R T_ C O O L D O W N_ M S constant. */
export const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
