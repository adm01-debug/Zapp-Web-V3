/**
 * Wrapper de envio para a Evolution API com exponential backoff.
 *
 * Por que existe: a Evolution API/Eco fica intermitente sob carga
 * (timeouts, 502/503/504, "fetch failed"). Sem retry, cada falha vira
 * uma mensagem `failed` no inbox e o agente precisa reenviar manualmente.
 *
 * Estratégia:
 * - 3 tentativas (1ª imediata + 2 retries).
 * - Backoff exponencial: ~1s, ~2s, com jitter.
 * - Só faz retry para erros transitórios (rede, 5xx, timeout). 4xx aborta.
 * - Reporta cada retry via `onRetry` (toast opcional).
 */
import { supabase } from '@/integrations/supabase/client';
import { withRetry } from '@/lib/retry';
import { getLogger } from '@/lib/logger';
import { enqueueClientFailedMessage } from '@/lib/failedMessagesEnqueue';
import { loadRetryConfig } from '@/lib/retryConfig';
import { crossTabDedupe } from '@/lib/crossTabSendDedupe';
import { buildRequestDedupeKey } from '@/lib/requestDedupeKey';
import { resolveSendFunction } from '@/lib/sendFunctionRouter';
import { canCall, recordFailure, recordSuccess, CircuitOpenError } from '@/lib/evolutionCircuitBreaker';

const log = getLogger('EvolutionSendRetry');

export interface EvolutionInvokeOptions {
  body: Record<string, unknown>;
  method?: 'POST' | 'GET';
  headers?: Record<string, string>;
}

export interface EvolutionInvokeResult<T = unknown> {
  data: T | null;
  error: { message?: string; status?: number; name?: string } | null;
}

const TRANSIENT_PATTERNS = [
  'fetch', 'network', 'timeout', 'aborted', 'econnreset',
  'enotfound', 'unavailable', 'temporarily', 'gateway',
];
// Word-boundary regex avoids false matches like '5024' or URLs containing these codes.
const TRANSIENT_STATUS_IN_MSG_RE = /\b(429|502|503|504)\b/;

function isTransient(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    const status = (err as unknown as { status?: number }).status;
    if (typeof status === 'number' && (status >= 500 || status === 429)) return true;
    return TRANSIENT_PATTERNS.some((p) => msg.includes(p)) || TRANSIENT_STATUS_IN_MSG_RE.test(msg);
  }
  if (typeof err === 'object') {
    const anyErr = err as { status?: number; message?: string };
    if (anyErr.status && anyErr.status >= 500) return true;
    if (anyErr.status === 429) return true;
    if (anyErr.message) {
      const msg = anyErr.message.toLowerCase();
      return TRANSIENT_PATTERNS.some((p) => msg.includes(p)) || TRANSIENT_STATUS_IN_MSG_RE.test(msg);
    }
  }
  return false;
}

/**
 * Invoca `evolution-api/<action>` com retry exponencial em falhas transitórias.
 * Lança em falha definitiva — caller atualiza UI/DB com status `failed`.
 */
export async function invokeEvolutionWithRetry<T = unknown>(
  action: string,
  opts: EvolutionInvokeOptions,
  config: {
    maxRetries?: number;
    onRetry?: (attempt: number, totalRetries: number, err: unknown) => void;
    /**
     * Stable idempotency key per logical send. When set, it is also injected
     * into the DLQ payload as `__idemKey` so reprocess-failed-messages can
     * forward the same key and avoid creating a duplicate WhatsApp message
     * on the Evolution side after network recovery.
     */
    idempotencyKey?: string;
  } = {}
): Promise<EvolutionInvokeResult<T>> {
  const { onRetry, idempotencyKey } = config;

  // Snapshot pra DLQ caso falhe definitivamente
  const instanceName = (opts.body?.instance_name ?? opts.body?.instanceName) as string | undefined;
  const remoteJid = (opts.body?.remote_jid ?? opts.body?.number ?? opts.body?.to) as string | undefined;
  const sendPath = `/message/${action}`;

  // Config dinâmica por instância (com fallback global → defaults)
  const dynCfg = await loadRetryConfig(instanceName);
  const maxRetries = config.maxRetries ?? dynCfg.maxRetries;
  const baseDelayMs = dynCfg.baseBackoffMs;
  const maxDelayMs = dynCfg.maxBackoffMs;

  // Make sure the idem key is forwarded as header even when caller didn't set it.
  const mergedHeaders: Record<string, string> = { ...(opts.headers || {}) };
  if (idempotencyKey && !mergedHeaders['Idempotency-Key'] && !mergedHeaders['idempotency-key']) {
    mergedHeaders['Idempotency-Key'] = idempotencyKey;
  }

  // Route to the correct backend function based on the connection's api_type.
  // Cloud API (official) functions accept the same `{ action, ... }` body shape.
  const targetFn = await resolveSendFunction(instanceName);
  // For the Cloud API edge function, action goes in the body (not the path).
  const invokePath = targetFn === 'whatsapp-cloud-api' ? 'whatsapp-cloud-api' : `evolution-api/${action}`;
  const invokeBody = targetFn === 'whatsapp-cloud-api'
    ? { action, ...opts.body }
    : opts.body;

  const runRetryLoop = () => withRetry(
    async () => {
      // Circuit breaker: short-circuit before paying retry cost on a known
      // bad instance. Tracked per `instanceName`; uncovered when no instance
      // is on the body (rare — instance management calls).
      if (instanceName) {
        const decision = canCall(instanceName);
        if (!decision.allowed) {
          throw new CircuitOpenError(instanceName, decision.retryAfterMs ?? 0);
        }
      }

      const result = await supabase.functions.invoke(invokePath, {
        method: opts.method || 'POST',
        body: invokeBody,
        headers: mergedHeaders,
      });

      // Supabase encapsula erros em result.error; também checa payload com erro
      if (result.error) {
        const err = result.error as { message?: string; status?: number };
        if (isTransient(err)) {
          if (instanceName) recordFailure(instanceName);
          throw Object.assign(new Error(err.message || 'transient'), { status: err.status });
        }
        // Erro definitivo — não retry. Não conta como falha do breaker porque
        // 4xx é "request inválida" do caller, não indisponibilidade do upstream.
        return result as EvolutionInvokeResult<T>;
      }

      const payload = result.data as { error?: unknown; status?: number; message?: string } | null;
      if (payload?.error || (payload?.status && payload.status >= 500)) {
        const reason = (payload.message || JSON.stringify(payload.error)).toString();
        if (isTransient({ message: reason, status: payload.status })) {
          if (instanceName) recordFailure(instanceName);
          throw Object.assign(new Error(reason), { status: payload.status });
        }
      }

      // Success → close circuit if it was open/half-open.
      if (instanceName) recordSuccess(instanceName);
      return result as EvolutionInvokeResult<T>;
    },
    {
      maxRetries,
      baseDelayMs,
      maxDelayMs,
      shouldRetry: (err) => isTransient(err),
      onRetry: (err, attempt) => {
        log.warn(`[evolution] retry ${attempt}/${maxRetries} action=${action}`, err);
        onRetry?.(attempt, maxRetries, err);
      },
    }
  );

  try {
    // Collapse duplicate sends across browser tabs: only the leader tab
    // actually invokes the Edge Function; followers replay its response from
    // BroadcastChannel. The dedupe key is derived from endpoint + method +
    // body, with the Idempotency-Key (when present) winning outright — so
    // the same logical send always maps to the same key, regardless of
    // whether the caller passed an idem key or not.
    const dedupeKey = await buildRequestDedupeKey({
      endpoint: `evolution-api/${action}`,
      method: opts.method || 'POST',
      body: opts.body,
      idempotencyKey,
    });
    return await crossTabDedupe<EvolutionInvokeResult<T>>(dedupeKey, runRetryLoop);
  } catch (err) {
    // Falha definitiva (esgotou retries OU erro permanente). Tenta enqueue na DLQ.
    // CircuitOpenError também vai pra DLQ — a mensagem precisa eventualmente sair,
    // o cron de reprocess tentará de novo quando o circuit fechar.
    const isCircuitOpen = err instanceof CircuitOpenError;
    if (instanceName && (isTransient(err) || isCircuitOpen)) {
      const status = (err as { status?: number })?.status ?? null;
      const message = err instanceof Error ? err.message : String(err);
      const errorCode = isCircuitOpen
        ? 'circuit_open'
        : status
          ? `http_${status}`
          : message.toLowerCase().includes('timeout') ? 'timeout' : 'network_error';
      // Embed the idem key in the DLQ payload so the cron worker reuses it.
      const dlqPayload = idempotencyKey
        ? { ...opts.body, __idemKey: idempotencyKey }
        : opts.body;
      enqueueClientFailedMessage({
        instance_name: instanceName,
        remote_jid: remoteJid ?? null,
        path: sendPath,
        method: opts.method || 'POST',
        payload: dlqPayload,
        http_status: status,
        error_code: errorCode,
        error_message: message,
      });
    }
    throw err;
  }
}
