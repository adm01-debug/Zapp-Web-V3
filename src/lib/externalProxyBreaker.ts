import { getLogger } from '@/lib/logger';

const _log = getLogger('externalProxy');

// ─── Circuit breaker ─────────────────────────────────────────────────────────
const BREAKER_THRESHOLD = 4;
const BREAKER_COOLDOWN_MS = 5_000;
const _breaker = new Map<string, { fails: number; openedAt: number }>();

/** is Breaker Open. */
export function isBreakerOpen(target: string): { open: boolean; remainingMs: number } {
  const health = isHealthBreakerOpen(target);
  if (health.open) return health;
  const entry = _breaker.get(target);
  if (!entry || entry.fails < BREAKER_THRESHOLD) return { open: false, remainingMs: 0 };
  const elapsed = Date.now() - entry.openedAt;
  if (elapsed >= BREAKER_COOLDOWN_MS) {
    _breaker.delete(target);
    return { open: false, remainingMs: 0 };
  }
  return { open: true, remainingMs: BREAKER_COOLDOWN_MS - elapsed };
}

/** record Breaker Failure. */
export function recordBreakerFailure(target: string): void {
  const cur = _breaker.get(target) ?? { fails: 0, openedAt: 0 };
  cur.fails += 1;
  if (cur.fails >= BREAKER_THRESHOLD && cur.openedAt === 0) {
    cur.openedAt = Date.now();
    _log.warn('proxy circuit opened', {
      target,
      fails: cur.fails,
      cooldownMs: BREAKER_COOLDOWN_MS,
    });
  }
  _breaker.set(target, cur);
}

/** record Breaker Success. */
export function recordBreakerSuccess(target: string): void {
  if (_breaker.has(target)) {
    _log.info('proxy circuit closed', { target });
    _breaker.delete(target);
  }
  _healthBreaker.delete(target);
  _authLockUntil.delete(target);
  // configAuthLock intentionally NOT cleared here — session-wide mismatch is not resolved
  // by a single success; it expires naturally after CONFIG_LOCK_MS.
}

// ─── Health-failure circuit breaker ──────────────────────────────────────────
// Falhas de SAÚDE do backend (5xx, pool de conexões esgotado, DB connection
// error) são diferentes de ghost posts: o caller/polling repete a cada ciclo
// (15s) e, sem breaker, martela uma função doente — ampliando a própria
// exaustão de pool que causou a falha (feedback loop visto no incidente
// 2026-07-31: dezenas de HTTP 500/400 com "Timed out acquiring connection
// from connection pool."). Abre após N falhas numa janela curta e
// short-circuita TODO tráfego proxy do target por COOLDOWN_MS, dando ao
// backend tempo para se recuperar.
const HEALTH_BREAKER_THRESHOLD = 3;
const HEALTH_BREAKER_WINDOW_MS = 30_000;
const HEALTH_BREAKER_COOLDOWN_MS = 60_000;
const _healthBreaker = new Map<
  string,
  { fails: number; firstFailAt: number; openedAt: number }
>();

/** record Health Failure. */
export function recordHealthFailure(target: string): void {
  const now = Date.now();
  const cur = _healthBreaker.get(target) ?? { fails: 0, firstFailAt: now, openedAt: 0 };
  if (now - cur.firstFailAt > HEALTH_BREAKER_WINDOW_MS) {
    cur.fails = 0;
    cur.firstFailAt = now;
  }
  cur.fails += 1;
  if (cur.fails >= HEALTH_BREAKER_THRESHOLD && cur.openedAt === 0) {
    cur.openedAt = now;
    _log.warn('proxy health circuit opened', {
      target,
      fails: cur.fails,
      windowMs: HEALTH_BREAKER_WINDOW_MS,
      cooldownMs: HEALTH_BREAKER_COOLDOWN_MS,
    });
  }
  _healthBreaker.set(target, cur);
}

/** is Health Breaker Open. */
export function isHealthBreakerOpen(target: string): { open: boolean; remainingMs: number } {
  const entry = _healthBreaker.get(target);
  if (!entry || entry.openedAt === 0) return { open: false, remainingMs: 0 };
  const elapsed = Date.now() - entry.openedAt;
  if (elapsed >= HEALTH_BREAKER_COOLDOWN_MS) {
    _healthBreaker.delete(target);
    return { open: false, remainingMs: 0 };
  }
  return { open: true, remainingMs: HEALTH_BREAKER_COOLDOWN_MS - elapsed };
}

// ─── Per-target auth lock ────────────────────────────────────────────────────
/** AUTH_LOCK_MS. */
export const AUTH_LOCK_MS = 60_000;
/** _auth Lock Until. */
export const _authLockUntil = new Map<string, number>();

/** is Auth Locked. */
export function isAuthLocked(target: string): number {
  const until = _authLockUntil.get(target) ?? 0;
  return until > Date.now() ? until - Date.now() : 0;
}

/** trip Auth Lock. */
export function tripAuthLock(
  target: string,
  cooldownMs: number = AUTH_LOCK_MS,
  reason: string = 'auth'
): void {
  _authLockUntil.set(target, Math.max(_authLockUntil.get(target) ?? 0, Date.now() + cooldownMs));
  _log.warn('proxy auth lock tripped', { target, cooldownMs, reason });
}

// ─── Session-wide config-auth lock ──────────────────────────────────────────
/** CONFIG_LOCK_MS. */
export const CONFIG_LOCK_MS = 5 * 60_000;
let _configAuthLockUntil = 0;

/** is Config Auth Locked. */
export function isConfigAuthLocked(): number {
  return _configAuthLockUntil > Date.now() ? _configAuthLockUntil - Date.now() : 0;
}

/** trip Config Auth Lock. */
export function tripConfigAuthLock(reason: string = 'config_service_role_mismatch'): void {
  _configAuthLockUntil = Math.max(_configAuthLockUntil, Date.now() + CONFIG_LOCK_MS);
  _log.warn('proxy config-auth lock tripped (session-wide)', {
    cooldownMs: CONFIG_LOCK_MS,
    reason,
  });
}

// ─── Request coalescing ──────────────────────────────────────────────────────
// Deduplicates identical read requests issued within COALESCE_WINDOW_MS to
// prevent stampedes when many components mount simultaneously.
/** COALESCE_WINDOW_MS. */
export const COALESCE_WINDOW_MS = 250;
/** inflight. */
export const inflight = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();

/** coalesce Key. */
export function coalesceKey(body: Record<string, unknown>): string | null {
  const action = body.action as string | undefined;
  if (action === 'insert' || action === 'update' || action === 'delete') return null;
  try {
    const { __cid, signal, ...stable } = body as Record<string, unknown> & {
      __cid?: string;
      signal?: unknown;
    };
    void __cid;
    void signal;
    return JSON.stringify(stable);
  } catch {
    return null;
  }
}

// ─── Test-only reset ─────────────────────────────────────────────────────────
/** reset Breaker State. */
export function resetBreakerState(): void {
  _breaker.clear();
  _healthBreaker.clear();
  inflight.clear();
  _authLockUntil.clear();
  _configAuthLockUntil = 0;
}
