import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChannel = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { name: 'Contact' }, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      browserNotifications: false,
      transcriptionNotificationEnabled: true,
    },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

vi.mock('@/lib/devRealtimeLogger', () => ({
  logMessagesSubscribe: vi.fn(),
  wrapMessagesHandler: vi.fn((_, fn) => fn),
}));

vi.mock('@/integrations/datasource/db', () => ({
  dbTable: vi.fn((t: string) => t),
}));

// Must import AFTER mocks
const { useTranscriptionNotifications } = await import('@/hooks/useTranscriptionNotifications');
const { renderHook } = await import('@testing-library/react');

describe('useTranscriptionNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockReturnThis(),
    });
  });

  it('subscribes to transcription-notifications channel', () => {
    renderHook(() => useTranscriptionNotifications());
    expect(mockChannel).toHaveBeenCalledWith('transcription-notifications');
  });

  it('does not subscribe when disabled', () => {
    renderHook(() => useTranscriptionNotifications({ enabled: false }));
    expect(mockChannel).not.toHaveBeenCalled();
  });

  it('cleans up channel on unmount', () => {
    const unsubscribeMock = vi.fn();
    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: unsubscribeMock,
    });
    const { unmount } = renderHook(() => useTranscriptionNotifications());
    unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it('listens for UPDATE events on evo.evolution_messages (espelho)', () => {
    const onMock = vi.fn().mockReturnThis();
    mockChannel.mockReturnValue({
      on: onMock,
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockReturnThis(),
    });
    renderHook(() => useTranscriptionNotifications());
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ event: 'UPDATE', schema: 'evo', table: 'evolution_messages' }),
      expect.any(Function)
    );
  });

  it('accepts custom options', () => {
    renderHook(() =>
      useTranscriptionNotifications({
        showToast: false,
        playSound: false,
        showBrowserNotification: false,
      })
    );
    expect(mockChannel).toHaveBeenCalled();
  });
});
