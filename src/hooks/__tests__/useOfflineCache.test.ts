import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock logger
vi.mock('@/lib/logger');

// Mock useRealtimeMessages type
vi.mock('@/hooks/useRealtimeMessages', () => ({}));

import { useOfflineCache } from '@/hooks/useOfflineCache';

function makeConversation(id: string, msgCount = 1) {
  return {
    contact: {
      id,
      name: `Contact ${id}`,
      phone: `+55${id}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    messages: Array.from({ length: msgCount }, (_, i) => ({
      id: `msg-${id}-${i}`,
      content: `Message ${i}`,
      sender: 'contact',
      message_type: 'text',
      created_at: new Date().toISOString(),
      is_read: false,
    })),
    lastMessage: { id: `msg-${id}-0`, content: 'Last', created_at: new Date().toISOString() },
    unreadCount: 1,
  } as unknown as Parameters<typeof useOfflineCache>[0][number];
}

describe('useOfflineCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns conversations directly when online', () => {
    const convs = [makeConversation('1')];
    const { result } = renderHook(() => useOfflineCache(convs, false));

    expect(result.current.conversations).toBe(convs);
    expect(result.current.isOffline).toBe(false);
    expect(result.current.usingCache).toBe(false);
  });

  it('writes cache to localStorage when conversations are available', () => {
    const convs = [makeConversation('1'), makeConversation('2')];
    renderHook(() => useOfflineCache(convs, false));

    const stored = localStorage.getItem('offline_conversations');
    expect(stored).toBeTruthy();

    const parsed = JSON.parse(stored!);
    expect(parsed.data).toHaveLength(2);
    expect(parsed.timestamp).toBeDefined();
  });

  it('trims to 50 conversations and 20 messages', () => {
    const convs = Array.from({ length: 60 }, (_, i) => makeConversation(String(i), 30));
    renderHook(() => useOfflineCache(convs, false));

    const stored = localStorage.getItem('offline_conversations');
    const parsed = JSON.parse(stored!);
    expect(parsed.data).toHaveLength(50);
    expect(parsed.data[0].messages).toHaveLength(20);
  });

  it('does not write cache when loading', () => {
    const convs = [makeConversation('1')];
    renderHook(() => useOfflineCache(convs, true));

    expect(localStorage.getItem('offline_conversations')).toBeNull();
  });

  it('clearCache removes localStorage entry', () => {
    const convs = [makeConversation('1')];
    const { result } = renderHook(() => useOfflineCache(convs, false));

    expect(localStorage.getItem('offline_conversations')).toBeTruthy();

    act(() => {
      result.current.clearCache();
    });

    expect(localStorage.getItem('offline_conversations')).toBeNull();
  });

  it('reads expired cache as null', () => {
    const entry = {
      data: [makeConversation('1')],
      timestamp: Date.now() - 31 * 60 * 1000, // 31 min ago (TTL is 30 min)
    };
    localStorage.setItem('offline_conversations', JSON.stringify(entry));

    const { result: _result } = renderHook(() => useOfflineCache([], true));

    // Expired cache should be removed
    expect(localStorage.getItem('offline_conversations')).toBeNull();
  });

  it('prefers live data over cache even when offline and loading', () => {
    // Seed a cache in localStorage
    const cachedEntry = {
      data: [makeConversation('cached-1')],
      timestamp: Date.now(),
    };
    localStorage.setItem('offline_conversations', JSON.stringify(cachedEntry));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const liveConvs = [makeConversation('live-1'), makeConversation('live-2')];
    const { result } = renderHook(() => useOfflineCache(liveConvs, true));

    // Live data takes precedence — usingCache must be false
    expect(result.current.conversations).toBe(liveConvs);
    expect(result.current.usingCache).toBe(false);
  });

  it('falls back to cache only when offline, loading and live data is empty', () => {
    const cachedEntry = {
      data: [makeConversation('cached-1')],
      timestamp: Date.now(),
    };
    localStorage.setItem('offline_conversations', JSON.stringify(cachedEntry));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const { result } = renderHook(() => useOfflineCache([], true));

    expect(result.current.usingCache).toBe(true);
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].contact.id).toBe('cached-1');
  });

  it('tracks online/offline events', () => {
    const convs = [makeConversation('1')];
    const { result } = renderHook(() => useOfflineCache(convs, false));

    expect(result.current.isOffline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOffline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOffline).toBe(false);
  });
});
