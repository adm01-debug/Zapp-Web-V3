import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthForm } from '../useAuthForm';

/**
 * E52 — MFA fail-closed condicional (redirectAfterAuth).
 *
 * 5 ramos cobertos:
 *  R1: aal1→aal2 (sem erro) → navega /2fa
 *  R2: getAAL erro + fator TOTP verified → navega /2fa (fail-closed)
 *  R3: getAAL erro + sem fator verified → navega path (evita lockout)
 *  R4: exceção em getAAL + fator verified → navega /2fa
 *  R5: exceção em getAAL + sem fator verified → navega path
 *
 * Usuário com sessão ativa (user setado) para o useEffect disparar redirectAfterAuth.
 */

const mfa = vi.hoisted(() => ({
  getAAL: vi.fn(),
  listFactors: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/supabase/client')>();
  return {
    ...actual,
    supabase: {
      ...actual.supabase,
      auth: {
        ...(actual.supabase as unknown as typeof actual.supabase).auth,
        mfa: {
          getAuthenticatorAssuranceLevel: mfa.getAAL,
          listFactors: mfa.listFactors,
        },
      },
    },
  } as unknown as typeof actual;
});

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'dev@x.com' },
    signIn: vi.fn(),
    signUp: vi.fn(),
  }),
}));

vi.mock('@/hooks/useWebAuthn', () => ({
  useWebAuthn: () => ({
    isSupported: () => false,
    isPlatformAuthenticatorAvailable: async () => false,
    authenticateWithPasskey: vi.fn(),
    loading: false,
  }),
}));

// Captura o navigate do react-router para afirmar o destino real
const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/dashboard']}>{children}</MemoryRouter>
);

const verifiedTotp = [{ id: 't1', status: 'verified', type: 'totp' }];
const noFactors: { id: string; status: string; type: string }[] = [];

describe('useAuthForm — E52 MFA fail-closed', () => {
  beforeEach(() => {
    mfa.getAAL.mockReset();
    mfa.listFactors.mockReset();
    navigateMock.mockReset();
    mfa.listFactors.mockResolvedValue({ data: { totp: noFactors, webauthn: [] }, error: null });
  });

  it('R1: aal1→aal2 sem erro → navega /2fa', async () => {
    mfa.getAAL.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    renderHook(() => useAuthForm(), { wrapper });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/2fa', { replace: true });
    });
  });

  it('R2: getAAL erro + fator verified → /2fa (fail-closed)', async () => {
    mfa.getAAL.mockResolvedValue({ data: null, error: { message: 'boom' } });
    mfa.listFactors.mockResolvedValue({ data: { totp: verifiedTotp, webauthn: [] }, error: null });
    renderHook(() => useAuthForm(), { wrapper });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/2fa', { replace: true });
    });
  });

  it('R3: getAAL erro + sem fator → navega path (sem lockout)', async () => {
    mfa.getAAL.mockResolvedValue({ data: null, error: { message: 'boom' } });
    mfa.listFactors.mockResolvedValue({ data: { totp: noFactors, webauthn: [] }, error: null });
    renderHook(() => useAuthForm(), { wrapper });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('R4: exceção getAAL + fator verified → /2fa', async () => {
    mfa.getAAL.mockRejectedValue(new Error('network'));
    mfa.listFactors.mockResolvedValue({ data: { totp: verifiedTotp, webauthn: [] }, error: null });
    renderHook(() => useAuthForm(), { wrapper });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/2fa', { replace: true });
    });
  });

  it('R5: exceção getAAL + sem fator → navega path', async () => {
    mfa.getAAL.mockRejectedValue(new Error('network'));
    mfa.listFactors.mockResolvedValue({ data: { totp: noFactors, webauthn: [] }, error: null });
    renderHook(() => useAuthForm(), { wrapper });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    });
  });
});
