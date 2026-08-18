/**
 * useAdminData — convites de usuário via invoke (E57) — TDD RED→GREEN.
 *
 * Contrato (Etapa 57.2/57.3/57.5 do plano; edge `invite-user`):
 *   const { handleInviteUser, handleCreateUser } = useAdminData(tab);
 *   await handleInviteUser({ email, role: 'admin'|'supervisor'|'agent', message? })
 *     → Promise<boolean>  (true = convite criado; false = erro com toast honesto)
 *
 * Eixos cobertos (RED até a implementação):
 *   1. CONVITE OK    — invoke('invite-user') com body { email, role, message },
 *                      toast.success, retorna true.
 *   2. DUPLICADO     — erro do servidor (ex.: 'Email already registered') é
 *                      exibido VERBATIM no toast.error (erro honesto, não
 *                      mensagem genérica), retorna false, sem toast.success.
 *   3. NÃO-ADMIN     — 403 do servidor ('Forbidden: admin or supervisor
 *                      required') → toast.error verbatim, retorna false.
 *   4. CRIAR VIA INVOKE (B30) — handleCreateUser usa functions.invoke e NUNCA
 *                      fetch raw (grep: zero `fetch(` em useAdminData.ts).
 *   5. FALHA DE REDE — error sem `context` → toast genérico honesto.
 *
 * Erro TS2339 em `result.current.handleInviteUser` é RED válido do contrato
 * futuro — some junto com a implementação (SWC não typechecka em runtime).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => {
  const invoke = vi.fn();
  const from = vi.fn(() => {
    const target = () => Promise.resolve({ data: [], error: null });
    const c = Object.assign(target, {
      select: vi.fn(() => c),
      order: vi.fn(() => c),
      limit: vi.fn(() => c),
      eq: vi.fn(() => c),
      in: vi.fn(() => c),
      update: vi.fn(() => c),
      insert: vi.fn(() => c),
      upsert: vi.fn(() => c),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    });
    return c;
  });
  return {
    supabase: {
      functions: { invoke },
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'test-token' } },
        }),
      },
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ error: null }),
        })),
      },
      from,
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { useAdminData } from '@/features/admin/hooks/useAdminData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const mockInvoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;
const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 60000 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

/** Erro no shape do supabase-js v2: { data: null, error: FunctionsHttpError } */
function httpError(body: { error: string }, status = 409) {
  return { context: { status, json: vi.fn().mockResolvedValue(body) } };
}

describe('useAdminData — convites (E57)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('convida usuário com sucesso via invoke (sem fetch raw)', async () => {
    mockInvoke.mockResolvedValue({ data: { success: true, invite_id: 'inv-1' }, error: null });

    const { result } = renderHook(() => useAdminData('users'), { wrapper: createWrapper() });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleInviteUser({
        email: 'novo@atomica.br',
        role: 'supervisor',
        message: 'Bem-vindo ao time',
      });
    });

    expect(ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('invite-user', {
      body: { email: 'novo@atomica.br', role: 'supervisor', message: 'Bem-vindo ao time' },
    });
    expect(mockToast.success).toHaveBeenCalledWith('Convite enviado para novo@atomica.br!');
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('email duplicado → erro honesto do servidor (409) no toast, sem sucesso', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({ error: 'Email already registered' }, 409),
    });

    const { result } = renderHook(() => useAdminData('users'), { wrapper: createWrapper() });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleInviteUser({ email: 'duplicado@atomica.br', role: 'agent' });
    });

    expect(ok).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith('Email already registered');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('não-admin → 403 do servidor → erro honesto no toast', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError({ error: 'Forbidden: admin or supervisor required' }, 403),
    });

    const { result } = renderHook(() => useAdminData('users'), { wrapper: createWrapper() });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleInviteUser({ email: 'x@atomica.br', role: 'admin' });
    });

    expect(ok).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith('Forbidden: admin or supervisor required');
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it('criação de usuário usa functions.invoke e NUNCA fetch raw (B30)', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchSpy);
    mockInvoke.mockResolvedValue({ data: { success: true, user_id: 'u-1' }, error: null });

    const { result } = renderHook(() => useAdminData('users'), { wrapper: createWrapper() });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleCreateUser({
        name: 'João',
        email: 'joao@atomica.br',
        password: 'segredo123',
        role: 'agent',
      });
    });

    expect(ok).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith(
      'create-user',
      expect.objectContaining({
        body: expect.objectContaining({
          email: 'joao@atomica.br',
          password: 'segredo123',
          role: 'agent',
        }),
      })
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockToast.success).toHaveBeenCalledWith('Usuário criado com sucesso!');
  });

  it('falha sem contexto (rede) → toast genérico honesto', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('network down') });

    const { result } = renderHook(() => useAdminData('users'), { wrapper: createWrapper() });

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.handleInviteUser({ email: 'rede@atomica.br', role: 'agent' });
    });

    expect(ok).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith('Erro ao enviar convite');
  });
});
