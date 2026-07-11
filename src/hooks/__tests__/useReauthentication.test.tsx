import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockGetUser = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { useReauthentication } from '@/hooks/useReauthentication';

interface ReauthResult {
  success: boolean;
  error?: string;
}

describe('useReauthentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with correct default state', () => {
    const { result } = renderHook(() => useReauthentication());

    expect(result.current.isReauthenticating).toBe(false);
    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('reauthenticate succeeds with correct password', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });
    mockSignInWithPassword.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult!: ReauthResult;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('correctpass');
    });

    expect(reauthResult.success).toBe(true);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'correctpass',
    });
  });

  it('reauthenticate fails with incorrect password', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });
    mockSignInWithPassword.mockResolvedValue({
      error: new Error('Invalid credentials'),
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult!: ReauthResult;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('wrongpass');
    });

    expect(reauthResult.success).toBe(false);
    expect(reauthResult.error).toBe('Senha incorreta');
  });

  it('reauthenticate fails when no user found', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    });

    const { result } = renderHook(() => useReauthentication());

    let reauthResult!: ReauthResult;
    await act(async () => {
      reauthResult = await result.current.reauthenticate('anypass');
    });

    expect(reauthResult.success).toBe(false);
    expect(reauthResult.error).toBe('Usuário não encontrado');
  });

  it('requireReauth sets pending action and shows dialog', () => {
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', async () => {});
    });

    expect(result.current.showReauthDialog).toBe(true);
    expect(result.current.pendingAction).toBe('change_password');
  });

  it('cancelReauth resets state', () => {
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('delete_account', async () => {});
    });

    expect(result.current.showReauthDialog).toBe(true);

    act(() => {
      result.current.cancelReauth();
    });

    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });

  it('getActionLabel returns correct labels', () => {
    const { result } = renderHook(() => useReauthentication());

    expect(result.current.getActionLabel('change_password')).toBe('Alterar Senha');
    expect(result.current.getActionLabel('change_email')).toBe('Alterar Email');
    expect(result.current.getActionLabel('configure_mfa')).toBe('Configurar MFA');
    expect(result.current.getActionLabel('admin_action')).toBe('Ação Administrativa');
    expect(result.current.getActionLabel('delete_account')).toBe('Excluir Conta');
  });

  it('confirmReauth executes callback on success', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com' } },
    });
    mockSignInWithPassword.mockResolvedValue({ error: null });

    const callback = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useReauthentication());

    act(() => {
      result.current.requireReauth('change_password', callback);
    });

    let confirmResult: boolean = false;
    await act(async () => {
      confirmResult = await result.current.confirmReauth('correctpass');
    });

    expect(confirmResult).toBe(true);
    expect(callback).toHaveBeenCalled();
    expect(result.current.showReauthDialog).toBe(false);
    expect(result.current.pendingAction).toBeNull();
  });
});
