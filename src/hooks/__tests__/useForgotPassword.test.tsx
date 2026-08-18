/**
 * useForgotPassword — fluxo de SOLICITAÇÃO de reset (Etapa 55).
 *
 * Contrato (RED→GREEN desta rodada): a solicitação NÃO pode mais inserir
 * direto no banco (RLS de zapp.password_reset_requests é authenticated-only;
 * anon não consegue ler profiles — o fluxo público morre no cliente). O hook
 * passa a chamar a EF pública `request-password-reset` via
 * supabase.functions.invoke.
 *
 * Comportamento esperado:
 *   - email válido → invoke('request-password-reset', { body: { email, reason,
 *     userAgent } }) → sent=true + toast de sucesso;
 *   - email inválido → erro visível, invoke NUNCA chamado;
 *   - erro da EF → estado de erro + toast.error (sem estado sent);
 *   - loading durante o submit.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useForgotPassword } from '@/hooks/useForgotPassword';
import { toast } from 'sonner';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const fakeEvent = () => ({ preventDefault: vi.fn() }) as unknown as React.FormEvent;

describe('useForgotPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
  });

  it('submits email via request-password-reset invoke e marca como enviado', async () => {
    const { result } = renderHook(() => useForgotPassword());
    act(() => {
      result.current.setEmail('usuario@exemplo.com');
      result.current.setReason('Esqueci minha senha');
    });

    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('request-password-reset', {
      body: {
        email: 'usuario@exemplo.com',
        reason: 'Esqueci minha senha',
        userAgent: expect.any(String),
      },
    });
    await waitFor(() => expect(result.current.sent).toBe(true));
    expect(toast.success).toHaveBeenCalled();
  });

  it('email inválido → erro visível e invoke NUNCA chamado', async () => {
    const { result } = renderHook(() => useForgotPassword());
    act(() => {
      result.current.setEmail('nao-e-email');
    });

    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.error).not.toBe('');
    expect(result.current.sent).toBe(false);
  });

  it('erro da EF → estado de erro + toast.error, sem marcar enviado', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('rate limit') });
    const { result } = renderHook(() => useForgotPassword());
    act(() => {
      result.current.setEmail('usuario@exemplo.com');
    });

    await act(async () => {
      await result.current.handleSubmit(fakeEvent());
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.current.sent).toBe(false);
    expect(result.current.error).not.toBe('');
    expect(toast.error).toHaveBeenCalled();
  });

  it('loading é true durante o submit', async () => {
    let resolveInvoke!: (v: unknown) => void;
    invokeMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve;
        })
    );
    const { result } = renderHook(() => useForgotPassword());
    act(() => {
      result.current.setEmail('usuario@exemplo.com');
    });

    let promise!: Promise<void>;
    act(() => {
      promise = result.current.handleSubmit(fakeEvent());
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveInvoke({ data: { success: true }, error: null });
      await promise;
    });
    expect(result.current.loading).toBe(false);
  });
});
