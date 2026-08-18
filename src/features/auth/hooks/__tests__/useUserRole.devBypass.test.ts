import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUserRole } from '../useUserRole';

/**
 * E51 — Guard de ambiente no useUserRole (51.5): em produção o papel `dev`
 * perde o bypass E a herança hierárquica de rank; decisões de autorização
 * passam a considerar apenas papéis EXPLÍCITOS (user_roles).
 *
 * Contrato futuro:
 *   - prod + roles=['dev']             → isDev=false, isAdmin=false, hasRole('admin')=false
 *   - prod + roles=['dev','agent']     → hasRole('agent')=true (explícito), isAdmin=false
 *   - prod + roles=['dev','admin']     → isAdmin=true (explícito)
 *   - dev/staging + roles=['dev']      → comportamento histórico intacto (isDev=true, rank total)
 *   - hasRole('dev') preserva a IDENTIDADE (roles.includes('dev')) em qualquer env
 *
 * Estado RED esperado ANTES da implementação: o hook atual não lê o ambiente —
 * isDev/isAdmin permanecem true em produção → asserções de prod falham.
 */

const mockUseAuth = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => mockUseAuth);

function mockAuth(roles: string[]) {
  mockUseAuth.useAuth.mockReturnValue({
    roles,
    loading: false,
    refreshRoles: vi.fn(),
  });
}

describe('useUserRole com whitelist de ambiente (E51)', () => {
  beforeEach(() => {
    mockAuth(['dev']);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('produção (VITE_APP_ENV=production) — bypass dev BLOQUEADO', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_APP_ENV', 'production');
    });

    it('dev puro: perde bypass e herança de rank', () => {
      const { result } = renderHook(() => useUserRole());
      expect(result.current.isDev).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isManager).toBe(false);
      expect(result.current.isSupervisor).toBe(false);
      expect(result.current.hasRole('admin')).toBe(false);
      expect(result.current.hasRole('manager')).toBe(false);
      // identidade preservada: o papel dev ainda consta em user_roles
      expect(result.current.hasRole('dev')).toBe(true);
      expect(result.current.roles).toEqual(['dev']);
    });

    it('dev+agent: herança apenas do papel explícito', () => {
      mockAuth(['dev', 'agent']);
      const { result } = renderHook(() => useUserRole());
      expect(result.current.hasRole('agent')).toBe(true);
      expect(result.current.isSupervisor).toBe(false);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.isDev).toBe(false);
    });

    it('dev+admin: admin explícito continua valendo', () => {
      mockAuth(['dev', 'admin']);
      const { result } = renderHook(() => useUserRole());
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.hasRole('admin')).toBe(true);
      expect(result.current.isDev).toBe(false);
    });
  });

  describe('desenvolvimento (VITE_APP_ENV=development) — bypass dev MANTIDO', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_APP_ENV', 'development');
    });

    it('dev mantém bypass e herança hierárquica total', () => {
      const { result } = renderHook(() => useUserRole());
      expect(result.current.isDev).toBe(true);
      expect(result.current.isAdmin).toBe(true);
      expect(result.current.isManager).toBe(true);
      expect(result.current.hasRole('admin')).toBe(true);
      expect(result.current.hasRole('dev')).toBe(true);
    });
  });

  describe('staging (VITE_APP_ENV=staging) — bypass dev MANTIDO', () => {
    it('dev mantém bypass', () => {
      vi.stubEnv('VITE_APP_ENV', 'staging');
      const { result } = renderHook(() => useUserRole());
      expect(result.current.isDev).toBe(true);
      expect(result.current.isAdmin).toBe(true);
    });
  });
});
