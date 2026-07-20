// Shared helpers para a DLQ `failed_messages`:
//  - Backoff exponencial determinístico (com jitter opcional).
//  - Idempotency key estável derivada de (instance, path, payload).
//  - Backoff escalonado por motivo (rate_limit espera mais que timeout, etc).
//
// Usado por:
//  - _shared/enqueue-failed-message.ts (primeira inserção, attempt=1)
//  - reprocess-failed-messages/index.ts (próxima tentativa após falha)

const BASE_DELAY_MS = 60_000;        // 1min
const MAX_DELAY_MS = 3_600_000;      // 60min
const JITTER_RATIO = 0.15;           // ±15%

/**
 * Backoff exponencial com teto e jitter:
 *   attempt=1 → 60s    attempt=2 → 120s   attempt=3 → 240s
 *   attempt=4 → 480s   attempt=5 → 960s   attempt≥6 → 3600s (cap)
 * Jitter ±15% para evitar thundering herd.
 */
export function computeBackoffMs(attempt: number, withJitter = true): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const raw = BASE_DELAY_MS * Math.pow(2, safeAttempt - 1);
  const capped = Math.min(raw, MAX_DELAY_MS);
  if (!withJitter) return capped;
  const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(1_000, Math.round(capped + jitter));
}

/** Stable JSON: ordena chaves recursivamente para hashing determinístico. */
export function stableStringify(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      const w = walk(obj[k]);
      if (w !== undefined) out[k] = w;
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

/** SHA-256 hex via SubtleCrypto (disponível no Deno runtime). */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Chave idempotente: hash determinístico de (instance | path | payload-sem-__path).
 * Dois enqueues do mesmo envio (mesma instância, mesma rota, mesmo body) produzem
 * a MESMA chave → bloqueados pelo índice único parcial enquanto status ∈ pending/retrying.
 */
export async function buildIdempotencyKey(
  instance: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const cleaned = { ...payload };
  delete (cleaned as Record<string, unknown>).__path;
  const canonical = `${instance}|${path}|${stableStringify(cleaned)}`;
  return await sha256Hex(canonical);
}

// ============================================================================
// Reason-aware backoff: agenda tentativas com delays diferentes por motivo.
// Espelha src/lib/failureRootCause.ts (mesmo enum + lógica equivalente).
// ============================================================================

/** Retry Reason type alias. */
export type RetryReason =
  | 'rate_limit'
  | 'unavailable'
  | 'timeout'
  | 'network'
  | 'server_error'
  | 'auth'
  | 'invalid_payload'
  | 'not_found'
  | 'unknown';

interface ReasonProfile {
  multiplier: number;
  minDelayMs: number;
}

/**
 * Perfil por motivo aplicado sobre o backoff exponencial base.
 * - rate_limit: espera bem mais (2min mín, 4×) — APIs respondem pior se insistir.
 * - unavailable/server_error: 1min mín, 2× — serviço pode voltar.
 * - timeout/network: agressivo (30s mín, 1×) — tentar logo de novo costuma resolver.
 * - auth: 90s mín, 1.5× — dá tempo de refresh de token.
 * - invalid_payload/not_found/unknown: comportamento atual (60s mín, 1×).
 */
export const REASON_PROFILE: Record<RetryReason, ReasonProfile> = {
  rate_limit:      { multiplier: 4.0, minDelayMs: 120_000 },
  unavailable:     { multiplier: 2.0, minDelayMs:  60_000 },
  server_error:    { multiplier: 2.0, minDelayMs:  60_000 },
  timeout:         { multiplier: 1.0, minDelayMs:  30_000 },
  network:         { multiplier: 1.0, minDelayMs:  30_000 },
  auth:            { multiplier: 1.5, minDelayMs:  90_000 },
  invalid_payload: { multiplier: 1.0, minDelayMs:  60_000 },
  not_found:       { multiplier: 1.0, minDelayMs:  60_000 },
  unknown:         { multiplier: 1.0, minDelayMs:  60_000 },
};

function classifyByStatus(status: number): RetryReason {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 422) return 'invalid_payload';
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  if (status >= 500 && status < 600) return 'server_error';
  return 'unknown';
}

/**
 * Classifica um motivo de retentativa a partir de (status, mensagem).
 * Espelha a lógica de classifyRootCause em src/lib/failureRootCause.ts.
 */
export function classifyRetryReason(
  httpStatus: number | null | undefined,
  errorMessage: string | null | undefined,
): RetryReason {
  if (httpStatus != null) return classifyByStatus(httpStatus);
  const msg = (errorMessage ?? '').toLowerCase();
  if (!msg) return 'unknown';
  if (/timeout|timed out|etimedout/.test(msg)) return 'timeout';
  if (/rate ?limit|too many requests|429/.test(msg)) return 'rate_limit';
  if (/unauthor|forbidden|invalid token|auth/.test(msg)) return 'auth';
  if (/unavailable|503|502|504|bad gateway|gateway timeout/.test(msg)) return 'unavailable';
  if (/network|econnreset|econnrefused|enetunreach|fetch failed|socket/.test(msg)) return 'network';
  if (/not found|404/.test(msg)) return 'not_found';
  if (/invalid|validation|malformed|400|422/.test(msg)) return 'invalid_payload';
  return 'unknown';
}

/**
 * Backoff escalonado por motivo. Aplica multiplier sobre o exponencial base,
 * respeita o piso por motivo e o teto global de 1h. Jitter ±15% no fim.
 *
 * Para reason='unknown' com perfil neutro (mult=1, min=60s) o resultado é
 * equivalente a `computeBackoffMs(attempt)` — mantém compatibilidade.
 */
export function computeBackoffMsByReason(
  attempt: number,
  reason: RetryReason,
  withJitter = true,
): number {
  const base = computeBackoffMs(attempt, false); // sem jitter ainda
  const profile = REASON_PROFILE[reason] ?? REASON_PROFILE.unknown;
  const scaled = Math.max(profile.minDelayMs, base * profile.multiplier);
  const capped = Math.min(scaled, MAX_DELAY_MS);
  if (!withJitter) return capped;
  const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(1_000, Math.round(capped + jitter));
}
