// Server-side send idempotency cache.
//
// Why: when an agent retries a send (manual click, automatic retry in
// `evolutionSendRetry`, or DLQ reprocess after network recovery), the first
// attempt may have actually reached the Evolution API even though the client
// got a timeout / 5xx. Without dedup, the second attempt creates a duplicate
// WhatsApp message.
//
// How: caller provides a stable `idem_key` per *logical* message (typically
// `msg:<messages.id>`). Before forwarding to Evolution we check the cache;
// on hit we replay the cached response. On success we cache for 24h.
// 4xx/5xx are NOT cached — those should retry naturally.
//
// Scope: ONLY `/message/*` POSTs. Other proxied endpoints bypass the cache.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const TTL_HOURS = 24;
const KEY_MIN = 8;
const KEY_MAX = 200;

let cached: ReturnType<typeof createClient> | null = null;
function getServiceClient() {
  if (cached) return cached;
  const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'));
  const key = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false }, db: { schema: "zapp" } });
  return cached;
}

export function isSendPath(path: string): boolean {
  return path.startsWith('/message/');
}

export function isValidIdemKey(key: string | undefined | null): key is string {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed.length >= KEY_MIN && trimmed.length <= KEY_MAX;
}

export interface CachedSend {
  response: unknown;
  http_status: number;
  external_message_id: string | null;
  created_at: string;
}

export async function lookupSendCache(idemKey: string): Promise<CachedSend | null> {
  const client = getServiceClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('evolution_send_idempotency')
      .select('response, http_status, external_message_id, created_at, expires_at')
      .eq('idem_key', idemKey)
      .maybeSingle();
    if (error || !data) return null;
    if (new Date(data.expires_at as string).getTime() <= Date.now()) return null;
    return {
      response: data.response,
      http_status: data.http_status as number,
      external_message_id: (data.external_message_id as string | null) ?? null,
      created_at: data.created_at as string,
    };
  } catch (e) {
    console.warn('[send-idem] lookup failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

export interface StoreSendCacheInput {
  idem_key: string;
  instance_name: string;
  path: string;
  response: unknown;
  http_status: number;
  external_message_id?: string | null;
}

/**
 * Best-effort upsert. 23505 (already cached by parallel attempt) is silent —
 * the parallel reader will see the existing row and replay it.
 */
export async function storeSendCache(input: StoreSendCacheInput): Promise<void> {
  const client = getServiceClient();
  if (!client) return;
  try {
    const expires_at = new Date(Date.now() + TTL_HOURS * 3600 * 1000).toISOString();
    const { error } = await client.from('evolution_send_idempotency').insert({
      idem_key: input.idem_key,
      instance_name: input.instance_name,
      path: input.path,
      response: input.response as Record<string, unknown>,
      http_status: input.http_status,
      external_message_id: input.external_message_id ?? null,
      expires_at,
    });
    if (error && error.code !== '23505') {
      console.warn('[send-idem] insert failed:', error.message);
    }
  } catch (e) {
    console.warn('[send-idem] store threw:', e instanceof Error ? e.message : String(e));
  }
}

/**
 * Walk known Evolution response shapes to find the upstream message id.
 * Mirrors `src/lib/evolutionMessageId.ts` so the cache stores something
 * useful for downstream observability.
 */
export function extractEvolutionMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const r = payload as Record<string, unknown>;
  const key = r.key as Record<string, unknown> | undefined;
  if (key && typeof key.id === 'string') return key.id;
  if (typeof r.messageId === 'string') return r.messageId;
  if (typeof r.id === 'string') return r.id;
  const message = r.message as Record<string, unknown> | undefined;
  if (message) {
    const mk = message.key as Record<string, unknown> | undefined;
    if (mk && typeof mk.id === 'string') return mk.id;
  }
  return null;
}
