/**
 * Client-side enqueue para a Dead-Letter Queue (DLQ) de envios.
 *
 * Espelha a lógica do helper Deno (`supabase/functions/_shared/enqueue-failed-message.ts`)
 * para cobrir envios diretos via SDK que NÃO passam pelo proxy de edge function
 * (ex.: `evolutionSendRetry.ts`).
 *
 * Filtros (idênticos ao server):
 * - Só POST.
 * - Só path de envio (`/message/*`).
 * - Só erros transitórios (5xx, 429, timeout, network_error).
 *
 * Fire-and-forget: NUNCA relança erro pra não interferir no UX do envio.
 * RLS já cobre a permissão (apenas usuários autenticados inserem).
 */
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { sha256Hex, stableStringify } from '@/lib/idempotency';

const log = getLogger('FailedMessagesEnqueue');

/** Hash determinístico de (instance|path|payload) — espelha `_shared/dlq-backoff.ts`. */
async function buildIdempotencyKey(
  instance: string,
  path: string,
  payload: Record<string, unknown>
): Promise<string> {
  const cleaned = { ...payload };
  delete (cleaned as Record<string, unknown>).__path;
  return sha256Hex(`${instance}|${path}|${stableStringify(cleaned)}`);
}

/** Backoff exponencial com cap+jitter — espelha `_shared/dlq-backoff.ts`. */
function computeBackoffMs(attempt: number): number {
  const safe = Math.max(1, Math.floor(attempt));
  const capped = Math.min(60_000 * Math.pow(2, safe - 1), 3_600_000);
  const jitter = capped * 0.15 * (Math.random() * 2 - 1);
  return Math.max(1_000, Math.round(capped + jitter));
}

export interface EnqueueClientFailedMessageInput {
  instance_name: string;
  remote_jid?: string | null;
  path: string;
  method?: string;
  payload: Record<string, unknown>;
  http_status?: number | null;
  error_code?: string | null;
  error_message?: string | null;
}

const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);
const MAX_RETRIES = 5;

function isTransientFailure(input: EnqueueClientFailedMessageInput): boolean {
  if (input.http_status == null) {
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

export function enqueueClientFailedMessage(input: EnqueueClientFailedMessageInput): void {
  const method = input.method ?? 'POST';
  if (method !== 'POST') return;
  if (!isSendPath(input.path)) return;
  if (!isTransientFailure(input)) return;
  if (!input.instance_name) return;

  const payloadWithPath = { ...input.payload, __path: input.path };

  // Fire-and-forget — não bloqueia o caller, não relança.
  void buildIdempotencyKey(input.instance_name, input.path, input.payload)
    .then((idemKey) =>
      supabase
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
          next_attempt_at: new Date(Date.now() + computeBackoffMs(1)).toISOString(),
          idempotency_key: idemKey,
        })
        .then(({ error }) => {
          if (error) {
            // 23505 = conflito da unique parcial → dedupe esperado, não é erro fatal.
            if (error.code === '23505') {
              log.info('[client-dlq] dedupe: item já em fila para', input.path);
            } else {
              log.warn('[client-dlq] insert failed:', error.message);
            }
          }
        })
    )
    .catch((e) =>
      log.warn('[client-dlq] key build failed:', e instanceof Error ? e.message : String(e))
    );
}

// Helpers exportados para testes
export const __test__ = { isTransientFailure, isSendPath };