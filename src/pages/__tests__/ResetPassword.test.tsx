/**
 * ResetPassword — etapa de REDEFINIÇÃO do reset de senha (Etapa 55).
 *
 * Contrato:
 *   - sem sessão de recovery → "Link Inválido" + botão para /forgot-password;
 *   - senha fraca (sem maiúscula/número/especial/<8) → erro e updateUser NUNCA
 *     chamado;
 *   - senhas diferentes → erro de confirmação;
 *   - senha forte → updateUser({ password }) → tela de sucesso "Senha Alterada!".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from '../ResetPassword';
import { toast } from 'sonner';

const { updateUserMock, getSessionMock, onAuthStateChangeMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(),
  getSessionMock: vi.fn(),
  onAuthStateChangeMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      updateUser: updateUserMock,
      getSession: getSessionMock,
      onAuthStateChange: onAuthStateChangeMock,
    },
  },
}));

vi.mock('@/features/auth', () => ({
  PasswordStrengthMeter: () => null,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>
  );
}

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onAuthStateChangeMock.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  });

  it('sem sessão de recovery → Link Inválido + caminho para nova solicitação', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Link Inválido')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /solicitar novo link/i })).toBeInTheDocument();
  });

  it('senha fraca → erro e updateUser NUNCA chamado', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Nova Senha')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: 'fraca' } });
    fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: 'fraca' } });
    fireEvent.click(screen.getByRole('button', { name: /alterar senha/i }));

    await waitFor(() => {
      expect(screen.getByText(/mínimo 8 caracteres/i)).toBeInTheDocument();
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('senha forte mas confirmação diferente → erro de confirmação', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Nova Senha')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: 'NovaSenha123!' } });
    fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: 'Diferente123!' } });
    fireEvent.click(screen.getByRole('button', { name: /alterar senha/i }));

    await waitFor(() => {
      expect(screen.getByText(/as senhas não coincidem/i)).toBeInTheDocument();
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('senha forte + confirmação igual → updateUser({ password }) + tela de sucesso', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    updateUserMock.mockResolvedValue({ error: null });
    renderPage();

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
    expect(toast.success).toHaveBeenCalled();
  });

  it('erro do updateUser → toast.error + permanece no formulário', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    updateUserMock.mockResolvedValue({ error: new Error('token expirado') });
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Nova Senha')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Nova Senha'), { target: { value: 'NovaSenha123!' } });
    fireEvent.change(screen.getByLabelText('Confirmar Senha'), { target: { value: 'NovaSenha123!' } });
    fireEvent.click(screen.getByRole('button', { name: /alterar senha/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(screen.queryByText('Senha Alterada!')).not.toBeInTheDocument();
  });
});
