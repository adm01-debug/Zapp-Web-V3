// Helper: enqueia mensagens com falha transitória na DLQ `failed_messages`.
// Fire-and-forget, service role, NUNCA relança erro.
//
// Filtros:
// - Só registra POST de envio (`/message/*`).
// - Só registra erros transitórios: 5xx, 429, timeout, network_error.
// - Erros permanentes (400/401/403/404/422) NÃO entram na fila.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buildIdempotencyKey, classifyRetryReason, computeBackoffMsByReason } from './dlq-backoff.ts';

export interface EnqueueFailedMessageInput {
  instance_name: string;
  remote_jid?: string | null;
  path: string;                    // ex.: '/message/sendText'
  method: string;                  // só 'POST' enquileira
  payload: Record<string, unknown>;
  http_status?: number | null;     // null para timeout/network
  error_code?: string | null;      // ex.: 'http_503', 'timeout', 'network_error'
  error_message?: string | null;
}

const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);
const MAX_RETRIES = 5;

let cached: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (cached) return cached;
  const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')) ?? Deno.env.get('VITE_SUPABASE_URL');
  const key = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false }, db: { schema: "zapp" } });
  return cached;
}

function isTransientFailure(input: EnqueueFailedMessageInput): boolean {
  if (input.http_status == null) {
    // timeout / network_error
    return input.error_code === 'timeout' || input.error_code === 'network_error';
  }
  if (PERMANENT_STATUSES.has(input.http_status)) return false;
  if (input.http_status === 429) return true;
  if (input.http_status >= 500 && input.http_status < 600) return true;
  return false;
}

function isSendPath(path: string): boolean {
  return path.startsWith('/message/') || path.includes('/message/');
}

export function enqueueFailedMessage(input: EnqueueFailedMessageInput): void {
  if (input.method !== 'POST') return;
  if (!isSendPath(input.path)) return;
  if (!isTransientFailure(input)) return;
  if (!input.instance_name) return;

  try {
    console.info('[dlq-enqueue]', JSON.stringify({
      instance: input.instance_name,
      path: input.path,
      remote_jid: input.remote_jid ?? null,
      http_status: input.http_status ?? null,
      error_code: input.error_code ?? null,
    }));
  } catch { /* ignore */ }

  const client = getServiceClient();
  if (!client) return;

  const payloadWithPath = { ...input.payload, __path: input.path };

  // Fire-and-forget: build key async, then insert. Conflito de chave (item já em fila)
  // é silenciosamente ignorado — não relança e não loga como erro fatal.
  // Motivo classificado já no enqueue → primeiro next_attempt_at usa o perfil
  // adequado (rate_limit espera 2min, timeout só 30s, etc).
  const reason = classifyRetryReason(input.http_status ?? null, input.error_message ?? null);
  buildIdempotencyKey(input.instance_name, input.path, input.payload).then((idemKey) => {
    client
      .from('failed_messages')
      .insert({
        instance_name: input.instance_name,
        remote_jid: input.remote_jid ?? null,
        payload: payloadWithPath,
        error_code: input.error_code ?? null,
        error_message: input.error_message?.slice(0, 500) ?? null,
        http_status: input.http_status ?? null,
        retry_count: 0,
        max_retries: MAX_RETRIES,
        status: 'pending',
        // Primeira tentativa = backoff(attempt=1, reason) com jitter ±15%.
        next_attempt_at: new Date(Date.now() + computeBackoffMsByReason(1, reason)).toISOString(),
        idempotency_key: idemKey,
        last_retry_reason: reason,
      })
      // PostgrestBuilder is a PromiseLike, not a Promise — use the two-arg
      // .then(onFulfilled, onRejected) form so type-checking succeeds.
      .then(
        (res: { error: { message: string; code?: string } | null }) => {
          if (res?.error) {
            // Conflito de chave idempotente (23505) é esperado: dedupe silencioso.
            if (res.error.code === '23505') {
              console.info('[dlq-enqueue] dedupe: item já em fila para', input.path);
            } else {
              console.warn('[dlq-enqueue] insert failed:', res.error.message);
            }
          }
        },
        (e: unknown) => {
          console.warn('[dlq-enqueue] insert threw:', e instanceof Error ? e.message : String(e));
        },
      );
  }, (e: unknown) => {
    console.warn('[dlq-enqueue] key build failed:', e instanceof Error ? e.message : String(e));
  });
}
