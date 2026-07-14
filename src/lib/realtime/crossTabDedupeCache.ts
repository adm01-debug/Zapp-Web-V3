import {
  LS_LOCK_PREFIX,
  LS_RESULT_PREFIX,
  LS_BUS_PREFIX,
  BUS_MSG_TTL,
  type ResultPayload,
} from './crossTabDedupeTypes';

export function readPersistedResult<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_RESULT_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResultPayload<T>;
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(LS_RESULT_PREFIX + key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

export function writePersistedResult<T>(key: string, value: T, ttl: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: ResultPayload<T> = { value, expiresAt: Date.now() + ttl };
    localStorage.setItem(LS_RESULT_PREFIX + key, JSON.stringify(payload));
  } catch {
    /* quota cheia ou serialização falhou — degrada silenciosamente */
  }
}

/** Sweeps only the localStorage portion (locks + persisted results + bus slots). */
export function gcLocalStorageKeys(): { locksSwept: number; resultsSwept: number } {
  let locksSwept = 0;
  let resultsSwept = 0;
  if (typeof localStorage === 'undefined') return { locksSwept, resultsSwept };
  try {
    const now = Date.now();
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        !k.startsWith(LS_LOCK_PREFIX) &&
        !k.startsWith(LS_RESULT_PREFIX) &&
        !k.startsWith(LS_BUS_PREFIX)
      )
        continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        if (k.startsWith(LS_BUS_PREFIX)) {
          try {
            const parsed = JSON.parse(raw) as { ts?: number };
            if (typeof parsed.ts === 'number' && now - parsed.ts > BUS_MSG_TTL) {
              toRemove.push(k);
            }
          } catch {
            toRemove.push(k);
          }
          continue;
        }
        const parsed = JSON.parse(raw) as { expiresAt?: number };
        if (typeof parsed.expiresAt === 'number' && parsed.expiresAt < now) {
          toRemove.push(k);
        }
      } catch {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
      if (k.startsWith(LS_LOCK_PREFIX)) locksSwept++;
      else resultsSwept++;
    }
  } catch {
    /* noop */
  }
  return { locksSwept, resultsSwept };
}
