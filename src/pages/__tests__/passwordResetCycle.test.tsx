/**
 * Ciclo completo de reset de senha — Etapa 55 (teste E2E do ciclo com mocks).
 *
 * Solicitar → Aprovar → Redefinir → Login com a nova senha.
 *
 * Emula o backend (EFs + auth) com um store in-memory compartilhado para
 * provar o ENCADEAMENTO das três unidades reais:
 *   useForgotPassword (solicitação via EF pública request-password-reset)
 *   → PasswordResetRequestsPanel (aprovação via EF approve-password-reset,
 *     emailSent=true)
 *   → ResetPassword (updateUser com a nova senha)
 *   → signInWithPassword (login com a nova senha).
 *
 * RED original: o hook inseria direto no banco (sem invoke) e o painel
 * ignorava emailSent — o encadeamento abaixo falhava nos elos 1 e 2.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useForgotPassword } from '@/hooks/useForgotPassword';
import { PasswordResetRequestsPanel } from '@/components/security/PasswordResetRequestsPanel';
import ResetPassword from '@/pages/ResetPassword';

// ─── Backend emulado (store in-memory + EFs simuladas) ───────────────────────

const { invokeMock, safeFromMock, updateUserMock, getSessionMock, onAuthStateChangeMock, signInWithPasswordMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  safeFromMock: vi.fn(),
  updateUserMock: vi.fn(),
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    auth: {
      updateUser: updateUserMock,
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
      signInWithPassword: signInWithPasswordMock,
    },
    channel: vi.fn(() => {
      const ch = {
        on: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(() => Promise.resolve()),
      };
      // chainable como supabase-js real (senão o cleanup do painel quebra)
      ch.on.mockImplementation(function (this: unknown) {
        return this;
      });
      ch.subscribe.mockImplementation(function (this: unknown) {
        return this;
      });
      return ch;
    }),
    removeChannel: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { from: safeFromMock },
}));

vi.mock('@/features/auth', () => ({
  PasswordStrengthMeter: () => null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

// AnimatePresence/motion quebram act no happy-dom — mock padrão do repo.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
}));

// State compartilhado entre as "EFs"
const store = {
  requests: [] as Array<Record<string, unknown>>,
  users: new Map<string, { email: string; password: string }>(),
};

function emulateBackend() {
  // EF request-password-reset (pública)
  invokeMock.mockImplementation(async (fn: string, opts?: { body?: Record<string, unknown> }) => {
    if (fn === 'request-password-reset') {
      const body = opts?.body as { email: string; reason?: string };
      const user = [...store.users.values()].find((u) => u.email === body.email);
      if (user) {
        store.requests.push({
          id: 'req-ciclo-1',
          user_id: 'u-1',
          email: body.email,
          reason: body.reason ?? null,
          status: 'pending',
          created_at: '2026-08-18T10:00:00Z',
        });
      }
      return { data: { success: true }, error: null }; // genérico (anti-enumeração)
    }
    if (fn === 'approve-password-reset') {
      const body = opts?.body as { requestId: string; action: string; rejectionReason?: string };
      const req = store.requests.find((r) => r.id === body.requestId);
      if (!req) return { data: null, error: new Error('Reset request not found') };
      if (body.action === 'reject') {
        req.status = 'rejected';
        req.rejection_reason = body.rejectionReason ?? null;
        return { data: { success: true, emailSent: true }, error: null };
      }
      req.status = 'approved';
      return {
        data: {
          success: true,
          emailSent: true, // email com o link REAL foi enviado
          resetLink: 'https://app.example/reset-password?token=abc123',
        },
        error: null,
      };
    }
    return { data: null, error: new Error(`unknown fn ${fn}`) };
  });

  // painel: lista do safe view
  safeFromMock.mockImplementation((_table: string, qb: (q: unknown) => unknown) => {
    const chain = { select: () => chain, order: () => chain };
    qb(chain);
    return Promise.resolve({
      data: store.requests.map((r) => ({ ...r })),
      error: null,
    });
  });

  // redefinição: atualiza a senha do usuário
  updateUserMock.mockImplementation(async ({ password }: { password: string }) => {
    const user = [...store.users.values()][0];
    user.password = password;
    return { error: null };
  });

  // sessão de recovery ativa na página ResetPassword
  getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } });
  onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
}

describe('Ciclo completo: solicitar → aprovar → redefinir → login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.requests = [];
    store.users.set('u-1', { email: 'usuario@exemplo.com', password: 'SenhaAntiga123!' });
    emulateBackend();
  });

  it('percorre o ciclo inteiro e loga com a nova senha', async () => {
    // 1) SOLICITAÇÃO (página pública /forgot-password)
    const { result } = renderHook(() => useForgotPassword());
    act(() => {
      result.current.setEmail('usuario@exemplo.com');
      result.current.setReason('Perdi o acesso');
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
    });
    expect(result.current.sent).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('request-password-reset', {
      body: { email: 'usuario@exemplo.com', reason: 'Perdi o acesso', userAgent: expect.any(String) },
    });
    expect(store.requests).toHaveLength(1);
    expect(store.requests[0].status).toBe('pending');

    // 2) APROVAÇÃO (painel admin)
    render(
      <MemoryRouter>
        <PasswordResetRequestsPanel />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }));
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('approve-password-reset', {
        body: { requestId: 'req-ciclo-1', action: 'approve' },
      });
    });
    await waitFor(() => {
      expect(store.requests[0].status).toBe('approved');
    });

    // 3) REDEFINIÇÃO (página /reset-password com token do email)
    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Nova Senha')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: 'NovaSenha123!' } });
    fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: 'NovaSenha123!' } });
    fireEvent.click(screen.getByRole('button', { name: /alterar senha/i }));
    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalledWith({ password: 'NovaSenha123!' });
    });
    await waitFor(() => {
      expect(screen.getByText('Senha Alterada!')).toBeInTheDocument();
    });

    // 4) LOGIN com a nova senha
    signInWithPasswordMock.mockImplementation(async ({ email, password }: { email: string; password: string }) => {
      const user = [...store.users.values()][0];
      const ok = user.email === email && user.password === password;
      return ok
        ? { data: { session: { user: { id: 'u-1' } } }, error: null }
        : { data: { session: null }, error: new Error('Invalid login credentials') };
    });
    const login = await signInWithPasswordMock({ email: 'usuario@exemplo.com', password: 'NovaSenha123!' });
    expect(login.error).toBeNull();
    expect(login.data.session).toBeTruthy();

    // a senha ANTIGA não loga mais
    const oldLogin = await signInWithPasswordMock({ email: 'usuario@exemplo.com', password: 'SenhaAntiga123!' });
    expect(oldLogin.error).not.toBeNull();
  });
});
