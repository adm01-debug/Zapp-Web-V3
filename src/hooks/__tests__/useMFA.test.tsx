
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        listFactors: vi.fn().mockResolvedValue({ data: { totp: [], phone: [], all: [] }, error: null } as any),
        unenroll: vi.fn(),
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] }, error: null } as any),
      },
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger');

import { supabase } from '@/integrations/supabase/client';
import { useMFA } from '@/hooks/useMFA';

describe('useMFA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.auth.mfa.listFactors).mockResolvedValue({ data: { totp: [], phone: [], all: [] }, error: null } as any);
    vi.mocked(supabase.auth.mfa.getAuthenticatorAssuranceLevel).mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] }, error: null } as any);
  });

  it('initializes with default state', () => {
    const { result } = renderHook(() => useMFA());
    expect(result.current.loading).toBe(false);
    expect(result.current.isMFAEnabled).toBe(false);
  });

  it('enrollTOTP calls mfa.enroll', async () => {
    vi.mocked(supabase.auth.mfa.enroll).mockResolvedValue({ data: { id: 'f1', type: 'totp', totp: { qr_code: 'qr', secret: 'ABC', uri: 'otpauth://...' } }, error: null } as any);

    const { result } = renderHook(() => useMFA());
    await act(async () => {
      await result.current.enrollTOTP();
    });
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Authenticator App',
    });
  });

  it('verifyTOTP calls challenge then verify', async () => {
    vi.mocked(supabase.auth.mfa.challenge).mockResolvedValue({ data: { id: 'ch-1' }, error: null } as any);
    vi.mocked(supabase.auth.mfa.verify).mockResolvedValue({ data: {}, error: null } as any);

    const { result } = renderHook(() => useMFA());
    await act(async () => {
      await result.current.verifyTOTP('f1', '123456');
    });
    expect(supabase.auth.mfa.challenge).toHaveBeenCalledWith({ factorId: 'f1' });
    expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({
      factorId: 'f1',
      challengeId: 'ch-1',
      code: '123456',
    });
  });

  it('unenroll calls mfa.unenroll', async () => {
    vi.mocked(supabase.auth.mfa.unenroll).mockResolvedValue({ data: { id: 'f1' }, error: null } as any);
    const { result } = renderHook(() => useMFA());
    await act(async () => {
      await result.current.unenroll('f1');
    });
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'f1' });
  });

  it('fetchFactors retrieves TOTP factors', async () => {
    vi.mocked(supabase.auth.mfa.listFactors).mockResolvedValue({ data: { totp: [{ id: 'f1', factor_type: 'totp', status: 'verified', created_at: '', updated_at: '' }], phone: [], all: [] }, error: null } as any);

    const { result } = renderHook(() => useMFA());
    await act(async () => {
      await result.current.fetchFactors();
    });
    expect(result.current.factors).toHaveLength(1);
    expect(result.current.isMFAEnabled).toBe(true);
  });
});