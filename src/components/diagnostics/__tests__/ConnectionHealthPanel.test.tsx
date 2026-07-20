import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode } from 'react';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockChannel = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    channel: mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: mockRemoveChannel,
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
}));

import { ConnectionHealthPanel } from '@/components/diagnostics/ConnectionHealthPanel';
import { toast } from 'sonner';

describe('ConnectionHealthPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders summary cards', async () => {
    render(<ConnectionHealthPanel />);
    await waitFor(() => {
      expect(screen.getByText('Conexões Saudáveis')).toBeInTheDocument();
      expect(screen.getByText('Tempo Médio')).toBeInTheDocument();
    });
  });

  it('shows 0/0 when no connections', async () => {
    render(<ConnectionHealthPanel />);
    await waitFor(() => expect(screen.getByText('0/0')).toBeInTheDocument());
  });

  it('shows empty log message', async () => {
    render(<ConnectionHealthPanel />);
    await waitFor(() =>
      expect(screen.getByText(/Nenhum health check registrado/)).toBeInTheDocument()
    );
  });

  it('calls edge function on button click', async () => {
    mockInvoke.mockResolvedValue({ data: { connections: [] }, error: null });
    render(<ConnectionHealthPanel />);
    await waitFor(() => expect(screen.getByText('Executar Health Check')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Executar Health Check'));
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('connection-health-check');
      expect(toast.success).toHaveBeenCalled();
    });
  });

  it('shows error on failed health check', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('fail') });
    render(<ConnectionHealthPanel />);
    await waitFor(() => expect(screen.getByText('Executar Health Check')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Executar Health Check'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Erro ao executar health check'));
  });

  it('subscribes to realtime channel', () => {
    render(<ConnectionHealthPanel />);
    expect(mockChannel).toHaveBeenCalledWith('health-updates');
  });

  it('unsubscribes on unmount via removeChannel', () => {
    const { unmount } = render(<ConnectionHealthPanel />);
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});
