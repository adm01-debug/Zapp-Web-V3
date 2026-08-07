import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      track: vi.fn(),
      untrack: vi.fn(),
      unsubscribe: vi.fn(),
    }),
    removeChannel: vi.fn(),
  },
}));
vi.mock('@/lib/logger');

import { useTypingPresence } from '@/hooks/useTypingPresence';

describe('useTypingPresence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with empty typing users', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
      currentUserId: 'user-1',
      currentUserName: 'Agent',
    }));
    expect(result.current.typingUsers).toEqual([]);
  });

  it('exposes handleTypingStop function', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(typeof result.current.handleTypingStop).toBe('function');
  });

  it('exposes handleTypingStart function', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(typeof result.current.handleTypingStart).toBe('function');
  });

  it('isContactTyping defaults to false', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(result.current.isContactTyping).toBe(false);
  });

  it('handles missing currentUserId with defaults', () => {
    const { result } = renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
    }));
    expect(result.current).toBeDefined();
  });

  it('registra callback de status no subscribe (GAP-02.3 — TIMED_OUT/CLOSED não silenciosos)', () => {
    const subscribeMock = vi.fn().mockReturnThis();
    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: subscribeMock,
      track: vi.fn(),
      untrack: vi.fn(),
      unsubscribe: vi.fn(),
    } as never);

    renderHook(() => useTypingPresence({
      conversationId: 'conv-1',
      currentUserId: 'user-1',
      currentUserName: 'Agent',
    }));

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(expect.any(Function));

    // O callback não deve crashar com status de erro (TIMED_OUT/CLOSED).
    const statusCallback = subscribeMock.mock.calls[0][0] as (status: string) => void;
    expect(() => statusCallback('TIMED_OUT')).not.toThrow();
    expect(() => statusCallback('CLOSED')).not.toThrow();
    expect(() => statusCallback('SUBSCRIBED')).not.toThrow();
  });
});