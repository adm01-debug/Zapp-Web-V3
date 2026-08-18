/**
 * RED → GREEN: gestão de sessões ativas (Etapa 56) — contrato REAL.
 *
 * Contrato testado (implementação-alvo do hook useDeviceDetectionManagement):
 *   - fetchSessions  → supabase.rpc('sessions_list', { p_target_user_id })  (auth.sessions real)
 *   - endSession     → supabase.functions.invoke('revoke-session', { body: { sessionId } })
 *   - revoke de OUTRO usuário → edge responde 403 → endSession REJEITA (toast de erro)
 *   - sessão atual marcada via claim `session_id` do access token (JWT)
 *
 * Estado RED esperado (pré-implementação): o hook atual lê a tabela local
 * `user_sessions` (.from) e encerra sessão com .update() local — nenhum dos
 * contratos acima existe → todos os testes falham (RED).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 60_000 },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockFrom = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockFunctionsInvoke = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());

/** JWT fake com claim session_id (GoTrue expõe session_id no access token). */
function makeToken(claims: Record<string, unknown>): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`;
}
const ACCESS_TOKEN = makeToken({ sub: 'u1', session_id: 'sess-current' });

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
}));

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/lib/logger');

import { useDeviceDetection } from '@/hooks/useDeviceDetection';

/** Shape real do RPC zapp.sessions_list (auth.sessions). */
const SESSIONS = [
  {
    id: 'sess-current',
    user_id: 'u1',
    created_at: '2026-08-18T09:00:00Z',
    updated_at: '2026-08-18T09:00:00Z',
    last_active: '2026-08-18T10:00:00Z',
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ip: '10.1.1.1',
    aal: 'aal1',
    tag: null,
    factor_id: null,
  },
  {
    id: 'sess-other',
    user_id: 'u1',
    created_at: '2026-08-17T09:00:00Z',
    updated_at: '2026-08-17T09:00:00Z',
    last_active: '2026-08-17T20:00:00Z',
    user_agent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36',
    ip: '10.2.2.2',
    aal: 'aal1',
    tag: null,
    factor_id: null,
  },
];

describe('useDeviceDetection — sessões ativas (E56)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: ACCESS_TOKEN } },
    });
    // detect-new-device (device check) — sempre ok.
    mockFunctionsInvoke.mockImplementation((fn: string) => {
      if (fn === 'detect-new-device') return Promise.resolve({ data: { device_id: 'd1' } });
      if (fn === 'revoke-session') return Promise.resolve({ data: { success: true } });
      return Promise.resolve({ data: null, error: { message: `unexpected invoke ${fn}` } });
    });
    // Listagem real: RPC sessions_list.
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'sessions_list') return Promise.resolve({ data: SESSIONS, error: null });
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    });
    // Legado (user_devices / user_sessions locais) — chain mínima.
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
        neq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lista sessões via RPC sessions_list (device, ip, last_active)', async () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockRpc).toHaveBeenCalledWith('sessions_list', { p_target_user_id: 'u1' });
    expect(result.current.sessions).toHaveLength(2);
    expect(result.current.sessions[0]).toMatchObject({
      id: 'sess-current',
      user_agent: expect.stringContaining('Chrome'),
      ip: '10.1.1.1',
      last_active: expect.any(String),
    });
  });

  it('marca a sessão atual pelo claim session_id do access token', async () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.currentSessionId).toBe('sess-current'));
    expect(result.current.sessions.find((s) => s.id === 'sess-current')).toBeTruthy();
  });

  it('revoga a própria sessão via edge revoke-session e refaz a listagem', async () => {
    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.endSession('sess-other');
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('revoke-session', {
      body: { sessionId: 'sess-other' },
    });
    // Refetch após revogar (sessão revogada some da lista).
    expect(mockRpc.mock.calls.filter((c) => c[0] === 'sessions_list').length).toBeGreaterThanOrEqual(2);
  });

  it('revogar sessão de outro usuário (403 do edge) → rejeita e mantém a lista', async () => {
    mockFunctionsInvoke.mockImplementation((fn: string) => {
      if (fn === 'detect-new-device') return Promise.resolve({ data: { device_id: 'd1' } });
      if (fn === 'revoke-session') {
        return Promise.resolve({ data: null, error: { message: 'Forbidden', status: 403 } });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected invoke ${fn}` } });
    });

    const { result } = renderHook(() => useDeviceDetection(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.endSession('sess-current')).rejects.toThrow();
    });

    // Lista intacta (nenhuma sessão removida localmente).
    expect(result.current.sessions).toHaveLength(2);
    expect(mockRpc.mock.calls.filter((c) => c[0] === 'sessions_list').length).toBe(1);
  });
});
