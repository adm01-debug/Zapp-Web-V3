import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FunctionsHttpError, FunctionsFetchError } from '@supabase/supabase-js';

const mockRpc = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

vi.mock('@/lib/logger');

import {
  checkAccountLock,
  recordFailedLogin,
  clearLoginAttempts,
  formatLockTime,
  blockReasonMessage,
  type LoginBlockReason,
} from '@/lib/loginAttempts';
import { getLogger } from '@/lib/logger';

// Instância do logger capturada no load do módulo (antes de qualquer
// beforeEach) — vi.clearAllMocks() apaga mock.results, então a referência
// precisa ser capturada no escopo do módulo.
const loginAttemptsLogger = vi.mocked(getLogger).mock.results[0]?.value as {
  error: ReturnType<typeof vi.fn>;
};

describe('loginAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkAccountLock', () => {
    it('returns not locked for unknown email', async () => {
      mockInvoke.mockResolvedValue({
        data: { is_locked: false, locked_until: null, attempts: 0 },
        error: null,
      });

      const result = await checkAccountLock('unknown@test.com');
      expect(result.isLocked).toBe(false);
    });

    it('returns locked with expiry time', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      mockInvoke.mockResolvedValue({
        data: { is_locked: true, locked_until: futureDate, attempts: 5 },
        error: null,
      });

      const result = await checkAccountLock('locked@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.lockedUntil).toBeTruthy();
    });

    it('is fail-closed when the lock service errors (does not unprotect)', async () => {
      mockInvoke.mockRejectedValue(new Error('Network failure'));

      const result = await checkAccountLock('test@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('lock_check_failed');
    });

    it('handles empty result data', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await checkAccountLock('test@test.com');
      expect(result.isLocked).toBe(false);
      expect(result.attempts).toBe(0);
    });
  });

  describe('recordFailedLogin', () => {
    it('records first failed attempt', async () => {
      mockInvoke.mockResolvedValue({
        data: { is_locked: false, locked_until: null, attempts: 1 },
        error: null,
      });

      const result = await recordFailedLogin('test@test.com');
      expect(mockInvoke).toHaveBeenCalledWith(
        'login-attempts',
        expect.objectContaining({
          body: expect.objectContaining({
            action: 'record_failed',
            email: 'test@test.com',
          }),
        })
      );
      expect(result.isLocked).toBe(false);
    });

    it('returns locked after max attempts', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      mockInvoke.mockResolvedValue({
        data: { is_locked: true, locked_until: futureDate, attempts: 5 },
        error: null,
      });

      const result = await recordFailedLogin('test@test.com');
      expect(result.isLocked).toBe(true);
    });

    it('is fail-closed when recording fails (does not claim unlocked)', async () => {
      mockInvoke.mockRejectedValue(new Error('DB error'));

      const result = await recordFailedLogin('test@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('lock_check_failed');
      expect(result.attempts).toBe(1);
    });
  });

  describe('clearLoginAttempts', () => {
    it('clears login attempts for email', async () => {
      mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });

      await clearLoginAttempts('test@test.com');
      expect(mockInvoke).toHaveBeenCalledWith(
        'login-attempts',
        expect.objectContaining({
          body: expect.objectContaining({ action: 'clear', email: 'test@test.com' }),
        })
      );
    });

    it('handles error without throwing', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: new Error('Failed') });

      await expect(clearLoginAttempts('test@test.com')).resolves.not.toThrow();
    });
  });

  describe('formatLockTime', () => {
    it('formats seconds', () => {
      expect(formatLockTime(30)).toBe('30 segundos');
      expect(formatLockTime(1)).toBe('1 segundo');
    });

    it('formats minutes', () => {
      expect(formatLockTime(60)).toBe('1 minuto');
      expect(formatLockTime(120)).toBe('2 minutos');
      expect(formatLockTime(90)).toBe('2 minutos');
    });
  });

  describe('E60 — lockout fail-closed (5 tentativas → bloqueio)', () => {
    beforeEach(() => {
      loginAttemptsLogger?.error?.mockClear();
    });

    it('bloqueia na 5ª tentativa de login falho (sequência 1..5)', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      // Simula a EF contando as tentativas: 1..4 livres, 5ª → is_locked.
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        mockInvoke.mockResolvedValueOnce({
          data: {
            is_locked: attempt >= 5,
            locked_until: attempt >= 5 ? futureDate : null,
            attempts: attempt,
          },
          error: null,
        });
      }

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const r = await recordFailedLogin('vítima@test.com');
        expect(r.isLocked).toBe(false);
        expect(r.attempts).toBe(attempt);
      }

      const fifth = await recordFailedLogin('vítima@test.com');
      expect(fifth.isLocked).toBe(true);
      expect(fifth.attempts).toBe(5);
      expect(fifth.lockedUntil).toBeTruthy();
    });

    it('checkAccountLock mantém bloqueio ativo com tempo restante', async () => {
      const futureDate = new Date(Date.now() + 120000).toISOString();
      mockInvoke.mockResolvedValue({
        data: { is_locked: true, locked_until: futureDate, attempts: 5 },
        error: null,
      });

      const result = await checkAccountLock('locked@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.remainingTime).toBeGreaterThan(0);
      expect(result.remainingTime).toBeLessThanOrEqual(120);
    });

    it('após expirar o lock, reflete o desbloqueio informado pela EF', async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      mockInvoke.mockResolvedValue({
        data: { is_locked: false, locked_until: pastDate, attempts: 5 },
        error: null,
      });

      const result = await checkAccountLock('expired@test.com');
      expect(result.isLocked).toBe(false);
      expect(result.remainingTime).toBe(0);
    });

    it('lock expirado mas is_locked=true da EF → cliente NÃO inventa desbloqueio (remainingTime 0)', async () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      mockInvoke.mockResolvedValue({
        data: { is_locked: true, locked_until: pastDate, attempts: 5 },
        error: null,
      });

      const result = await checkAccountLock('stale@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.remainingTime).toBe(0);
    });

    it('EF 403 com código (FunctionsHttpError) → blocked com reason específico', async () => {
      const httpError = new FunctionsHttpError(
        new Response(JSON.stringify({ code: 'ip_blocked', country: 'XX' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      // supabase-js invoke() NUNCA rejeita em erro HTTP — resolve com {data: null, error}.
      mockInvoke.mockResolvedValue({ data: null, error: httpError });

      const result = await checkAccountLock('geo@test.com');
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('ip_blocked');
      expect(result.country).toBe('XX');
      expect(result.isLocked).toBe(false);
    });

    it('EF 500 com corpo não-payload → fail-closed (não desprotege)', async () => {
      const httpError = new FunctionsHttpError(
        new Response(JSON.stringify({ message: 'internal error' }), { status: 500 })
      );
      // supabase-js invoke() NUNCA rejeita em erro HTTP — resolve com {data: null, error}.
      mockInvoke.mockResolvedValue({ data: null, error: httpError });

      const result = await checkAccountLock('server@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('lock_check_failed');
    });

    it('EF 403 com corpo não-JSON → fail-closed', async () => {
      const httpError = new FunctionsHttpError(new Response('oops', { status: 403 }));
      // supabase-js invoke() NUNCA rejeita em erro HTTP — resolve com {data: null, error}.
      mockInvoke.mockResolvedValue({ data: null, error: httpError });

      const result = await checkAccountLock('broken@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('lock_check_failed');
    });

    it('EF timeout (FunctionsFetchError) → fail-closed com alerta de auditoria (log.error)', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError('timeout') });

      const result = await checkAccountLock('timeout@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('lock_check_failed');
      expect(loginAttemptsLogger?.error).toHaveBeenCalled();
    });

    it('recordFailedLogin com EF fora do ar → fail-closed (nunca afirma desbloqueado)', async () => {
      mockInvoke.mockResolvedValue({ data: null, error: new Error('Network failure') });

      const result = await recordFailedLogin('down@test.com');
      expect(result.isLocked).toBe(true);
      expect(result.blocked).toBe(true);
      expect(result.blockReason).toBe('lock_check_failed');
      expect(loginAttemptsLogger?.error).toHaveBeenCalled();
    });

    it('blockReasonMessage cobre todos os motivos (sem default fail-open)', async () => {
      const reasons: LoginBlockReason[] = [
        'ip_blocked',
        'ip_not_whitelisted',
        'country_blocked',
        'country_not_allowed',
        'lock_check_failed',
      ];
      for (const reason of reasons) {
        expect(blockReasonMessage(reason).length).toBeGreaterThan(10);
      }
      expect(blockReasonMessage(null).length).toBeGreaterThan(10);
    });
  });
});
