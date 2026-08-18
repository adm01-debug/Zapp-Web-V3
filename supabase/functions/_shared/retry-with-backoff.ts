/**
 * _shared/retry-with-backoff.ts — Retry com backoff + jitter para chamadas
 * externas (fetch) com falha transiente (408/429/5xx/timeout/rede).
 *
 * Padrão espelhado em _shared/evolution-api-proxy.ts (retry 2x, full jitter,
 * SÓ status retryable). NUNCA retenta 4xx de contrato (400/401/403/404/422…)
 * nem quando o cliente desconectou (AbortSignal do chamador).
 *
 * Semântica at-least-once: em 5xx/timeout a requisição PODE ter sido processada
 * no servidor; para envios (email/WhatsApp) prefere-se duplicidade rara à
 * perda silenciosa. Onde houver ledger de idempotência (ex.: whatsapp-cloud-send
 * com evolution_send_idempotency) a duplicidade é eliminada.
 */

export interface RetryInfo {
  /** Número do retry (1-based). */
  attempt: number;
  /** Delay aplicado antes deste retry (ms, com jitter). */
  delayMs: number;
  /** Status HTTP que motivou o retry (null = erro de rede/timeout). */
  status: number | null;
  /** Mensagem de erro quando status é null. */
  error: string | null;
}

export interface FetchWithRetryOptions {
  /** Total de tentativas (default 3 → 1 original + 2 retries). */
  attempts?: number;
  /** Delay base do 1º retry (default 300ms); dobra a cada retry até maxDelayMs. */
  baseDelayMs?: number;
  /** Teto do delay (default 600ms). */
  maxDelayMs?: number;
  /** Timeout por tentativa (default 15s) — renovado a cada attempt. */
  timeoutMs?: number;
  /** Signal do chamador: abort → para de tentar e relança o erro. */
  signal?: AbortSignal;
  /** Rótulo para logs (ex.: 'Resend', 'Gmail', 'ElevenLabs'). */
  label?: string;
  /** Callback de observabilidade (métricas, logs estruturados). */
  onRetry?: (info: RetryInfo) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Status HTTP retryable: 408 (request timeout), 429 (rate limit) e todo 5xx.
 * 4xx de contrato (400/401/403/404/422…) NUNCA são retentados.
 */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

/**
 * Exceção do fetch = falha de TRANSPORTE (rede/timeout) — 4xx de contrato
 * chega como Response (status), nunca como exceção. Logo, toda exceção é
 * retryable — EXCETO quando o chamador abortou (cliente desconectou; relança
 * sem retry, não adianta tentar de novo).
 */
export function isRetryableNetworkError(_err: unknown, callerSignal?: AbortSignal | null): boolean {
  return !(callerSignal?.aborted === true);
}

/**
 * Delay com FULL JITTER (padrão AWS Architecture Blog, mesmo do
 * evolution-api-proxy): delay ∈ [0, exp) onde exp = min(base * 2^(retry-1), cap).
 * retry=1 → [0,300), retry=2 → [0,600), retry≥3 → [0,600) (teto).
 */
export function retryDelayMs(retryNumber: number, baseDelayMs = 300, maxDelayMs = 600): number {
  const exp = Math.min(baseDelayMs * Math.pow(2, Math.max(0, retryNumber - 1)), maxDelayMs);
  return Math.floor(Math.random() * exp);
}

/**
 * fetch com retry 2x (default) em 408/429/5xx/timeout/rede.
 *
 * Retorna a Response da última tentativa (ok OU 4xx de contrato — o chamador
 * decide como antes) e RELANÇA o último erro de rede/timeout após esgotar os
 * retries — os try/catch existentes dos callers continuam valendo (ex.: 504).
 */
export async function fetchWithRetry(
  url: string | URL,
  init?: RequestInit,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const attempts = Math.max(1, Math.floor(opts.attempts ?? 3));
  const baseDelayMs = opts.baseDelayMs ?? 300;
  const maxDelayMs = opts.maxDelayMs ?? 600;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const label = opts.label ?? "fetch";
  const maxRetries = attempts - 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
    }
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      // Cliente desconectou → nunca retenta (relança o AbortError original).
      if (opts.signal?.aborted) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries && isRetryableNetworkError(err, opts.signal)) {
        const delayMs = retryDelayMs(attempt + 1, baseDelayMs, maxDelayMs);
        console.warn(`[${label}] erro de rede/timeout (${lastError.message}), retry ${attempt + 1}/${maxRetries} em ${delayMs}ms`);
        opts.onRetry?.({ attempt: attempt + 1, delayMs, status: null, error: lastError.message });
        await sleep(delayMs);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeoutId);
      if (opts.signal) opts.signal.removeEventListener("abort", onCallerAbort);
    }

    if (isRetryableHttpStatus(response.status) && attempt < maxRetries) {
      const delayMs = retryDelayMs(attempt + 1, baseDelayMs, maxDelayMs);
      console.warn(`[${label}] HTTP ${response.status}, retry ${attempt + 1}/${maxRetries} em ${delayMs}ms`);
      opts.onRetry?.({ attempt: attempt + 1, delayMs, status: response.status, error: null });
      await response.body?.cancel().catch(() => {});
      await sleep(delayMs);
      continue;
    }

    return response;
  }

  throw lastError ?? new Error(`${label}: fetchWithRetry esgotado sem resposta`);
}
