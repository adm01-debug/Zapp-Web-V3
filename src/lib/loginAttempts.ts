import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('loginAttempts');

interface LockStatus {
  isLocked: boolean;
  lockedUntil: Date | null;
  attempts: number;
  remainingTime: number; // in seconds
}

interface LoginAttemptsPayload {
  is_locked?: boolean;
  locked_until?: string | null;
  attempts?: number;
}

type LoginAttemptAction = 'check' | 'record_failed' | 'clear';

const DEFAULT_LOCK_STATUS: LockStatus = {
  isLocked: false,
  lockedUntil: null,
  attempts: 0,
  remainingTime: 0,
};

function toLockStatus(payload: LoginAttemptsPayload | null | undefined, fallbackAttempts = 0): LockStatus {
  if (!payload) {
    return { ...DEFAULT_LOCK_STATUS, attempts: fallbackAttempts };
  }

  const lockedUntil = payload.locked_until ? new Date(payload.locked_until) : null;
  const remainingTime = lockedUntil
    ? Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000))
    : 0;

  return {
    isLocked: Boolean(payload.is_locked),
    lockedUntil,
    attempts: payload.attempts ?? fallbackAttempts,
    remainingTime,
  };
}

async function invokeLoginAttempts(
  action: LoginAttemptAction,
  email: string,
): Promise<LoginAttemptsPayload | null> {
  const { data, error } = await supabase.functions.invoke<LoginAttemptsPayload>('login-attempts', {
    body: {
      action,
      email,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
  });

  if (error) throw error;
  return data;
}

/** check Account Lock. */
export async function checkAccountLock(email: string): Promise<LockStatus> {
  try {
    return toLockStatus(await invokeLoginAttempts('check', email));
  } catch (error) {
    log.error('Error checking account lock:', error);
    return DEFAULT_LOCK_STATUS;
  }
}

/** record Failed Login. */
export async function recordFailedLogin(email: string): Promise<LockStatus> {
  try {
    return toLockStatus(await invokeLoginAttempts('record_failed', email), 1);
  } catch (error) {
    log.error('Error recording failed login:', error);
    return DEFAULT_LOCK_STATUS;
  }
}

/** clear Login Attempts. */
export async function clearLoginAttempts(email: string): Promise<void> {
  try {
    await invokeLoginAttempts('clear', email);
  } catch (error) {
    log.error('Error clearing login attempts:', error);
  }
}

/** format Lock Time. */
export function formatLockTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
}
