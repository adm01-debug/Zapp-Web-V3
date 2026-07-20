// Helper: grava métricas de retry da Evolution API (fire-and-forget, service role).
// NUNCA relança erro — falha de gravação não pode quebrar o hot path de envio.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

/** log-retry-metric utilities and exports. */
export interface RetryReason {
  attempt: number;
  status?: number;
  reason: string; // ex.: 'http_503', 'timeout', 'network_error'
}

/** Retry Metric Input interface. */
export interface RetryMetricInput {
  action: string;
  method: string;
  instance_name?: string | null;
  idempotency_key?: string | null;
  attempt_count: number;
  final_status: 'success' | 'failed' | 'exhausted';
  final_http_status?: number | null;
  retry_reasons: RetryReason[];
  total_duration_ms: number;
}

let cached: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (cached) return cached;
  const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')) ?? Deno.env.get('VITE_SUPABASE_URL');
  const key = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false }, db: { schema: "zapp" } });
  return cached;
}

/** log Retry Metric function. */
export function logRetryMetric(input: RetryMetricInput): void {
  // Filtro de volume: só registra se houve retry OU falhou.
  const shouldRecord = input.attempt_count > 1 || input.final_status !== 'success';
  if (!shouldRecord) return;

  // Log estruturado (sempre — captura via edge_function_logs)
  try {
    console.info('[retry-metric]', JSON.stringify(input));
  } catch {
    // ignore
  }

  const client = getServiceClient();
  if (!client) return;

  // fire-and-forget
  client
    .from('evolution_retry_metrics')
    .insert({
      action: input.action,
      method: input.method,
      instance_name: input.instance_name ?? null,
      idempotency_key: input.idempotency_key ?? null,
      attempt_count: input.attempt_count,
      final_status: input.final_status,
      final_http_status: input.final_http_status ?? null,
      retry_reasons: input.retry_reasons,
      total_duration_ms: input.total_duration_ms,
    })
    // PostgrestBuilder is a PromiseLike, not a Promise — use the two-arg
    // .then(onFulfilled, onRejected) form so type-checking succeeds.
    .then(
      (res: { error: { message: string } | null }) => {
        if (res?.error) {
          console.warn('[retry-metric] insert failed:', res.error.message);
        }
      },
      (e: unknown) => {
        console.warn('[retry-metric] insert threw:', e instanceof Error ? e.message : String(e));
      },
    );
}
