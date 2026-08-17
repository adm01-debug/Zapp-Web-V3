import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('loginAttempts');

export type LoginBlockReason =
  | 'ip_blocked'
  | 'ip_not_whitelisted'
  | 'country_blocked'
  | 'country_not_allowed'
  /** Etapa 9.4: serviço de lock indisponível/erro (fail-closed). */
  | 'lock_check_failed';

interface LockStatus {
  isLocked: boolean;
  lockedUntil: Date | null;
  attempts: number;
  remainingTime: number; // in seconds
  /** SEGURANCA-04/05: true quando a edge negou o pré-flight por política (IP/país). */
  blocked: boolean;
  blockReason: LoginBlockReason | null;
  country: string | null;
}

interface LoginAttemptsPayload {
  is_locked?: boolean;
  locked_until?: string | null;
  attempts?: number;
  /** SEGURANCA-04/05: presente quando a edge responde 403 com código de bloqueio. */
  blocked?: boolean;
  block_reason?: LoginBlockReason | null;
  country?: string | null;
  geo_unavailable?: boolean;
}

type LoginAttemptAction = 'check' | 'record_failed' | 'clear';

const DEFAULT_LOCK_STATUS: LockStatus = {
  isLocked: false,
  lockedUntil: null,
  attempts: 0,
  remainingTime: 0,
  blocked: false,
  blockReason: null,
  country: null,
};

/**
 * FAIL-CLOSED (Etapa 9.4 / findings-22:119): quando o serviço de lock falha,
 * NUNCA declarar desbloqueado. Erro de verificação/arquivamento não pode
 * desproteger lockout, blocklist de IP nem geo-blocking — o login é negado
 * (degradação intencional) até o serviço voltar.
 */
const FAIL_CLOSED_LOCK_STATUS: LockStatus = {
  isLocked: true,
  lockedUntil: null,
  attempts: 0,
  remainingTime: 0,
  blocked: true,
  blockReason: 'lock_check_failed',
  country: null,
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
    blocked: Boolean(payload.blocked),
    blockReason: payload.block_reason ?? null,
    country: payload.country ?? null,
  };
}

/** Mensagem amigável por código de bloqueio do gate de segurança (SEGURANCA-04/05). */
export function blockReasonMessage(reason: LoginBlockReason | null): string {
  switch (reason) {
    case 'ip_blocked':
      return 'Seu IP está bloqueado por medidas de segurança. Tente novamente mais tarde ou contate o administrador.';
    case 'ip_not_whitelisted':
      return 'Seu IP não está na lista de IPs permitidos. Contate o administrador.';
    case 'country_blocked':
      return 'Acesso negado: seu país está na lista de bloqueio desta plataforma.';
    case 'country_not_allowed':
      return 'Acesso negado: seu país não está na lista de países permitidos.';
    case 'lock_check_failed':
      return 'Não foi possível verificar o bloqueio da conta. Tente novamente em instantes.';
    default:
      return 'Acesso bloqueado pela política de segurança.';
  }
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

  if (error) {
    // 403 do gate de segurança (blocked_ips / ip_whitelist / geo-blocking):
    // o body vive em error.context (FunctionsHttpError) — mesmo padrão de scanResponse.ts.
    if (error instanceof FunctionsHttpError) {
      const context = await error.context
        .json()
        .catch(() => null) as (LoginAttemptsPayload & { code?: LoginBlockReason }) | null;
      if (context?.code) {
        return {
          blocked: true,
          block_reason: context.code,
          country: context.country ?? null,
        };
      }
    }
    throw error;
  }
  return data;
}

/** check Account Lock. */
export async function checkAccountLock(email: string): Promise<LockStatus> {
  try {
    return toLockStatus(await invokeLoginAttempts('check', email));
  } catch (error) {
    log.error('Error checking account lock:', error);
    // FAIL-CLOSED (Etapa 9.4): serviço indisponível NÃO desprotege o login.
    return FAIL_CLOSED_LOCK_STATUS;
  }
}

/** record Failed Login. */
export async function recordFailedLogin(email: string): Promise<LockStatus> {
  try {
    return toLockStatus(await invokeLoginAttempts('record_failed', email), 1);
  } catch (error) {
    log.error('Error recording failed login:', error);
    // FAIL-CLOSED: falha ao registrar = estado do lock desconhecido; não afirmar desbloqueado.
    return { ...FAIL_CLOSED_LOCK_STATUS, attempts: 1 };
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
