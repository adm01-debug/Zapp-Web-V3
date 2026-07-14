/**
 * Configuração de retry por instância (com fallback global → defaults).
 *
 * Lê de `global_settings` chaves no formato:
 *   retry.global.{maxRetries|baseBackoffMs|maxBackoffMs|timeoutMs}
 *   retry.instance.<name>.{...}
 *
 * Resolução: instance.<name>.X ?? global.X ?? DEFAULT_RETRY_CONFIG.X
 *
 * Cache in-memory com TTL de 60s para evitar query a cada envio.
 */
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('retryConfig');

export interface RetryConfig {
  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseBackoffMs: 800,
  maxBackoffMs: 6000,
  timeoutMs: 30_000,
};

export const RETRY_CONFIG_RANGES: Record<keyof RetryConfig, { min: number; max: number; step: number }> = {
  maxRetries: { min: 1, max: 10, step: 1 },
  baseBackoffMs: { min: 100, max: 10_000, step: 100 },
  maxBackoffMs: { min: 1_000, max: 60_000, step: 500 },
  timeoutMs: { min: 5_000, max: 120_000, step: 1_000 },
};

const CACHE_TTL_MS = 60_000;
const GLOBAL_CACHE_KEY = '_global';

interface CacheEntry {
  config: RetryConfig;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RetryConfig>>();

export function clampToRange<K extends keyof RetryConfig>(field: K, raw: number): number {
  const r = RETRY_CONFIG_RANGES[field];
  if (!Number.isFinite(raw)) return DEFAULT_RETRY_CONFIG[field];
  return Math.min(r.max, Math.max(r.min, Math.floor(raw)));
}

function parseValue<K extends keyof RetryConfig>(field: K, raw: string | null | undefined): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return clampToRange(field, n);
}

function buildKeys(instanceName?: string): { globalKeys: Record<keyof RetryConfig, string>; instanceKeys?: Record<keyof RetryConfig, string> } {
  const fields: (keyof RetryConfig)[] = ['maxRetries', 'baseBackoffMs', 'maxBackoffMs', 'timeoutMs'];
  const globalKeys = Object.fromEntries(fields.map((f) => [f, `retry.global.${f}`])) as Record<keyof RetryConfig, string>;
  if (!instanceName || instanceName === GLOBAL_CACHE_KEY) return { globalKeys };
  const instanceKeys = Object.fromEntries(fields.map((f) => [f, `retry.instance.${instanceName}.${f}`])) as Record<keyof RetryConfig, string>;
  return { globalKeys, instanceKeys };
}

/**
 * Carrega config para uma instância (ou global se omitido). Usa cache TTL 60s.
 * Em erro de query, devolve defaults — nunca lança (não pode quebrar envio).
 */
export async function loadRetryConfig(instanceName?: string): Promise<RetryConfig> {
  const cacheKey = instanceName || GLOBAL_CACHE_KEY;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.config;

  const existing = inflight.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { globalKeys, instanceKeys } = buildKeys(instanceName);
      const allKeys = [
        ...Object.values(globalKeys),
        ...(instanceKeys ? Object.values(instanceKeys) : []),
      ];
      const { data, error } = await supabase
        .from('global_settings')
        .select('key, value')
        .in('key', allKeys);
      if (error) throw error;

      const map = new Map<string, string | null>();
      for (const row of data ?? []) map.set(row.key, row.value);

      const fields: (keyof RetryConfig)[] = ['maxRetries', 'baseBackoffMs', 'maxBackoffMs', 'timeoutMs'];
      const config = { ...DEFAULT_RETRY_CONFIG };
      for (const f of fields) {
        const fromGlobal = parseValue(f, map.get(globalKeys[f]));
        const fromInstance = instanceKeys ? parseValue(f, map.get(instanceKeys[f])) : undefined;
        const resolved = fromInstance ?? fromGlobal ?? DEFAULT_RETRY_CONFIG[f];
        config[f] = resolved;
      }
      cache.set(cacheKey, { config, expiresAt: Date.now() + CACHE_TTL_MS });
      return config;
    } catch (err) {
      log.warn('[retryConfig] load failed, using defaults', err);
      return { ...DEFAULT_RETRY_CONFIG };
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Devolve config do cache ou defaults — não bloqueia render.
 * Use em código sync (hooks); chame `loadRetryConfig()` em background pra esquentar.
 */
export function getRetryConfigSync(instanceName?: string): RetryConfig {
  const cacheKey = instanceName || GLOBAL_CACHE_KEY;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.config;
  // Fallback: tenta global se instância não está no cache
  if (instanceName) {
    const globalCached = cache.get(GLOBAL_CACHE_KEY);
    if (globalCached && globalCached.expiresAt > Date.now()) return globalCached.config;
  }
  return { ...DEFAULT_RETRY_CONFIG };
}

export function invalidateRetryConfigCache(instanceName?: string): void {
  if (instanceName) {
    cache.delete(instanceName);
    cache.delete(GLOBAL_CACHE_KEY);
  } else {
    cache.clear();
  }
}

/** Para testes apenas. */
export function __resetRetryConfigCache(): void {
  cache.clear();
  inflight.clear();
}

export function settingKeyFor(field: keyof RetryConfig, instanceName?: string): string {
  if (!instanceName || instanceName === GLOBAL_CACHE_KEY) return `retry.global.${field}`;
  return `retry.instance.${instanceName}.${field}`;
}

export const RETRY_CONFIG_FIELDS: (keyof RetryConfig)[] = [
  'maxRetries',
  'baseBackoffMs',
  'maxBackoffMs',
  'timeoutMs',
];

export type RetryConfigErrors = Partial<Record<keyof RetryConfig, string>> & { _form?: string };

/**
 * Valida combinações cruzadas inválidas antes de persistir.
 * Cada campo individual já é clampado pelo `clampToRange`, mas combinações
 * (ex.: maxBackoff < baseBackoff) só fazem sentido em conjunto.
 *
 * Regras:
 *  1. `maxBackoffMs >= baseBackoffMs` — backoff teto não pode ser menor que o piso.
 *  2. `timeoutMs >= baseBackoffMs` — abort precisa ser maior que a primeira espera,
 *     senão a 2ª tentativa é abortada antes de começar.
 *  3. `timeoutMs >= 1000` (já garantido por range, defensivo).
 *  4. `maxRetries >= 1` (já garantido por range, defensivo).
 *
 * Devolve `{}` quando válido. Caso contrário, mapa de campo→mensagem
 * (com possível `_form` para erros sem campo único responsável).
 */
export function validateRetryConfig(c: RetryConfig): RetryConfigErrors {
  const errors: RetryConfigErrors = {};

  if (c.maxBackoffMs < c.baseBackoffMs) {
    errors.maxBackoffMs = `Deve ser ≥ backoff inicial (${c.baseBackoffMs}ms).`;
  }
  if (c.timeoutMs < c.baseBackoffMs) {
    errors.timeoutMs = `Deve ser ≥ backoff inicial (${c.baseBackoffMs}ms), senão tentativas são abortadas antes de iniciar.`;
  }
  if (c.maxRetries < 1) {
    errors.maxRetries = 'Deve ser ≥ 1.';
  }

  return errors;
}

export function hasRetryConfigErrors(errors: RetryConfigErrors): boolean {
  return Object.keys(errors).length > 0;
}

export class RetryConfigValidationError extends Error {
  errors: RetryConfigErrors;
  constructor(errors: RetryConfigErrors) {
    const first = Object.values(errors)[0] ?? 'Configuração de retry inválida';
    super(first);
    this.name = 'RetryConfigValidationError';
    this.errors = errors;
  }
}
