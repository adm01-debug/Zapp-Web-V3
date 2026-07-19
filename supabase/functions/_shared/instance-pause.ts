// Helpers compartilhados para verificar e disparar pausa de processamento por instância.
//
// - `isInstancePaused(supabase, instance)`: SELECT direto na DLQ de pausas
//   (RPC `is_instance_paused` ou query simples). Cache em memória de 5s
//   para reduzir round-trips em rajadas de webhook.
//
// - `recordAuthFailureAndMaybePause(supabase, instance, reason)`: incrementa um
//   contador in-memory por instância e dispara `auto_pause_instance_on_auth_spike`
//   quando atingir o limiar dentro da janela. Fire-and-forget, nunca lança.
//
// Janela / limiar (configuráveis via env):
//   - WEBHOOK_AUTH_SPIKE_WINDOW_SEC (default 60)
//   - WEBHOOK_AUTH_SPIKE_THRESHOLD  (default 10)
//   - WEBHOOK_AUTH_PAUSE_MINUTES    (default 15)

// [FIX 2026-07-10] Tipo estrutural mínimo em vez de SupabaseClient pinado:
// consumidores importam supabase-js em versões distintas (@2 vs @2.49.1) e os
// generics da classe não são compatíveis entre si (TS2345 por variância).
// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const PAUSE_CACHE_TTL_MS = 5_000;
const _pauseCache = new Map<string, { value: boolean; expires: number }>();

const WINDOW_SEC = Math.max(10, Number(Deno.env.get('WEBHOOK_AUTH_SPIKE_WINDOW_SEC') ?? '60'));
const THRESHOLD = Math.max(2, Number(Deno.env.get('WEBHOOK_AUTH_SPIKE_THRESHOLD') ?? '10'));
const PAUSE_MIN = Math.min(1440, Math.max(1, Number(Deno.env.get('WEBHOOK_AUTH_PAUSE_MINUTES') ?? '15')));

interface AuthCounter {
  count: number;
  windowStart: number;
  lastReason: string;
}
const _authCounters = new Map<string, AuthCounter>();

/** Pause Config interface definition. */
export interface PauseConfig {
  windowSec: number;
  threshold: number;
  pauseMinutes: number;
}

/** get Pause Config function. */
export function getPauseConfig(): PauseConfig {
  return { windowSec: WINDOW_SEC, threshold: THRESHOLD, pauseMinutes: PAUSE_MIN };
}

/** is Instance Paused function. */
export async function isInstancePaused(supabase: SupabaseClient, instance: string | null | undefined): Promise<boolean> {
  if (!instance) return false;
  const cached = _pauseCache.get(instance);
  const now = Date.now();
  if (cached && cached.expires > now) return cached.value;

  let value = false;
  try {
    const { data, error } = await supabase.rpc('is_instance_paused', { p_instance: instance });
    if (!error && typeof data === 'boolean') value = data;
  } catch { /* ignore — fail open on infra errors */ }

  _pauseCache.set(instance, { value, expires: now + PAUSE_CACHE_TTL_MS });
  return value;
}

/** Clears the in-memory pause cache for a specific instance or all instances. */
export function invalidateInstancePauseCache(instance?: string) {
  if (instance) _pauseCache.delete(instance);
  else _pauseCache.clear();
}

/**
 * Conta uma falha de autenticação para a instância e, se ultrapassar o limiar
 * dentro da janela, chama `auto_pause_instance_on_auth_spike`. Fire-and-forget.
 */
export function recordAuthFailureAndMaybePause(
  supabase: SupabaseClient,
  instance: string | null | undefined,
  reason: 'invalid_signature' | 'auth_401' | 'auth_403',
  source: 'webhook' | 'evolution-api' = 'webhook',
  detail?: { http_status?: number; message?: string },
): void {
  if (!instance) return;

  // Persiste o evento para a série temporal (fire-and-forget)
  Promise.resolve(
    supabase.from('instance_auth_events').insert({
      instance_name: instance,
      reason,
      source,
      http_status: detail?.http_status ?? (reason === 'auth_401' ? 401 : reason === 'auth_403' ? 403 : null),
      detail: detail?.message ?? null,
    }) as unknown as Promise<unknown>,
  ).then(
    (res: unknown) => {
      const err = (res as { error?: { message: string } | null })?.error;
      if (err) console.warn('[auth-events] insert failed:', err.message);
    },
    (e: unknown) => {
      console.warn('[auth-events] insert threw:', e instanceof Error ? e.message : String(e));
    },
  );

  const now = Date.now();
  const cur = _authCounters.get(instance);
  if (!cur || now - cur.windowStart > WINDOW_SEC * 1000) {
    _authCounters.set(instance, { count: 1, windowStart: now, lastReason: reason });
    return;
  }
  cur.count += 1;
  cur.lastReason = reason;

  if (cur.count < THRESHOLD) return;

  // Reset para evitar disparo duplicado
  _authCounters.set(instance, { count: 0, windowStart: now, lastReason: reason });
  invalidateInstancePauseCache(instance);

  console.warn(`[auto-pause] instance=${instance} reason=${reason} count>=${THRESHOLD} window=${WINDOW_SEC}s — pausing ${PAUSE_MIN}min`);

  Promise.resolve(
    supabase.rpc('auto_pause_instance_on_auth_spike', {
      p_instance: instance,
      p_reason: `auth_spike:${reason}`,
      p_trigger_count: THRESHOLD,
      p_minutes: PAUSE_MIN,
    }) as unknown as Promise<unknown>,
  ).then(
    (res: unknown) => {
      const err = (res as { error?: { message: string } | null })?.error;
      if (err) console.warn('[auto-pause] rpc failed:', err.message);
    },
    (e: unknown) => {
      console.warn('[auto-pause] rpc threw:', e instanceof Error ? e.message : String(e));
    },
  );
}
