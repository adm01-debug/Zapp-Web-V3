import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute, __resetDevBypassBlockLogForTest } from '../ProtectedRoute';

/**
 * E51 — Contrato RBAC do bypass `dev` no ProtectedRoute (51.4/51.6/51.7/51.8).
 *
 * Contrato futuro:
 *   1. Em produção (VITE_APP_ENV=production), usuário com role `dev` SEM
 *      permissão explícita NÃO acessa rotas protegidas → redirect /access-denied.
 *   2. Em dev/staging o bypass continua funcionando.
 *   3. Em produção, rota que lista `dev` explicitamente em requiredRoles ainda
 *      concede acesso (grant explícito) — mesmo tratamento dos demais papéis.
 *   4. Tentativa de bypass bloqueada em produção gera log_security_event com
 *      p_event_type='dev_bypass_used' e p_status='blocked' (51.7).
 *   5. Safety net 10s NÃO redireciona quando já estamos em /auth (anti-loop 51.6).
 *
 * Estado RED esperado ANTES da implementação:
 *   - `isDevBypassAllowed` inexistente → erro de import (RED legítimo do contrato);
 *   - com o guard ausente, o bypass `dev` em prod concede acesso → asserções de
 *     bloqueio falham.
 */

const mockUseAuth = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

const mockUseRouteRoles = vi.hoisted(() => ({
  useRouteRoles: vi.fn(),
}));

const mockSupabase = vi.hoisted(() => ({
  supabase: {
    rpc: vi.fn(),
    auth: {
      getSession: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

const mockAppMetrics = vi.hoisted(() => ({
  markTimeToMainScreen: vi.fn(),
  recordAuthzFailure: vi.fn(),
}));

vi.mock('@/features/auth/hooks/useAuth', () => mockUseAuth);
vi.mock('@/features/auth/hooks/useRouteRoles', () => mockUseRouteRoles);
vi.mock('@/integrations/supabase/client', () => mockSupabase);
vi.mock('@/lib/appMetrics', () => mockAppMetrics);

interface AuthState {
  user: { id: string } | null;
  loading: boolean;
  roles: string[];
}

const authState: AuthState = {
  user: { id: 'user-1' },
  loading: false,
  roles: ['dev'],
};

function applyAuthState() {
  mockUseAuth.useAuth.mockReturnValue({
    user: authState.user,
    loading: authState.loading,
    signOut: vi.fn().mockResolvedValue(undefined),
    bootstrapError: null,
    bootstrapElapsedMs: null,
    retryBootstrap: vi.fn(),
    roles: authState.roles,
    permissions: [] as string[],
    refreshPermissions: vi.fn(),
    refreshRoles: vi.fn(),
  });
}

function renderProtected(ui: ReactElement, initialPath = '/admin') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/admin" element={ui} />
        <Route path="/access-denied" element={<div>PAGE_ACCESS_DENIED</div>} />
        <Route path="/auth" element={<div>AUTH_PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetDevBypassBlockLogForTest();
  authState.user = { id: 'user-1' };
  authState.loading = false;
  authState.roles = ['dev'];
  applyAuthState();
  mockUseRouteRoles.useRouteRoles.mockReturnValue(null);
  mockSupabase.supabase.rpc.mockResolvedValue({ data: false, error: null });
  mockSupabase.supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-1' } } },
    error: null,
  });
  mockSupabase.supabase.auth.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function rpcCalls() {
  return vi.mocked(mockSupabase.supabase.rpc).mock.calls;
}

function findSecurityEvent(predicate: (args: Record<string, unknown>) => boolean) {
  return rpcCalls().find(
    ([fn, args]) =>
      fn === 'log_security_event' && args != null && predicate(args as Record<string, unknown>)
  );
}

describe('ProtectedRoute — contrato RBAC do bypass dev (E51)', () => {
  describe('produção (VITE_APP_ENV=production)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_APP_ENV', 'production');
    });

    it('dev sem permissão explícita NÃO acessa rota que exige admin → /access-denied', async () => {
      renderProtected(
        <ProtectedRoute requiredRoles={['admin']}>
          <div>SECRET_CHILDREN</div>
        </ProtectedRoute>
      );

      expect(await screen.findByText('PAGE_ACCESS_DENIED')).toBeInTheDocument();
      expect(screen.queryByText('SECRET_CHILDREN')).not.toBeInTheDocument();
    });

    it('registra tentativa de bypass bloqueada (dev_bypass_used, status=blocked) e unauthorized_access', async () => {
      renderProtected(
        <ProtectedRoute requiredRoles={['admin']}>
          <div>SECRET_CHILDREN</div>
        </ProtectedRoute>
      );
      await screen.findByText('PAGE_ACCESS_DENIED');

      const blocked = findSecurityEvent((a) => a.p_event_type === 'dev_bypass_used');
      expect(blocked).toBeTruthy();
      expect(blocked?.[1]).toMatchObject({
        p_event_type: 'dev_bypass_used',
        p_status: 'blocked',
        p_resource: '/admin',
      });

      const denied = findSecurityEvent((a) => a.p_event_type === 'unauthorized_access');
      expect(denied).toBeTruthy();
      expect(denied?.[1]).toMatchObject({ p_status: 'denied' });
    });

    it('dev sem permissão NÃO acessa rota com requiredPermission negada → /access-denied', async () => {
      mockSupabase.supabase.rpc.mockImplementation((fn: string) => {
        if (fn === 'user_has_permission') return Promise.resolve({ data: false, error: null });
        return Promise.resolve({ data: false, error: null });
      });

      renderProtected(
        <ProtectedRoute requiredPermission="security.view">
          <div>SECRET_CHILDREN</div>
        </ProtectedRoute>
      );

      expect(await screen.findByText('PAGE_ACCESS_DENIED')).toBeInTheDocument();
      expect(screen.queryByText('SECRET_CHILDREN')).not.toBeInTheDocument();

      const blocked = findSecurityEvent((a) => a.p_event_type === 'dev_bypass_used');
      expect(blocked).toBeTruthy();
      expect(blocked?.[1]).toMatchObject({ p_status: 'blocked' });
    });

    it('dev com permissão explícita (RPC true) acessa rota com requiredPermission', async () => {
      mockSupabase.supabase.rpc.mockImplementation((fn: string) => {
        if (fn === 'user_has_permission') return Promise.resolve({ data: true, error: null });
        return Promise.resolve({ data: false, error: null });
      });

      renderProtected(
        <ProtectedRoute requiredPermission="security.view">
          <div>SECRET_CHILDREN</div>
        </ProtectedRoute>
      );

      expect(await screen.findByText('SECRET_CHILDREN')).toBeInTheDocument();
      expect(screen.queryByText('PAGE_ACCESS_DENIED')).not.toBeInTheDocument();
    });

    it('dev acessa rota que lista dev explicitamente em requiredRoles (grant explícito)', async () => {
      renderProtected(
        <ProtectedRoute requiredRoles={['admin', 'dev']}>
          <div>SECRET_CHILDREN</div>
        </ProtectedRoute>
      );

      expect(await screen.findByText('SECRET_CHILDREN')).toBeInTheDocument();
      expect(screen.queryByText('PAGE_ACCESS_DENIED')).not.toBeInTheDocument();
    });
  });

  describe('desenvolvimento (VITE_APP_ENV=development)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_APP_ENV', 'development');
    });

    it('dev acessa rota protegida (bypass ativo) e registra dev_bypass_used status=bypassed', async () => {
      renderProtected(
        <ProtectedRoute requiredRoles={['admin']}>
          <div>SECRET_CHILDREN</div>
        </ProtectedRoute>
      );

      expect(await screen.findByText('SECRET_CHILDREN')).toBeInTheDocument();
      expect(screen.queryByText('PAGE_ACCESS_DENIED')).not.toBeInTheDocument();

      const bypassed = findSecurityEvent((a) => a.p_event_type === 'dev_bypass_used');
      expect(bypassed).toBeTruthy();
      expect(bypassed?.[1]).toMatchObject({ p_status: 'bypassed' });
    });

    it('dev acessa rota com requiredPermission sem checagem (bypass cobre permissões)', async () => {
      renderProtected(
        <ProtectedRoute requiredPermission="security.view">
          <div>SECRET_CHILDREN</div>
        </ProtectedRoute>
      );

      expect(await screen.findByText('SECRET_CHILDREN')).toBeInTheDocument();
    });
  });

  describe('safety net 10s — anti-loop (51.6)', () => {
    it('em /auth com loading eterno NÃO redireciona para /auth (sem loop) e oferece saída', () => {
      vi.useFakeTimers();
      try {
        authState.loading = true;
        applyAuthState();

        // ProtectedRoute montado DENTRO da rota /auth (cenário do anti-loop)
        render(
          <MemoryRouter initialEntries={['/auth']}>
            <Routes>
              <Route
                path="/auth"
                element={
                  <ProtectedRoute>
                    <div>CHILDREN</div>
                  </ProtectedRoute>
                }
              />
              <Route path="/access-denied" element={<div>PAGE_ACCESS_DENIED</div>} />
            </Routes>
          </MemoryRouter>
        );

        act(() => {
          vi.advanceTimersByTime(11_000);
        });

        // Não redirecionou (sem Navigate) — fallback de timeout renderizado no lugar
        expect(screen.queryByText('CHILDREN')).not.toBeInTheDocument();
        expect(screen.getByText('Sair e tentar novamente')).toBeInTheDocument();
        // Continuamos na mesma rota /auth (sem redirect para /auth?reason=timeout)
        expect(screen.queryByText('AUTH_PAGE')).not.toBeInTheDocument();
        expect(screen.queryByText('PAGE_ACCESS_DENIED')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('em rota protegida com loading eterno redireciona para /auth?reason=timeout (comportamento histórico)', () => {
      vi.useFakeTimers();
      try {
        authState.loading = true;
        applyAuthState();

        renderProtected(
          <ProtectedRoute>
            <div>CHILDREN</div>
          </ProtectedRoute>,
          '/admin'
        );

        act(() => {
          vi.advanceTimersByTime(11_000);
        });

        expect(screen.getByText('AUTH_PAGE')).toBeInTheDocument();
        expect(screen.queryByText('CHILDREN')).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
