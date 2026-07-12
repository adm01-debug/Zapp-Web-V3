/**
 * Integration test: valida o fluxo completo de warroom_alerts a partir do
 * evento Realtime até a entrega da push notification, garantindo que o novo
 * enum `alert_type` seja aplicado corretamente e que payloads inválidos
 * (violando o enum) sejam descartados sem quebrar o hook.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const showNotificationMock = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
type RealtimeHandler = (payload: { new: unknown }) => void;
let capturedHandler: RealtimeHandler | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: vi.fn().mockImplementation(() => ({
      on: (_event: string, _cfg: unknown, handler: RealtimeHandler) => {
        capturedHandler = handler;
        return { subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }) };
      },
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    })),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    showNotification: showNotificationMock,
    permission: 'granted',
  }),
}));

// Silencia o Audio() (jsdom não implementa play()).
class FakeAudio {
  volume = 1;
  currentTime = 0;
  play() { return Promise.resolve(); }
}
// @ts-expect-error override para o teste
globalThis.Audio = FakeAudio;

import { useWarRoomAlerts } from '@/hooks/useWarRoomAlerts';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const UUID = '22222222-2222-4222-8222-222222222222';

describe('useWarRoomAlerts — fluxo integrado warroom_alerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandler = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'warroom_alerts') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          or: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      };
    });
  });

  it('dispara showNotification para alert_type=critical válido', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    capturedHandler!({
      new: {
        id: UUID,
        alert_type: 'critical',
        title: 'Alerta Crítico',
        message: 'Fila travada há 10min',
        source: 'monitor',
        is_read: false,
        created_at: new Date().toISOString(),
      },
    });

    await waitFor(() => expect(showNotificationMock).toHaveBeenCalledTimes(1));
    expect(showNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Alerta Crítico'),
        requireInteraction: true, // exige interação em `critical`
      }),
    );
  });

  it('aceita alert_type=sla_breach (novo valor do enum)', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    capturedHandler!({
      new: {
        id: UUID, alert_type: 'sla_breach',
        title: 'SLA Violado', message: 'Ticket #42', source: 'sla-monitor',
        is_read: false, created_at: new Date().toISOString(),
      },
    });

    await waitFor(() => expect(showNotificationMock).toHaveBeenCalledTimes(1));
    // Não é 'critical' -> requireInteraction = false
    expect(showNotificationMock.mock.calls[0][0].requireInteraction).toBe(false);
  });

  it('descarta payload com alert_type fora do enum (não notifica)', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    capturedHandler!({
      new: {
        id: UUID, alert_type: 'urgent', // valor inválido
        title: 'x', message: 'y', source: null,
        is_read: false, created_at: new Date().toISOString(),
      },
    });

    // Pequeno delay para garantir que nenhum microtask agende a notificação.
    await new Promise((r) => setTimeout(r, 20));
    expect(showNotificationMock).not.toHaveBeenCalled();
  });

  it('descarta payload sem id (missing) sem lançar', async () => {
    renderHook(() => useWarRoomAlerts(), { wrapper: createWrapper() });
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    expect(() =>
      capturedHandler!({
        new: {
          alert_type: 'warning', title: 't', message: 'm',
          source: null, is_read: false, created_at: null,
        },
      }),
    ).not.toThrow();
    expect(showNotificationMock).not.toHaveBeenCalled();
  });
});
