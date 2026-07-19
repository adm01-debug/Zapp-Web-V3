// Logs an `idempotency_miss` row into FATOR X `evolution_audit_log`.
//
// Triggered by `proxyToEvolution` when a /message/* POST carries a valid
// idempotency key but the server-side cache (`evolution_send_idempotency`)
// has nothing for that key. A miss is normal for the first attempt of any
// new send — it only becomes interesting in *bulk*: a sudden spike per
// instance usually means the cache table is being purged too aggressively,
// the agent is rotating idem keys, or DLQ is replaying with new keys.
//
// The frontend reads these rows hourly per instance and raises a warroom
// alert when the count crosses a threshold.
//
// Best-effort: any failure here is swallowed — never break the send path.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

let cached: ReturnType<typeof createClient> | null | false = null;

function getExternalServiceClient() {
  if (cached === null) {
    const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('EXTERNAL_SUPABASE_URL'));
    const key = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY'))
      || (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY'));
    if (!url || !key) {
      cached = false;
      return null;
    }
    cached = createClient(url, key, { auth: { persistSession: false }, db: { schema: "zapp" } });
  }
  return cached === false ? null : cached;
}

/** log-idempotency-miss utilities and exports. */
export interface IdempotencyMissInput {
  idem_key: string;
  instance_name: string | null;
  path: string;
  reason?: 'cache_miss' | 'cache_unavailable';
}

export async function logIdempotencyMiss(input: IdempotencyMissInput): Promise<void> {
  const client = getExternalServiceClient();
  if (!client) return;
  try {
    await client.from('evolution_audit_log').insert({
      action: 'idempotency_miss',
      entity_type: 'evolution_send',
      entity_id: input.idem_key,
      performed_by: 'evolution-api-proxy',
      performed_by_type: 'system',
      metadata: {
        instance_name: input.instance_name,
        path: input.path,
        reason: input.reason ?? 'cache_miss',
      },
    });
  } catch (e) {
    // Swallow — observability must never break the send pipeline.
    console.warn('[idempotency-miss] log failed:', e instanceof Error ? e.message : String(e));
  }
}
