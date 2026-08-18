import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// MELHORIA 2 — fail-open do download de mídia → fail-closed.
// useDownloadPermissionManagement (useMediaManagement.ts): erro de RPC
// (ausente 42883/PGRST202, rede, auth, RLS) NUNCA pode liberar o download.
// A RPC check_download_permission NÃO existe no DB nem nas migrations do repo
// (confirmado via pg_proc: 0 linhas em public/zapp) — qualquer erro = negar.

type RpcResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

const mockRpc = vi.hoisted(
  () =>
    vi.fn<(name: string, params?: Record<string, unknown>) => Promise<RpcResult>>()
);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc },
}));

import { useDownloadPermissionManagement } from '@/hooks/useMediaManagement';
import { log } from '@/lib/logger';

describe('useDownloadPermissionManagement — fail-closed (MELHORIA 2)', () => {
  let spyError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    spyError = vi.spyOn(log, 'error');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem resourceId → permissão true sem chamar a RPC (fluxo preservado)', () => {
    const { result } = renderHook(() => useDownloadPermissionManagement());

    expect(result.current.hasPermission).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('RPC ausente (42883) → hasPermission=false + log.error com contexto (fail-closed)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function check_download_permission() does not exist' },
    });

    const { result } = renderHook(() => useDownloadPermissionManagement('res-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasPermission).toBe(false);
    expect(result.current.canDownload).toBe(false);
    expect(mockRpc).toHaveBeenCalledWith('check_download_permission', {
      resource_id: 'res-1',
    });
    expect(spyError).toHaveBeenCalledWith(
      expect.stringContaining('fail-closed'),
      expect.objectContaining({
        rpc: 'check_download_permission',
        resourceId: 'res-1',
        code: '42883',
        message: 'function check_download_permission() does not exist',
      })
    );
  });

  it('RPC ausente (PGRST202) → hasPermission=false + log.error (fail-closed)', async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.check_download_permission in the schema cache',
      },
    });

    const { result } = renderHook(() => useDownloadPermissionManagement('res-2'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasPermission).toBe(false);
    expect(spyError).toHaveBeenCalledWith(
      expect.stringContaining('fail-closed'),
      expect.objectContaining({ rpc: 'check_download_permission', resourceId: 'res-2', code: 'PGRST202' })
    );
  });

  it('erro de rede (sem code) → hasPermission=false + log.error (fail-closed)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });

    const { result } = renderHook(() => useDownloadPermissionManagement('res-3'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasPermission).toBe(false);
    expect(spyError).toHaveBeenCalledWith(
      expect.stringContaining('fail-closed'),
      expect.objectContaining({ rpc: 'check_download_permission', resourceId: 'res-3', code: null })
    );
  });

  it('fluxo feliz: RPC existe e retorna true → hasPermission=true (NÃO mudou)', async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    const { result } = renderHook(() => useDownloadPermissionManagement('res-ok'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasPermission).toBe(true);
    expect(result.current.canDownload).toBe(true);
    expect(spyError).not.toHaveBeenCalled();
  });

  it('fluxo feliz: RPC existe e retorna false → hasPermission=false (NÃO mudou)', async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    const { result } = renderHook(() => useDownloadPermissionManagement('res-no'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasPermission).toBe(false);
    expect(spyError).not.toHaveBeenCalled();
  });

  it('fluxo feliz: RPC retorna data null sem erro → hasPermission=false (Boolean(null), NÃO mudou)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useDownloadPermissionManagement('res-null'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasPermission).toBe(false);
    expect(spyError).not.toHaveBeenCalled();
  });
});
