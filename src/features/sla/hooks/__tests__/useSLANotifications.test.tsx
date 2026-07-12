import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * Testes de regressão para o gate de contrato em `useSLANotifications`.
 *
 * Cobrem:
 *  - INSERT/UPDATE com payload válido → dispara notificação
 *  - Payload com campos faltantes → rejeitado, sem chamar toast
 *  - Payload com `contact_id` null → não dispara (evita null-deref)
 */

const capturedHandlers: Array<{ event: string; cb: (p: unknown) => unknown }> = [];
const mockChannel = {
  on: vi.fn((_type: string, cfg: { event: string }, cb: (p: unknown) => unknown) => {
    capturedHandlers.push({ event: cfg.event, cb });
    return mockChannel;
  }),
  subscribe: vi.fn().mockReturnThis(),
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })),
  },
}));

const toastFn = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (...a: unknown[]) => toastFn(...a) }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: false, slaBreachSound: false, browserNotifications: false, desktopAlerts: false, soundType: 'ding', soundVolume: 1 },
    isQuietHours: () => false,
  }),
}));
vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
}));

import { useSLANotifications } from '../useSLANotifications';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

function setup() {
  capturedHandlers.length = 0;
  toastFn.mockClear();
  renderHook(() => useSLANotifications());
}

describe('useSLANotifications — contract gate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('dispara toast em UPDATE válido com breach novo', async () => {
    setup();
    const updateHandler = capturedHandlers.find(h => h.event === 'UPDATE')!;
    await updateHandler.cb({
      new: {
        id: UUID_A, contact_id: UUID_B,
        first_message_at: '2026-01-01T00:00:00Z',
        first_response_at: null, resolved_at: null,
        first_response_breached: true, resolution_breached: false,
      },
      old: { first_response_breached: false },
    });
    expect(toastFn).toHaveBeenCalledTimes(1);
  });

  it('ignora payload com id ausente (missing field)', async () => {
    setup();
    const insertHandler = capturedHandlers.find(h => h.event === 'INSERT')!;
    await insertHandler.cb({ new: { contact_id: UUID_B, first_response_breached: true } });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('ignora payload com contact_id null (evita null-deref)', async () => {
    setup();
    const insertHandler = capturedHandlers.find(h => h.event === 'INSERT')!;
    await insertHandler.cb({
      new: {
        id: UUID_A, contact_id: null,
        first_message_at: '2026-01-01T00:00:00Z',
        first_response_at: null, resolved_at: null,
        first_response_breached: true, resolution_breached: false,
      },
    });
    expect(toastFn).not.toHaveBeenCalled();
  });

  it('ignora payload sem breach (regressão: não dispara para atualizações neutras)', async () => {
    setup();
    const updateHandler = capturedHandlers.find(h => h.event === 'UPDATE')!;
    await updateHandler.cb({
      new: {
        id: UUID_A, contact_id: UUID_B,
        first_message_at: '2026-01-01T00:00:00Z',
        first_response_at: null, resolved_at: null,
        first_response_breached: false, resolution_breached: false,
      },
      old: {},
    });
    expect(toastFn).not.toHaveBeenCalled();
  });
});
