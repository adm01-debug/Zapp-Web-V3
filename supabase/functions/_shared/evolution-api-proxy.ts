// Shared proxy logic for Evolution API edge function
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logRetryMetric, type RetryReason } from './log-retry-metric.ts';
import { enqueueFailedMessage } from './enqueue-failed-message.ts';
import {
  isSendPath,
  isValidIdemKey,
  lookupSendCache,
  storeSendCache,
  extractEvolutionMessageId,
} from './send-idempotency.ts';
import { logIdempotencyMiss } from './log-idempotency-miss.ts';

const TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Versioned envelope returned by the Evolution proxy / public-api.
 *
 * `version` is an optional integer that callers may inspect to negotiate
 * future, breaking changes to this response shape. Today the proxy always
 * stamps `EVOLUTION_ENVELOPE_VERSION` (currently `1`). Callers that don't
 * read `version` keep working — the field is purely additive.
 *
 * Bump `EVOLUTION_ENVELOPE_VERSION` (and update consumers) only when a
 * breaking change to the envelope shape is shipped.
 */
export const EVOLUTION_ENVELOPE_VERSION = 1 as const;

export interface EvolutionErrorEnvelope {
  version?: number;
  error: true;
  status: number;
  message: string;
  details?: unknown;
  retries?: number;
}

/** Evolution Success Envelope interface definition. */
export interface EvolutionSuccessEnvelope<T = unknown> {
  version?: number;
  data: T;
}

/** Either a successful proxied payload or an error envelope. */
export type EvolutionEnvelope<T = unknown> =
  | EvolutionSuccessEnvelope<T>
  | EvolutionErrorEnvelope;

/** Proxies a request to the Evolution API with retry, timeout, idempotency dedup, and DLQ fallback. */
export async function proxyToEvolution(
  evolutionApiUrl: string,
  evolutionApiKey: string,
  corsHeaders: Record<string, string>,
  path: string,
  method: string = 'POST',
  body?: unknown,
  instanceInPath?: string,
  /**
   * Optional idempotency key for `/message/*` POSTs. When present, identical
   * keys are deduped against `evolution_send_idempotency` (24h TTL) so that
   * client/DLQ retries after network failures don't create duplicate WhatsApp
   * messages. Ignored for non-send paths and non-POST verbs.
   */
  idemKey?: string,
): Promise<Response> {
  const fullUrl = instanceInPath
    ? `${evolutionApiUrl}${path}/${instanceInPath}`
    : `${evolutionApiUrl}${path}`;

  // ─── Idempotency cache (POST /message/* only) ───
  const idempotencyEnabled =
    method === 'POST' && isSendPath(path) && isValidIdemKey(idemKey);

  if (idempotencyEnabled) {
    const cached = await lookupSendCache(idemKey!);
    if (cached) {
      console.log(`[Evolution API] idempotency HIT for ${idemKey} (${path})`);
      return new Response(JSON.stringify(cached.response), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Idempotent-Replay': 'true',
        },
      });
    }
    // Cache miss with a valid key — emit a structured signal so the
    // frontend can detect spikes that indicate cache instability.
    // Fire-and-forget; never blocks the send.
    void logIdempotencyMiss({
      idem_key: idemKey!,
      instance_name: instanceInPath ?? null,
      path,
    });
  }

  const isFormData = body instanceof FormData;
  const opts: RequestInit = {
    method,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'apikey': evolutionApiKey,
    },
  };
  if (body && method !== 'GET') {
    opts.body = isFormData ? body : JSON.stringify(body);
  }

  let lastError: Error | null = null;
  const isIdempotent = method === 'GET' || method === 'PUT' || method === 'DELETE';
  const maxAttempts = isIdempotent ? MAX_RETRIES + 1 : 1;

  // Métricas de retry: derivar `action` curta do path (ex.: '/message/sendText/' → 'sendText')
  const startedAt = Date.now();
  const retryReasons: RetryReason[] = [];
  const actionLabel = (() => {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || path;
  })();
  let lastHttpStatus: number | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff with full jitter (AWS Architecture Blog pattern)
        // Avoids thundering herd when many clients retry simultaneously.
        const exp = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        const delay = Math.floor(Math.random() * exp);
        console.log(`[Evolution API] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms (jittered, base=${exp}ms) for ${method} ${fullUrl}`);
        await sleep(delay);
      }

      console.log(`[Evolution API] ${method} ${fullUrl} (attempt ${attempt + 1})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(fullUrl, { ...opts, signal: controller.signal });
      clearTimeout(timeoutId);
      lastHttpStatus = response.status;

      if (RETRYABLE_STATUSES.has(response.status) && attempt < maxAttempts - 1) {
        console.warn(`[Evolution API] Got ${response.status}, will retry...`);
        lastError = new Error(`HTTP ${response.status}`);
        retryReasons.push({ attempt: attempt + 1, status: response.status, reason: `http_${response.status}` });
        await response.body?.cancel().catch(() => {});
        continue;
      }

      let data: unknown;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        try { data = JSON.parse(text); } catch { data = { rawResponse: text, status: response.status }; }
      }

      if (!response.ok) {
        const errorData = data as Record<string, unknown>;
        const responseMsg = (errorData?.response as Record<string, unknown>)?.message;
        let friendlyMessage = 'Erro na API Evolution';
        if (Array.isArray(responseMsg) && responseMsg.some((m) => typeof m === 'object' && m !== null && (m as Record<string, unknown>).exists === false)) {
          friendlyMessage = 'Número não encontrado no WhatsApp. Verifique se o número está correto e registrado.';
        } else if (response.status === 401) {
          friendlyMessage = 'Chave de API inválida ou sem permissão.';
        } else if (response.status === 404) {
          friendlyMessage = 'Instância não encontrada na API Evolution.';
        }
        const errorEnvelope: EvolutionErrorEnvelope = {
          version: EVOLUTION_ENVELOPE_VERSION,
          error: true,
          status: response.status,
          message: friendlyMessage,
          details: data,
        };
        logRetryMetric({
          action: actionLabel,
          method,
          instance_name: instanceInPath ?? null,
          attempt_count: attempt + 1,
          final_status: 'failed',
          final_http_status: response.status,
          retry_reasons: retryReasons,
          total_duration_ms: Date.now() - startedAt,
        });
        // DLQ: enqueue if POST /message/* with transient failure
        enqueueFailedMessage({
          instance_name: instanceInPath ?? '',
          remote_jid: (body && typeof body === 'object' && 'number' in (body as Record<string, unknown>))
            ? String((body as Record<string, unknown>).number ?? '')
            : null,
          path,
          method,
          payload: (body && typeof body === 'object') ? (body as Record<string, unknown>) : {},
          http_status: response.status,
          error_code: `http_${response.status}`,
          error_message: friendlyMessage,
        });
        return new Response(JSON.stringify(errorEnvelope), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Preserve raw Evolution payload shape but add a non-conflicting
      // `version` marker when possible. Falls back to raw data for
      // non-object responses (arrays, primitives) to avoid breaking callers.
      const versioned =
        data && typeof data === 'object' && !Array.isArray(data) && !('version' in (data as Record<string, unknown>))
          ? { version: EVOLUTION_ENVELOPE_VERSION, ...(data as Record<string, unknown>) }
          : data;
      logRetryMetric({
        action: actionLabel,
        method,
        instance_name: instanceInPath ?? null,
        attempt_count: attempt + 1,
        final_status: 'success',
        final_http_status: response.status,
        retry_reasons: retryReasons,
        total_duration_ms: Date.now() - startedAt,
      });
      // Cache success so future retries with the same idem key replay this exact response.
      if (idempotencyEnabled) {
        await storeSendCache({
          idem_key: idemKey!,
          instance_name: instanceInPath ?? '',
          path,
          response: versioned,
          http_status: 200,
          external_message_id: extractEvolutionMessageId(versioned),
        });
      }
      return new Response(JSON.stringify(versioned), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const reason = lastError.name === 'AbortError' ? 'timeout' : 'network_error';
      retryReasons.push({ attempt: attempt + 1, reason });
      if (lastError.name === 'AbortError') {
        lastError = new Error(`Timeout após ${TIMEOUT_MS / 1000}s aguardando a API Evolution`);
      }
      if (attempt >= maxAttempts - 1) break;
    }
  }

  const timeoutEnvelope: EvolutionErrorEnvelope = {
    version: EVOLUTION_ENVELOPE_VERSION,
    error: true,
    status: 504,
    message: `Falha ao conectar com a API Evolution: ${lastError?.message || 'Erro desconhecido'}`,
    retries: maxAttempts - 1,
  };
  logRetryMetric({
    action: actionLabel,
    method,
    instance_name: instanceInPath ?? null,
    attempt_count: maxAttempts,
    final_status: 'exhausted',
    final_http_status: lastHttpStatus,
    retry_reasons: retryReasons,
    total_duration_ms: Date.now() - startedAt,
  });
  // DLQ: enqueue exhausted POST /message/*
  {
    const lastReason = retryReasons[retryReasons.length - 1]?.reason ?? 'exhausted';
    enqueueFailedMessage({
      instance_name: instanceInPath ?? '',
      remote_jid: (body && typeof body === 'object' && 'number' in (body as Record<string, unknown>))
        ? String((body as Record<string, unknown>).number ?? '')
        : null,
      path,
      method,
      payload: (body && typeof body === 'object') ? (body as Record<string, unknown>) : {},
      http_status: lastHttpStatus,
      error_code: lastReason,
      error_message: lastError?.message ?? null,
    });
  }
  return new Response(JSON.stringify(timeoutEnvelope), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Helper to generate signed URLs for private storage buckets
/** resolve Private Bucket Url function. */
export async function resolvePrivateBucketUrl(supabase: SupabaseClient, url: string, buckets: string[] = ['whatsapp-media', 'audio-messages']): Promise<string> {
  if (typeof url !== 'string') return url;
  for (const bucket of buckets) {
    if (url.includes(`/storage/v1/object/public/${bucket}/`)) {
      const storagePath = url.split(`/storage/v1/object/public/${bucket}/`)[1];
      if (storagePath) {
        const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 300);
        if (signedData?.signedUrl) {
          console.log(`[Evolution API] Using signed URL for private bucket ${bucket}`);
          return signedData.signedUrl;
        }
      }
      break;
    }
  }
  return url;
}
