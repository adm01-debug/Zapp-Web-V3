import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAuthForm } from '../useAuthForm';

/**
 * useAuthForm — exchange do code PKCE no retorno do Google (FIX 2026-08-17).
 *
 * O client Supabase usa detectSessionInUrl=false + flowType=pkce, então o
 * ?code= trazido pelo provider NUNCA era trocado por sessão — o usuário
 * voltava do Google e ficava preso na tela de login. O fix adiciona um
 * useEffect que chama exchangeCodeForSession quando a URL tem ?code=.
 *
 * Este teste mocka apenas o supabase.auth.exchangeCodeForSession e confirma:
 * 1) é chamado com o code da URL;
 * 2) o code é removido da URL depois;
 * 3) sem code na URL, não é chamado.
 */
const { exchangeMock } = vi.hoisted(() => ({ exchangeMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/supabase/client')>();
  return {
    ...actual,
    supabase: {
      ...actual.supabase,
      auth: {
        ...(actual.supabase as typeof actual.supabase).auth,
        exchangeCodeForSession: exchangeMock,
      },
    },
  } as typeof actual;
});

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: null, signIn: vi.fn(), signUp: vi.fn() }),
}));

vi.mock('@/hooks/useWebAuthn', () => ({
  useWebAuthn: () => ({
    isSupported: () => false,
    isPlatformAuthenticatorAvailable: async () => false,
    authenticateWithPasskey: vi.fn(),
    loading: false,
  }),
}));

const withCodeWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/auth?code=oauth-code-123&next=%2F']}>{children}</MemoryRouter>
);

const withoutCodeWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/auth']}>{children}</MemoryRouter>
);

describe('useAuthForm — exchange PKCE no retorno do Google', () => {
  beforeEach(() => {
    exchangeMock.mockReset();
    exchangeMock.mockResolvedValue({ data: { session: null }, error: null });
    // O MemoryRouter não mexe no window.location real; o useEffect lê
    // window.location.search para achar o ?code= do provider.
    window.history.replaceState({}, '', '/auth');
  });

  it('chama exchangeCodeForSession com o code presente na URL', async () => {
    window.history.replaceState({}, '', '/auth?code=oauth-code-123&next=%2F');
    renderHook(() => useAuthForm(), { wrapper: withCodeWrapper });
    await waitFor(() => expect(exchangeMock).toHaveBeenCalledWith('oauth-code-123'));
  });

  it('remove o code da URL após o exchange (evita reprocessar em refresh)', async () => {
    window.history.replaceState({}, '', '/auth?code=oauth-code-123&next=%2F');
    renderHook(() => useAuthForm(), { wrapper: withCodeWrapper });
    await waitFor(() => expect(exchangeMock).toHaveBeenCalled());
    await waitFor(() => expect(window.location.search).not.toContain('code='));
  });

  it('mostra toast de erro quando o exchange falha', async () => {
    window.history.replaceState({}, '', '/auth?code=oauth-code-123&next=%2F');
    exchangeMock.mockResolvedValue({ data: { session: null }, error: new Error('invalid code') });
    const { toast } = await import('@/hooks/use-toast');
    renderHook(() => useAuthForm(), { wrapper: withCodeWrapper });
    await waitFor(() => expect(exchangeMock).toHaveBeenCalled());
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })));
  });

  it('não chama exchange quando a URL não tem code', () => {
    renderHook(() => useAuthForm(), { wrapper: withoutCodeWrapper });
    expect(exchangeMock).not.toHaveBeenCalled();
  });
});
