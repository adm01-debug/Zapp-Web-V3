/**
 * PasswordResetRequestsPanel — UI de APROVAÇÃO do reset de senha (Etapa 55).
 *
 * Contrato:
 *   - carrega solicitações via safeClient.from('password_reset_requests_safe');
 *   - Aprovar → invoke('approve-password-reset', { body: { requestId,
 *     action: 'approve' } }) + refetch;
 *   - Rejeitar → invoke com { requestId, action: 'reject', rejectionReason }.
 *
 * Contrato NOVO desta rodada (RED→GREEN): a EF agora retorna `emailSent` no
 * payload — quando false (falha de envio de email), o painel DEVE avisar com
 * toast.warning em vez de afirmar que o email foi enviado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { PasswordResetRequestsPanel } from '../PasswordResetRequestsPanel';
import { toast } from 'sonner';

const { invokeMock, safeFromMock, channelMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  safeFromMock: vi.fn(),
  channelMock: vi.fn(() => {
    const ch = {
      on: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(() => Promise.resolve()),
    };
    // chainable como supabase-js real: .on(...).subscribe() retorna o canal
    ch.on.mockImplementation(function (this: unknown) {
      return this;
    });
    ch.subscribe.mockImplementation(function (this: unknown) {
      return this;
    });
    return ch;
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
    channel: channelMock,
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { from: safeFromMock },
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

// Radix Tabs dispara "Should not already be working" no happy-dom (sem
// precedente no repo de tabs radix testadas) — mock funcional controlado.
vi.mock('@/components/ui/tabs', () => {
  const Tabs = ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children?: React.ReactNode;
  }) => (
    <div data-probe-tabs>
      {React.Children.map(children, (child) =>
        React.isValidElement<{ ctx?: { value?: string; onValueChange?: (v: string) => void } }>(child)
          ? React.cloneElement(child, { ctx: { value, onValueChange } })
          : child
      )}
    </div>
  );
  const TabsList = ({
    children,
    ctx,
  }: {
    children?: React.ReactNode;
    ctx?: { value?: string; onValueChange?: (v: string) => void };
  }) => (
    <div data-probe-tabslist>
      {React.Children.map(children, (child) =>
        React.isValidElement<{ ctx?: { value?: string; onValueChange?: (v: string) => void } }>(child)
          ? React.cloneElement(child, { ctx })
          : child
      )}
    </div>
  );
  const TabsTrigger = ({
    value,
    children,
    ctx,
  }: {
    value?: string;
    children?: React.ReactNode;
    ctx?: { value?: string; onValueChange?: (v: string) => void };
  }) => (
    <button
      type="button"
      role="tab"
      aria-selected={ctx?.value === value}
      onClick={() => ctx?.onValueChange?.(value ?? '')}
    >
      {children}
    </button>
  );
  return { Tabs, TabsList, TabsTrigger };
});

const pendingRequest = {
  id: 'req-1',
  user_id: 'u-1',
  email: 'usuario@exemplo.com',
  reason: 'Esqueci minha senha',
  status: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  rejection_reason: null,
  ip_address: null,
  user_agent: null,
  created_at: '2026-08-18T10:00:00Z',
};

const approvedRequest = {
  ...pendingRequest,
  id: 'req-2',
  email: 'aprovado@exemplo.com',
  status: 'approved',
  reviewed_by: 'admin-1',
  reviewed_at: '2026-08-18T10:05:00Z',
};

function mockList(rows: unknown[]) {
  safeFromMock.mockImplementation((_table: string, qb: (q: unknown) => unknown) => {
    const chain = {
      select: () => chain,
      order: () => chain,
      then: undefined,
    };
    qb(chain);
    return Promise.resolve({ data: rows, error: null });
  });
}

describe('PasswordResetRequestsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue({ data: { success: true, emailSent: true }, error: null });
  });

  it('renderiza solicitações pendentes com badge de contagem', async () => {
    mockList([pendingRequest, approvedRequest]);
    render(<PasswordResetRequestsPanel />);

    await waitFor(() => {
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });
    expect(screen.getByText(/1 pendente/)).toBeInTheDocument();
    // aba "Todas" mostra também as já processadas
    fireEvent.click(screen.getByRole('tab', { name: /todas/i }));
    await waitFor(() => {
      expect(screen.getByText('aprovado@exemplo.com')).toBeInTheDocument();
    });
  });

  it('aprovar → invoke approve-password-reset com requestId/action + refetch', async () => {
    mockList([pendingRequest]);
    render(<PasswordResetRequestsPanel />);

    await waitFor(() => {
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('approve-password-reset', {
        body: { requestId: 'req-1', action: 'approve' },
      });
    });
    // refetch após aprovação
    await waitFor(() => {
      expect(safeFromMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('aprovação com emailSent=false → toast.warning (NÃO afirma envio)', async () => {
    invokeMock.mockResolvedValue({ data: { success: true, emailSent: false }, error: null });
    mockList([pendingRequest]);
    render(<PasswordResetRequestsPanel />);

    await waitFor(() => {
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalled();
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('aprovação com emailSent=true → toast.success', async () => {
    mockList([pendingRequest]);
    render(<PasswordResetRequestsPanel />);

    await waitFor(() => {
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('rejeitar → invoke com rejectionReason', async () => {
    mockList([pendingRequest]);
    render(<PasswordResetRequestsPanel />);

    await waitFor(() => {
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /rejeitar/i }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByPlaceholderText(/atividade suspeita/i), {
      target: { value: 'Conta duplicada' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rejeitar' }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('approve-password-reset', {
        body: { requestId: 'req-1', action: 'reject', rejectionReason: 'Conta duplicada' },
      });
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('evento realtime → refetch da lista', async () => {
    mockList([pendingRequest]);
    render(<PasswordResetRequestsPanel />);

    await waitFor(() => {
      expect(screen.getByText('usuario@exemplo.com')).toBeInTheDocument();
    });
    const callsBefore = safeFromMock.mock.calls.length;

    // callback de postgres_changes capturado pelo .on() do canal real
    const channel = channelMock.mock.results[0].value;
    const onCall = channel.on.mock.calls[0];
    expect(onCall[0]).toBe('postgres_changes');
    act(() => {
      onCall[2]();
    });

    await waitFor(() => {
      expect(safeFromMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
