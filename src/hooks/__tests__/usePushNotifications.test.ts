import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger');

import { usePushNotifications } from '@/hooks/usePushNotifications';

type NotificationPermissionValue = NotificationPermission;

/** Mock da Notification API (não existe em happy-dom). */
class MockNotification {
  static permission: NotificationPermissionValue = 'default';
  static requestPermission = vi.fn<() => Promise<NotificationPermissionValue>>();
  static instances: MockNotification[] = [];

  title: string;
  options?: NotificationOptions;

  constructor(title: string, options?: NotificationOptions) {
    this.title = title;
    this.options = options;
    MockNotification.instances.push(this);
  }
}

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockNotification.instances = [];
    MockNotification.permission = 'default';
    // Simula o browser: com permissão negada, requestPermission não concede.
    MockNotification.requestPermission.mockImplementation(() =>
      Promise.resolve(MockNotification.permission === 'denied' ? 'denied' : 'granted')
    );

    Object.defineProperty(window, 'Notification', {
      value: MockNotification,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    try {
      delete (window as unknown as Record<string, unknown>).Notification;
    } catch {
      /* noop */
    }
    vi.restoreAllMocks();
  });

  it('detects browser support when Notification API exists', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(true);
  });

  it('reports unsupported when Notification API is absent', () => {
    delete (window as unknown as Record<string, unknown>).Notification;
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(false);
    expect(result.current.permission).toBe('default');
  });

  it('reflects the browser permission state on mount', () => {
    MockNotification.permission = 'granted';
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.permission).toBe('granted');
  });

  it('requestPermission calls the Notification API and stores the result', async () => {
    MockNotification.permission = 'default';
    MockNotification.requestPermission.mockResolvedValue('granted');
    const { result } = renderHook(() => usePushNotifications());

    let returned: NotificationPermissionValue | undefined;
    await act(async () => {
      returned = await result.current.requestPermission();
    });

    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(returned).toBe('granted');
    expect(result.current.permission).toBe('granted');
  });

  it('requestPermission is a no-op when unsupported', async () => {
    delete (window as unknown as Record<string, unknown>).Notification;
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.requestPermission();
    });

    expect(MockNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('showNotification displays a browser notification when permission is granted', async () => {
    MockNotification.permission = 'granted';
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.showNotification({
        title: 'Nova mensagem',
        body: 'Olá!',
        tag: 'chat-1',
        icon: '/icon.png',
      });
    });

    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0].title).toBe('Nova mensagem');
    expect(MockNotification.instances[0].options).toMatchObject({
      body: 'Olá!',
      tag: 'chat-1',
      icon: '/icon.png',
    });
  });

  it('showNotification requests permission first when permission is default', async () => {
    MockNotification.permission = 'default';
    MockNotification.requestPermission.mockResolvedValue('granted');
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.showNotification({ title: 'Aviso' });
    });

    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0].title).toBe('Aviso');
  });

  it('showNotification does not display anything when permission is denied', async () => {
    MockNotification.permission = 'denied';
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.showNotification({ title: 'Não deve aparecer' });
    });

    expect(MockNotification.instances).toHaveLength(0);
  });

  it('toggleSubscription subscribes when permission is granted', async () => {
    MockNotification.permission = 'granted';
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSubscribed).toBe(false);

    await act(async () => {
      await result.current.toggleSubscription();
    });

    expect(result.current.isSubscribed).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('toggleSubscription does not subscribe when permission is denied', async () => {
    MockNotification.permission = 'denied';
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.toggleSubscription();
    });

    expect(result.current.isSubscribed).toBe(false);
  });

  it('toggleSubscription unsubscribes when already subscribed', async () => {
    MockNotification.permission = 'granted';
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.toggleSubscription();
    });
    expect(result.current.isSubscribed).toBe(true);

    await act(async () => {
      await result.current.toggleSubscription();
    });
    expect(result.current.isSubscribed).toBe(false);
  });

  it('subscribe() only toggles when not subscribed', async () => {
    MockNotification.permission = 'granted';
    const { result } = renderHook(() => usePushNotifications());

    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.isSubscribed).toBe(true);

    // Já inscrito: subscribe() não deve desinscrever nem chamar toggle de novo.
    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.isSubscribed).toBe(true);
  });

  it('unsubscribe() only toggles when subscribed', async () => {
    MockNotification.permission = 'granted';
    const { result } = renderHook(() => usePushNotifications());

    // Não inscrito: unsubscribe() não deve fazer nada.
    await act(async () => {
      await result.current.unsubscribe();
    });
    expect(result.current.isSubscribed).toBe(false);

    await act(async () => {
      await result.current.subscribe();
    });
    expect(result.current.isSubscribed).toBe(true);

    await act(async () => {
      await result.current.unsubscribe();
    });
    expect(result.current.isSubscribed).toBe(false);
  });
});
