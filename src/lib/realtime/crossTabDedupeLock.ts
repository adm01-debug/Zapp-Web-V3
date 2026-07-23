import { LS_LOCK_PREFIX, TAB_ID, type LockPayload } from './crossTabDedupeTypes';

/** read Lock. */
export function readLock(key: string): LockPayload | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_LOCK_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LockPayload;
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(LS_LOCK_PREFIX + key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** write Lock. */
export function writeLock(key: string, ttl: number): boolean {
  if (typeof localStorage === 'undefined') return false;
  const existing = readLock(key);
  if (existing && existing.ownerId !== TAB_ID) return false;
  try {
    const payload: LockPayload = {
      ownerId: TAB_ID,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + ttl,
    };
    localStorage.setItem(LS_LOCK_PREFIX + key, JSON.stringify(payload));
    const verify = readLock(key);
    return verify?.ownerId === TAB_ID;
  } catch {
    return false;
  }
}

/** release Lock. */
export function releaseLock(key: string) {
  if (typeof localStorage === 'undefined') return;
  const lock = readLock(key);
  if (lock && lock.ownerId !== TAB_ID) return;
  try {
    localStorage.removeItem(LS_LOCK_PREFIX + key);
  } catch {
    /* noop */
  }
}
