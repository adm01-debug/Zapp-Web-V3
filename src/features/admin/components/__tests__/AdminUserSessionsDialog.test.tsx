/**
 * RED → GREEN: AdminUserSessionsDialog (Etapa 56.6 — listagem/revogação
 * remota de sessões por usuário, admin/supervisor).
 *
 * Contrato testado:
 *   - listagem: supabase.rpc('sessions_list', { p_target_user_id, p_admin: true })
 *   - revogação: supabase.functions.invoke('revoke-session', { body: { sessionId } })
 *   - 403 do edge → toast de erro, lista intacta
 *
 * Estado RED esperado (pré-implementação): componente não existe → falha de
 * import/parse (RED).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockRpc = vi.hoisted(() => vi.fn());
const mockFunctionsInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { AdminUserSessionsDialog } from '../AdminUserSessionsDialog';

const SESSIONS = [
  {
    id: 's1',
    user_id: 'u2',
    created_at: '2026-08-18T09:00:00Z',
    updated_at: '2026-08-18T09:00:00Z',
    last_active: '2026-08-18T10:30:00Z',
    user_agent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    ip: '10.1.1.1',
    aal: 'aal1',
    tag: null,
    factor_id: null,
  },
  {
    id: 's2',
    user_id: 'u2',
    created_at: '2026-08-17T09:00:00Z',
    updated_at: '2026-08-17T09:00:00Z',
    last_active: '2026-08-17T21:00:00Z',
    user_agent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36',
    ip: '10.2.2.2',
    aal: 'aal1',
    tag: null,
    factor_id: null,
  },
];

function renderDialog() {
  return render(
    <AdminUserSessionsDialog userId="u2" userName="Maria" open onOpenChange={vi.fn()} />
  );
}

describe('AdminUserSessionsDialog (E56.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'sessions_list') return Promise.resolve({ data: SESSIONS, error: null });
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    });
    mockFunctionsInvoke.mockImplementation((fn: string) => {
      if (fn === 'revoke-session') return Promise.resolve({ data: { success: true } });
      return Promise.resolve({ data: null, error: { message: `unexpected invoke ${fn}` } });
    });
  });

  it('lista sessões do usuário alvo via RPC com p_admin: true (device, ip, último uso)', async () => {
    renderDialog();

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('sessions_list', {
        p_target_user_id: 'u2',
        p_admin: true,
      });
    });
    expect(await screen.findByText('Desktop')).toBeTruthy();
    expect(screen.getByText(/10\.1\.1\.1/)).toBeTruthy();
    expect(screen.getByText('Dispositivo Móvel')).toBeTruthy();
    expect(screen.getByText(/10\.2\.2\.2/)).toBeTruthy();
  });

  it('revoga sessão remota via edge revoke-session e refaz a listagem', async () => {
    renderDialog();
    await screen.findByText('Desktop');

    const revokeButtons = screen.getAllByRole('button', { name: /encerrar/i });
    expect(revokeButtons).toHaveLength(2);

    fireEvent.click(revokeButtons[1]); // sessão s2 (móvel)

    await waitFor(() => {
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('revoke-session', {
        body: { sessionId: 's2' },
      });
    });
    // Refetch após revogar.
    await waitFor(() => {
      expect(mockRpc.mock.calls.filter((c) => c[0] === 'sessions_list').length).toBeGreaterThanOrEqual(2);
    });
    expect(toastMock.success).toHaveBeenCalledWith('Sessão encerrada');
  });

  it('403 do edge ao revogar → toast de erro e lista intacta', async () => {
    mockFunctionsInvoke.mockImplementation((fn: string) => {
      if (fn === 'revoke-session') {
        return Promise.resolve({ data: null, error: { message: 'Forbidden', status: 403 } });
      }
      return Promise.resolve({ data: null, error: { message: `unexpected invoke ${fn}` } });
    });

    renderDialog();
    await screen.findByText('Desktop');

    fireEvent.click(screen.getAllByRole('button', { name: /encerrar/i })[0]);

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Erro ao encerrar sessão');
    });
    // Lista intacta (sem refetch adicional por sucesso).
    expect(mockRpc.mock.calls.filter((c) => c[0] === 'sessions_list').length).toBe(1);
  });
});
