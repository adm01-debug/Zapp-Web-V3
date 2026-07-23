import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChannel = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
  // The hook short-circuits when Supabase isn't configured; the mock must
  // expose these exports (added with the graceful-degradation work) or the
  // hook throws "No isSupabaseConfigured export is defined on the mock".
  isSupabaseConfigured: true,
  warnSupabaseUnconfigured: vi.fn(),
}));

vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: { soundEnabled: true, browserNotifications: false },
    isQuietHours: () => false,
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn(),
}));

vi.mock('@/lib/logger');

const { useRealtimeSentimentAlerts } = await import('@/hooks/useRealtimeSentimentAlerts');
const { renderHook } = await import('@testing-library/react');

describe('useRealtimeSentimentAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockReturnThis(),
    });
  });

  it('returns null', () => {
    const { result } = renderHook(() => useRealtimeSentimentAlerts());
    expect(result.current).toBeNull();
  });

  it('subscribes to sentiment-alerts-realtime channel', () => {
    renderHook(() => useRealtimeSentimentAlerts());
    expect(mockChannel).toHaveBeenCalledWith('sentiment-alerts-realtime');
  });

  it('listens for INSERT events on audit_logs', () => {
    const onMock = vi.fn().mockReturnThis();
    mockChannel.mockReturnValue({
      on: onMock,
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockReturnThis(),
    });
    renderHook(() => useRealtimeSentimentAlerts());
    expect(onMock).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        table: 'audit_logs',
        filter: 'action=eq.sentiment_alert',
      }),
      expect.any(Function)
    );
  });

  it('cleans up channel on unmount via removeChannel', () => {
    const channelInstance = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn().mockReturnThis(),
    };
    mockChannel.mockReturnValue(channelInstance);
    const { unmount } = renderHook(() => useRealtimeSentimentAlerts());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledWith(channelInstance);
  });

  it('calls subscribe on channel', () => {
    const subscribeMock = vi.fn().mockReturnThis();
    mockChannel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: subscribeMock,
      unsubscribe: vi.fn().mockReturnThis(),
    });
    renderHook(() => useRealtimeSentimentAlerts());
    expect(subscribeMock).toHaveBeenCalled();
  });
});
