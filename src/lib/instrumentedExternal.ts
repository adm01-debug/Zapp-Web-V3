/**
 * Optional helper to instrument direct `externalSupabase.rpc(...)` calls
 * with the same timing/recording the proxy uses. Adoption is incremental —
 * call sites can migrate when convenient.
 *
 * Each call generates a correlationId so the structured log line and the
 * telemetry panel row can be matched 1:1 with the underlying request.
 */
import { getExternalSupabase } from '@/integrations/supabase/externalClient';
import type { SupabaseClient } from '@supabase/supabase-js';
import { recordQueryEvent, classifySeverity } from '@/lib/clientTelemetry';
import { generateCorrelationId } from '@/lib/correlationId';

interface TimedRpcOptions {
  signal?: AbortSignal;
}

interface TimedRpcResult<T> {
  data: T | null;
  error: unknown;
  correlationId: string;
}

export async function timedRpc<T = unknown>(
  rpcName: string,
  params: Record<string, unknown> = {},
  _opts?: TimedRpcOptions,
): Promise<TimedRpcResult<T>> {
  const startedAt = performance.now();
  const correlationId = generateCorrelationId();
  const limit = typeof params.p_limit === 'number' ? params.p_limit : null;
  const offset = typeof params.p_offset === 'number' ? params.p_offset : null;

  try {
    const client = getExternalSupabase() as unknown as SupabaseClient;
    const { data, error } = await client.rpc(rpcName, params);
    const durationMs = Math.round(performance.now() - startedAt);
    const recordCount = Array.isArray(data) ? data.length : null;
    const errMsg = error ? (error.message || 'rpc error') : undefined;

    recordQueryEvent({
      operation: 'rpc',
      source: 'externalSupabase',
      target: rpcName,
      durationMs,
      limit,
      offset,
      filters: params,
      recordCount,
      errorMessage: errMsg,
      startedAt,
      correlationId,
      severity: errMsg
        ? classifySeverity(durationMs, true, false)
        : classifySeverity(durationMs, false, false),
    });

    return { data: (data as T) ?? null, error, correlationId };
  } catch (err) {
    const durationMs = Math.round(performance.now() - startedAt);
    const name = (err as Error)?.name;
    const message = (err as Error)?.message ?? 'rpc error';
    const isTimeout = name === 'TimeoutError' || /timeout/i.test(message);

    recordQueryEvent({
      operation: 'rpc',
      source: 'externalSupabase',
      target: rpcName,
      durationMs,
      limit,
      offset,
      filters: params,
      recordCount: null,
      errorMessage: message,
      severity: isTimeout ? 'timeout' : 'error',
      startedAt,
      correlationId,
    });
    throw err;
  }
}
