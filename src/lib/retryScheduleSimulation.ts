/**
 * Simulação determinística do cronograma de tentativas usado pelo
 * `evolutionSendRetry` (que delega ao `withRetry` em `src/lib/retry.ts`).
 *
 * Fórmula em `withRetry`:
 *   delay(attempt) = min(baseBackoffMs * 2^attempt, maxBackoffMs)   // 0-indexed
 *
 * Cada tentativa pode levar até `timeoutMs` (per-request abort).
 * O total tem `maxRetries + 1` execuções (1ª imediata + N retries) com
 * `maxRetries` delays entre elas. Ignoramos o jitter (até +500 ms) para
 * mostrar o caso médio determinístico — o pior caso é simétrico ao mostrado.
 */
import type { RetryConfig } from '@/lib/retryConfig';

export interface RetryAttempt {
  /** Número da tentativa (1-indexed). */
  attempt: number;
  /** Delay aguardado **antes** desta tentativa (ms). 0 na primeira. */
  delayBeforeMs: number;
  /** Tempo cumulativo desde t0 até o início desta tentativa (ms). */
  startAtMs: number;
  /** Tempo máximo até o abort desta tentativa (start + timeoutMs). */
  abortAtMs: number;
  /** True se esta é a última tentativa antes de desistir. */
  isFinal: boolean;
}

export interface RetrySchedule {
  attempts: RetryAttempt[];
  /** Soma de todos os delays entre tentativas. */
  totalBackoffMs: number;
  /** Pior caso wall-clock até desistir (todas as tentativas atingem timeout). */
  worstCaseTotalMs: number;
  /** Melhor caso (resposta imediata na 1ª tentativa). */
  bestCaseTotalMs: number;
}

/** Deterministically simulates the retry attempt schedule for a given retry configuration. */
export function simulateRetrySchedule(config: RetryConfig): RetrySchedule {
  const { maxRetries, baseBackoffMs, maxBackoffMs, timeoutMs } = config;
  const totalAttempts = Math.max(1, maxRetries + 1);

  const attempts: RetryAttempt[] = [];
  let cumulative = 0;

  for (let i = 0; i < totalAttempts; i++) {
    const delayBeforeMs =
      i === 0 ? 0 : Math.min(baseBackoffMs * 2 ** (i - 1), maxBackoffMs);
    const startAtMs = cumulative + delayBeforeMs;
    const abortAtMs = startAtMs + timeoutMs;
    attempts.push({
      attempt: i + 1,
      delayBeforeMs,
      startAtMs,
      abortAtMs,
      isFinal: i === totalAttempts - 1,
    });
    cumulative = abortAtMs;
  }

  const totalBackoffMs = attempts.reduce((s, a) => s + a.delayBeforeMs, 0);
  const worstCaseTotalMs = attempts[attempts.length - 1].abortAtMs;
  const bestCaseTotalMs = timeoutMs; // 1ª tentativa, sucesso instantâneo (idealizado: 0)

  return {
    attempts,
    totalBackoffMs,
    worstCaseTotalMs,
    bestCaseTotalMs,
  };
}

/** Formata milissegundos em representação legível curta (ms, s, m). */
export function formatScheduleMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec === 0 ? `${min}m` : `${min}m${sec}s`;
}
