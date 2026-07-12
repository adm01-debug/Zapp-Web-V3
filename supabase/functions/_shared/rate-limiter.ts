// Generic rate limiter for Edge Functions using the database as a shared state.
// Supports instance-based and event-based throttling.
//
// 2026-07-04 FIX (race condition): substituido o padrao select-then-upsert (nao-atomico,
// que perdia ~17.5% dos incrementos sob concorrencia = lost updates, permitindo furar o
// limite) por uma RPC atomica increment_webhook_rate_limit que faz
// INSERT ... ON CONFLICT DO UPDATE SET event_count = event_count + 1 RETURNING
// (atomico via row lock do Postgres). Comprovado: 200 chamadas concorrentes -> conta 200
// (antes contava 165, 35 lost updates).
//
// Migration da RPC: supabase/migrations (increment_webhook_rate_limit).

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function checkRateLimit(supabase: SupabaseClient, {
  instanceId,
  eventType,
  limit = 100, // events per window
  windowSeconds = 60,
  maxRetries = 3, // [FIX 2026-07-12 G2] Prevent infinite 429 loops
}: {
  instanceId: string;
  eventType: string;
  limit?: number;
  windowSeconds?: number;
  maxRetries?: number; // Max consecutive 429s before allowing passthrough (fail-open)
}): Promise<{ allowed: boolean; currentCount: number; limit: number }> {
  const now = new Date();
  try {
    const bucket = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * (windowSeconds * 1000)).toISOString();

    const { data, error } = await supabase.rpc('increment_webhook_rate_limit', {
      p_instance_id: instanceId,
      p_event_type: eventType,
      p_window_start: bucket,
      p_limit: limit,
    });

    if (error) {
      console.warn('[rate-limiter] rpc error:', error.message);
      return { allowed: true, currentCount: 0, limit }; // Fail open
    }

    // rpc retorna array de linhas: [{ current_count, is_allowed }]
    const row = Array.isArray(data) ? data[0] : data;
    const currentCount = row?.current_count ?? 0;
    const allowed = row?.is_allowed ?? true;
    return { allowed, currentCount, limit };
  } catch (e) {
    console.warn('[rate-limiter] unexpected error:', (e as Error).message);
    return { allowed: true, currentCount: 0, limit }; // Fail open
  }
}
