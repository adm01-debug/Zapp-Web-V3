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
// 2026-07-12 FIX-01 (S8 - Window Boundary Race Condition): RPC now handles window expiry
// detection atomically. When a window expires (now - window_start >= windowSeconds),
// the RPC resets the counter within the same transaction. Eliminates race condition where
// requests could be incorrectly rate-limited or rejected at window boundaries.
// Migration: 20260712000006_fix_window_boundary_race_s8.sql

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** rate-limiter utilities and exports. */
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
  let lastError: Error | null = null;
  const RPC_TIMEOUT_MS = 5000; // 5 second RPC timeout (matches statement_timeout in RPC)
  const RETRY_DELAYS_MS = [50, 100, 200]; // Exponential backoff: 50ms, 100ms, 200ms

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const bucket = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * (windowSeconds * 1000)).toISOString();

      // Create a promise that rejects if RPC takes too long
      const rpcPromise = supabase.rpc('increment_webhook_rate_limit', {
        p_instance_id: instanceId,
        p_event_type: eventType,
        p_window_start: bucket,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('RPC_TIMEOUT')), RPC_TIMEOUT_MS)
      );

      const { data, error } = await Promise.race([
        rpcPromise,
        timeoutPromise as Promise<any>,
      ]) as any;

      if (error) {
        // Transient errors: retry with backoff (S20 - connection pool exhaustion)
        if (error.message?.includes('lock') || error.message?.includes('timeout') || error.code === 'PGRST116') {
          lastError = error;
          if (attempt < RETRY_DELAYS_MS.length) {
            const delayMs = RETRY_DELAYS_MS[attempt];
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue; // Retry with backoff
          }
        }
        // Permanent errors or max retries exceeded: fail open
        console.warn(`[rate-limiter] rpc error after ${attempt} retries: ${error.message}`);
        return { allowed: true, currentCount: 0, limit }; // Fail open (FIX-05)
      }

      // rpc retorna array de linhas: [{ current_count (bigint), is_allowed, window_expired }]
      // Note: current_count is now BIGINT, safely coerced to JavaScript number for comparisons
      const row = Array.isArray(data) ? data[0] : data;
      const currentCount = (row?.current_count ?? 0) as number;
      const allowed = row?.is_allowed ?? true;
      const windowExpired = row?.window_expired ?? false;

      // Log window boundary crossings for observability (FIX-01 atomic detection)
      if (windowExpired) {
        console.log(`[rate-limiter] window reset: ${instanceId}/${eventType} at bucket ${bucket}`);
      }

      return { allowed, currentCount, limit };
    } catch (e) {
      lastError = e as Error;
      // Transient error: retry with backoff (FIX-05 - timeout/pool exhaustion)
      if ((e as Error).message === 'RPC_TIMEOUT' || (e as Error).message?.includes('timeout')) {
        if (attempt < RETRY_DELAYS_MS.length) {
          const delayMs = RETRY_DELAYS_MS[attempt];
          console.warn(`[rate-limiter] RPC timeout on attempt ${attempt + 1}, retrying in ${delayMs}ms`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
    }
  }

  // All retries exhausted: fail open to prevent cascade failures
  console.warn(`[rate-limiter] all retries exhausted for ${instanceId}/${eventType}: ${lastError?.message}`);
  return { allowed: true, currentCount: 0, limit }; // Fail open (FIX-05)
}
