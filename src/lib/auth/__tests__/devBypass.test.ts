import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveAppEnv,
  getAppEnv,
  isDevBypassAllowedForEnv,
  isDevBypassAllowed,
} from '../devBypass';

/**
 * E51 — Whitelist de ambiente para o bypass do papel `dev`.
 *
 * Contrato futuro (implementado por E51):
 *   - `resolveAppEnv(appEnvRaw, modeRaw)`: VITE_APP_ENV explícito vence;
 *     fallback para MODE do Vite; nada reconhecido → 'production' (fail-closed).
 *   - `isDevBypassAllowed()`: true APENAS em development/staging.
 *   - Em production/test o bypass dev é BLOQUEADO.
 *
 * Estado RED esperado ANTES da implementação: módulo `../devBypass` inexistente
 * → erro de import (todos os testes falham) — sinal válido do contrato futuro.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveAppEnv (resolução pura do ambiente)', () => {
  it.each([
    // appEnvRaw            modeRaw          esperado
    ['development', 'production', 'development'],
    ['staging', 'production', 'staging'],
    ['production', 'development', 'production'], // VITE_APP_ENV explícito vence o MODE
    ['', 'test', 'test'],
    ['qa-copy', 'test', 'test'], // valor inválido → cai para MODE
    [undefined, 'development', 'development'],
    [undefined, 'staging', 'staging'],
    [undefined, 'production', 'production'],
    [undefined, undefined, 'production'], // default seguro (fail-closed)
    ['  ', ' ', 'production'], // whitespace não conta como valor
  ] as const)('appEnv=%j mode=%j → %s', (appEnv, mode, expected) => {
    expect(resolveAppEnv(appEnv, mode)).toBe(expected);
  });
});

describe('isDevBypassAllowedForEnv (allowlist)', () => {
  it.each(['development', 'staging'] as const)('%s → bypass permitido', (env) => {
    expect(isDevBypassAllowedForEnv(env)).toBe(true);
  });

  it.each(['production', 'test'] as const)('%s → bypass bloqueado', (env) => {
    expect(isDevBypassAllowedForEnv(env)).toBe(false);
  });
});

describe('isDevBypassAllowed (leitura única do ambiente)', () => {
  it('permite bypass quando VITE_APP_ENV=development', () => {
    vi.stubEnv('VITE_APP_ENV', 'development');
    expect(isDevBypassAllowed()).toBe(true);
  });

  it('permite bypass quando VITE_APP_ENV=staging', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging');
    expect(isDevBypassAllowed()).toBe(true);
  });

  it('bloqueia bypass quando VITE_APP_ENV=production', () => {
    vi.stubEnv('VITE_APP_ENV', 'production');
    expect(isDevBypassAllowed()).toBe(false);
  });

  it('bloqueia bypass com VITE_APP_ENV vazio (fallback MODE=test no vitest)', () => {
    vi.stubEnv('VITE_APP_ENV', '');
    expect(isDevBypassAllowed()).toBe(false);
  });

  it('bloqueia bypass com VITE_APP_ENV inválido', () => {
    vi.stubEnv('VITE_APP_ENV', 'qa-copy');
    expect(isDevBypassAllowed()).toBe(false);
  });

  it('bloqueia bypass em ambiente test (MODE=test sem VITE_APP_ENV)', () => {
    vi.stubEnv('VITE_APP_ENV', '');
    vi.stubEnv('MODE', 'test');
    expect(isDevBypassAllowed()).toBe(false);
  });

  it('getAppEnv reflete o ambiente resolvido', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging');
    expect(getAppEnv()).toBe('staging');
    vi.stubEnv('VITE_APP_ENV', 'production');
    expect(getAppEnv()).toBe('production');
  });
});
