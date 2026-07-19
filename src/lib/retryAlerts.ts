/**
 * Retry alerts — thresholds + evaluator + persistência (localStorage).
 * Pure utility (no React).
 */
import { safeGetJSON, safeSetJSON } from '@/lib/safeStorage';

export interface RetryThresholds {
  /** p95 de tentativas máximo tolerado antes de alertar. */
  p95Attempts: number;
  /** % de falha (failed + exhausted) máxima tolerada. */
  failureRatePct: number;
  /** Amostra mínima de runs para uma instância ser avaliada (anti-ruído). */
  minSampleSize: number;
}

export interface InstanceMetrics {
  instance: string;
  total: number;
  successAfterRetry: number;
  failed: number;
  exhausted: number;
  p95Attempts: number;
  failureRatePct: number;
}

/** Breach Reason Kind type alias. */
export type BreachReasonKind = 'p95' | 'failure_rate';

/** Breach Reason interface definition. */
export interface BreachReason {
  kind: BreachReasonKind;
  /** Texto pronto pra exibir (ex.: "p95=4 ≥ 3"). */
  label: string;
  /** Valor observado na janela atual. */
  observed: number;
  /** Threshold efetivo aplicado (global OU override por instância). */
  threshold: number;
}

export interface InstanceBreach {
  instance: string;
  /** Strings legadas (compat). */
  reasons: string[];
  /** Motivos estruturados — usar pra UI. */
  details: BreachReason[];
  metrics: InstanceMetrics;
  /** Thresholds efetivos aplicados (após merge global+override). */
  effectiveThresholds: RetryThresholds;
  /** True quando a instância tem override explícito por instância. */
  hasOverride: boolean;
}

export const DEFAULT_THRESHOLDS: RetryThresholds = {
  p95Attempts: 3,
  failureRatePct: 20,
  minSampleSize: 5,
};

/** Cooldown padrão entre re-disparos do mesmo (instance × kind) — espelha webhookHealthAlerts. */
export const RETRY_ALERT_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Decide se um alerta de retry deve disparar respeitando cooldown.
 * Retorna `true` quando passou tempo suficiente desde o último disparo
 * para a chave (ex.: `instance|kind`).
 */
export function shouldFireRetryAlert(
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

/** R E T R Y_ T H R E S H O L D S_ S T O R A G E_ K E Y constant. */
export const RETRY_THRESHOLDS_STORAGE_KEY = 'zappweb:retry-alert-thresholds';
/** R E T R Y_ P E R_ I N S T A N C E_ S T O R A G E_ K E Y constant. */
export const RETRY_PER_INSTANCE_STORAGE_KEY = 'zappweb:retry-alert-thresholds:per-instance';
/** R E T R Y_ D E D U P E_ M O D E_ S T O R A G E_ K E Y constant. */
export const RETRY_DEDUPE_MODE_STORAGE_KEY = 'zappweb:retry-alert-dedupe-mode';

/**
 * Granularidade do dedupe de toasts de retry.
 * - `instance`: 1 toast por instância na janela, mesmo que `p95` e `failure_rate`
 *   estourem ao mesmo tempo (menos ruído, perde detalhe do tipo).
 * - `instance+kind`: 1 toast por (instância × tipo de violação) — padrão.
 */
export type RetryAlertDedupeMode = 'instance' | 'instance+kind';
export const DEFAULT_RETRY_DEDUPE_MODE: RetryAlertDedupeMode = 'instance+kind';

export function loadRetryAlertDedupeMode(): RetryAlertDedupeMode {
  const raw = safeGetJSON<unknown>(RETRY_DEDUPE_MODE_STORAGE_KEY, null);
  return raw === 'instance' || raw === 'instance+kind' ? raw : DEFAULT_RETRY_DEDUPE_MODE;
}

/** save Retry Alert Dedupe Mode function. */
export function saveRetryAlertDedupeMode(mode: RetryAlertDedupeMode): boolean {
  return safeSetJSON(RETRY_DEDUPE_MODE_STORAGE_KEY, mode);
}

/**
 * Constrói a chave de dedupe usada pelo cooldown do toast. A chave SEMPRE
 * inclui a janela (`hours`) para que mudar de janela limpe o estado de dedupe
 * naturalmente. O `kind` só entra quando `mode === 'instance+kind'`.
 */
export function buildRetryAlertDedupeKey(
  instance: string,
  kind: BreachReasonKind,
  hours: number,
  mode: RetryAlertDedupeMode = DEFAULT_RETRY_DEDUPE_MODE,
): string {
  const base = `${instance}|${hours}h`;
  return mode === 'instance+kind' ? `${instance}|${kind}|${hours}h` : base;
}

// Aliases internos curtos (compat com o resto deste arquivo).
const STORAGE_KEY = RETRY_THRESHOLDS_STORAGE_KEY;
const PER_INSTANCE_STORAGE_KEY = RETRY_PER_INSTANCE_STORAGE_KEY;

/**
 * Assina mudanças cross-tab dos thresholds de retry (globais e/ou por-instância)
 * via `window.storage`. O evento só dispara em **outras abas**, então é seguro
 * usar como gatilho de re-leitura sem provocar loops na aba que salvou.
 *
 * `cb` recebe o estado fresco lido do localStorage. Retorna função de cleanup.
 *
 * SSR-safe: se `window` não existe (test/server), retorna no-op.
 */
export function subscribeRetryAlertsStorage(
  cb: (next: {
    thresholds: RetryThresholds;
    perInstance: PerInstanceThresholds;
    dedupeMode: RetryAlertDedupeMode;
  }) => void,
): () => void {
  if (typeof window === 'undefined') return () => { /* no-op */ };
  const handler = (e: StorageEvent) => {
    if (
      e.key !== null &&
      e.key !== STORAGE_KEY &&
      e.key !== PER_INSTANCE_STORAGE_KEY &&
      e.key !== RETRY_DEDUPE_MODE_STORAGE_KEY
    ) return;
    cb({
      thresholds: loadThresholds(),
      perInstance: loadPerInstanceThresholds(),
      dedupeMode: loadRetryAlertDedupeMode(),
    });
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}


/** load Thresholds function. */
export function loadThresholds(): RetryThresholds {
  const raw = safeGetJSON<Partial<RetryThresholds> | null>(STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THRESHOLDS };
  return {
    p95Attempts: numOr(raw.p95Attempts, DEFAULT_THRESHOLDS.p95Attempts),
    failureRatePct: numOr(raw.failureRatePct, DEFAULT_THRESHOLDS.failureRatePct),
    minSampleSize: numOr(raw.minSampleSize, DEFAULT_THRESHOLDS.minSampleSize),
  };
}

/** save Thresholds function. */
export function saveThresholds(t: RetryThresholds): boolean {
  return safeSetJSON(STORAGE_KEY, t);
}

/** Map of instance name → custom thresholds (partial override of globals). */
export type PerInstanceThresholds = Record<string, Partial<RetryThresholds>>;

export function loadPerInstanceThresholds(): PerInstanceThresholds {
  const raw = safeGetJSON<unknown>(PER_INSTANCE_STORAGE_KEY, null);
  if (!raw || typeof raw !== 'object') return {};
  const out: PerInstanceThresholds = {};
  for (const [name, partial] of Object.entries(raw as Record<string, unknown>)) {
    if (!partial || typeof partial !== 'object') continue;
    const p = partial as Partial<RetryThresholds>;
    const cleaned: Partial<RetryThresholds> = {};
    if (typeof p.p95Attempts === 'number' && Number.isFinite(p.p95Attempts) && p.p95Attempts >= 0) {
      cleaned.p95Attempts = p.p95Attempts;
    }
    if (typeof p.failureRatePct === 'number' && Number.isFinite(p.failureRatePct) && p.failureRatePct >= 0) {
      cleaned.failureRatePct = p.failureRatePct;
    }
    if (typeof p.minSampleSize === 'number' && Number.isFinite(p.minSampleSize) && p.minSampleSize >= 0) {
      cleaned.minSampleSize = p.minSampleSize;
    }
    if (Object.keys(cleaned).length > 0) out[name] = cleaned;
  }
  return out;
}

/** save Per Instance Thresholds function. */
export function savePerInstanceThresholds(map: PerInstanceThresholds): boolean {
  return safeSetJSON(PER_INSTANCE_STORAGE_KEY, map);
}

/** Resolve thresholds for a given instance: per-instance override merged on top of globals. */
export function resolveThresholds(
  instance: string,
  globals: RetryThresholds,
  overrides: PerInstanceThresholds,
): RetryThresholds {
  const o = overrides[instance];
  if (!o) return globals;
  return {
    p95Attempts: numOr(o.p95Attempts, globals.p95Attempts),
    failureRatePct: numOr(o.failureRatePct, globals.failureRatePct),
    minSampleSize: numOr(o.minSampleSize, globals.minSampleSize),
  };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
}

/** Avalia uma instância. Retorna motivos estruturados (vazio = ok). */
export function evaluateInstance(
  metrics: InstanceMetrics,
  thresholds: RetryThresholds,
): { breached: boolean; reasons: string[]; details: BreachReason[] } {
  if (metrics.total < thresholds.minSampleSize) {
    return { breached: false, reasons: [], details: [] };
  }
  const details: BreachReason[] = [];
  if (metrics.p95Attempts >= thresholds.p95Attempts) {
    details.push({
      kind: 'p95',
      label: `p95=${metrics.p95Attempts} ≥ ${thresholds.p95Attempts}`,
      observed: metrics.p95Attempts,
      threshold: thresholds.p95Attempts,
    });
  }
  if (metrics.failureRatePct >= thresholds.failureRatePct) {
    details.push({
      kind: 'failure_rate',
      label: `falha=${metrics.failureRatePct}% ≥ ${thresholds.failureRatePct}%`,
      observed: metrics.failureRatePct,
      threshold: thresholds.failureRatePct,
    });
  }
  return { breached: details.length > 0, reasons: details.map(d => d.label), details };
}

/**
 * Avalia todas as instâncias e devolve apenas as que violam.
 * Aceita um terceiro argumento opcional com overrides por instância.
 */
export function evaluateAllInstances(
  metrics: InstanceMetrics[],
  thresholds: RetryThresholds,
  overrides?: PerInstanceThresholds,
): InstanceBreach[] {
  const breaches: InstanceBreach[] = [];
  for (const m of metrics) {
    const hasOverride = !!overrides && !!overrides[m.instance] && Object.keys(overrides[m.instance]).length > 0;
    const effective = overrides ? resolveThresholds(m.instance, thresholds, overrides) : thresholds;
    const { breached, reasons, details } = evaluateInstance(m, effective);
    if (breached) {
      breaches.push({
        instance: m.instance,
        reasons,
        details,
        metrics: m,
        effectiveThresholds: effective,
        hasOverride,
      });
    }
  }
  return breaches;
}
