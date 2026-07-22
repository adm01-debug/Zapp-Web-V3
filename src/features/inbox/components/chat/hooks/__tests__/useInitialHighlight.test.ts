
/**
 * Tests for useInitialHighlight().
 *
 * The hook drives the "View in chat" deep-link flow:
 * 1. Finds the target message by id or external_id
 * 2. Calls setHighlightedMessageIds / setActiveHighlightId immediately
 * 3. Attempts scrollToMessage (retrying up to 10× at 150 ms intervals)
 * 4. Clears the highlight after 3 500 ms via a timer
 * 5. If the message is not found after 20 attempts (×250 ms) fires a toast
 *    and calls onHighlightConsumed
 * 6. Cancels all pending timers on unmount
 *
 * All timing is controlled via vi.useFakeTimers() so no real async waiting is needed.
 * toast is mocked to avoid pulling in the full reducer.
 *
 * Covered:
 *   - no-op when initialHighlightMessageId is absent / null
 *   - finds message by id and calls setHighlightedMessageIds + setActiveHighlightId
 *   - finds message by external_id when id does not match
 *   - prefers id over external_id match
 *   - calls scrollToMessage on find
 *   - retries scrollToMessage up to 10× (at 150 ms each) until it returns true
 *   - clears highlight (setActiveHighlightId(null), empty Set) after 3 500 ms
 *   - calls onHighlightConsumed after highlight clears
 *   - fires toast after 20 find-attempts (×250 ms) when message not found
 *   - calls onHighlightConsumed after exhausted find-attempts
 *   - does NOT call setHighlightedMessageIds when message never found
 *   - cancels timers on unmount (no callbacks after unmount)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useInitialHighlight } from '../useInitialHighlight';
import type { ChatMessagesAreaRef } from '../../ChatMessagesArea';
import type { Message } from '@/types/chat';

vi.mock('@/hooks/use-toast', () => ({
  toast: vi.fn(),
}));

import { toast } from '@/hooks/use-toast';

function makeMsg(id: string, externalId?: string): Message {
  return {
    id,
    conversationId: 'c1',
    content: 'text',
    type: 'text',
    sender: 'agent',
    timestamp: new Date('2024-01-01'),
    status: 'sent',
    external_id: externalId,
  } as Message;
}

function makeAreaRef(scrollReturns = true): React.RefObject<ChatMessagesAreaRef> {
  const ref = createRef<ChatMessagesAreaRef>();
  (ref as { current: ChatMessagesAreaRef }).current = {
    scrollToMessage: vi.fn().mockReturnValue(scrollReturns),
    scrollToBottom: vi.fn(),
  } as unknown as ChatMessagesAreaRef;
  return ref;
}

function makeNullAreaRef(): React.RefObject<ChatMessagesAreaRef> {
  return { current: null } as React.RefObject<ChatMessagesAreaRef>;
}

function makeParams(overrides: Partial<Parameters<typeof useInitialHighlight>[0]> = {}) {
  return {
    initialHighlightMessageId: null,
    messages: [],
    messagesAreaRef: makeAreaRef(),
    setHighlightedMessageIds: vi.fn(),
    setActiveHighlightId: vi.fn(),
    onHighlightConsumed: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

// ── no-op conditions ──────────────────────────────────────────────────────────
describe('useInitialHighlight — no-op when no id provided', () => {
  it('does nothing when initialHighlightMessageId is null', () => {
    const p = makeParams({ initialHighlightMessageId: null });
    renderHook(() => useInitialHighlight(p));
    vi.runAllTimers();
    expect(p.setHighlightedMessageIds).not.toHaveBeenCalled();
    expect(p.setActiveHighlightId).not.toHaveBeenCalled();
  });

  it('does nothing when initialHighlightMessageId is undefined', () => {
    const p = makeParams({ initialHighlightMessageId: undefined });
    renderHook(() => useInitialHighlight(p));
    vi.runAllTimers();
    expect(p.setHighlightedMessageIds).not.toHaveBeenCalled();
  });
});

// ── find by id ────────────────────────────────────────────────────────────────
describe('useInitialHighlight — find by message id', () => {
  it('calls setHighlightedMessageIds with a Set containing the found id', () => {
    const msg = makeMsg('msg-1');
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [msg],
    });
    renderHook(() => useInitialHighlight(p));
    expect(p.setHighlightedMessageIds).toHaveBeenCalledWith(new Set(['msg-1']));
  });

  it('calls setActiveHighlightId with the found id', () => {
    const msg = makeMsg('msg-1');
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [msg],
    });
    renderHook(() => useInitialHighlight(p));
    expect(p.setActiveHighlightId).toHaveBeenCalledWith('msg-1');
  });
});

// ── find by external_id ───────────────────────────────────────────────────────
describe('useInitialHighlight — find by external_id', () => {
  it('matches by external_id when id does not match', () => {
    const msg = makeMsg('internal-99', 'ext-abc');
    const p = makeParams({
      initialHighlightMessageId: 'ext-abc',
      messages: [msg],
    });
    renderHook(() => useInitialHighlight(p));
    // resolves to the internal id
    expect(p.setHighlightedMessageIds).toHaveBeenCalledWith(new Set(['internal-99']));
    expect(p.setActiveHighlightId).toHaveBeenCalledWith('internal-99');
  });

  it('prefers direct id match over external_id', () => {
    const msgA = makeMsg('msg-x', 'target');
    const msgB = makeMsg('target', 'other');
    const p = makeParams({
      initialHighlightMessageId: 'target',
      messages: [msgA, msgB],
    });
    renderHook(() => useInitialHighlight(p));
    expect(p.setHighlightedMessageIds).toHaveBeenCalledWith(new Set(['target']));
  });
});

// ── scrollToMessage ───────────────────────────────────────────────────────────
describe('useInitialHighlight — scrollToMessage', () => {
  it('calls scrollToMessage immediately when message is found', () => {
    const areaRef = makeAreaRef(true);
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
      messagesAreaRef: areaRef,
    });
    renderHook(() => useInitialHighlight(p));
    expect(areaRef.current!.scrollToMessage).toHaveBeenCalledWith('msg-1');
  });

  it('retries scrollToMessage at 150 ms intervals when it returns false', () => {
    const scrollFn = vi.fn().mockReturnValue(false);
    const ref = createRef<ChatMessagesAreaRef>();
    (ref as { current: ChatMessagesAreaRef }).current = {
      scrollToMessage: scrollFn,
      scrollToBottom: vi.fn(),
    } as unknown as ChatMessagesAreaRef;

    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
      messagesAreaRef: ref,
    });
    renderHook(() => useInitialHighlight(p));

    // Initial call
    expect(scrollFn).toHaveBeenCalledTimes(1);
    // After 150 ms → retry 2
    vi.advanceTimersByTime(150);
    expect(scrollFn).toHaveBeenCalledTimes(2);
    // After another 150 ms → retry 3
    vi.advanceTimersByTime(150);
    expect(scrollFn).toHaveBeenCalledTimes(3);
  });

  it('stops retrying after 10 scroll attempts', () => {
    const scrollFn = vi.fn().mockReturnValue(false);
    const ref = createRef<ChatMessagesAreaRef>();
    (ref as { current: ChatMessagesAreaRef }).current = {
      scrollToMessage: scrollFn,
      scrollToBottom: vi.fn(),
    } as unknown as ChatMessagesAreaRef;

    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
      messagesAreaRef: ref,
    });
    renderHook(() => useInitialHighlight(p));
    // Advance past 10 × 150 ms
    vi.advanceTimersByTime(150 * 12);
    expect(scrollFn).toHaveBeenCalledTimes(10);
  });

  it('does not throw when messagesAreaRef.current is null', () => {
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
      messagesAreaRef: makeNullAreaRef(),
    });
    expect(() => {
      renderHook(() => useInitialHighlight(p));
      vi.advanceTimersByTime(200);
    }).not.toThrow();
  });
});

// ── highlight expiry timer ────────────────────────────────────────────────────
describe('useInitialHighlight — highlight clears after 3 500 ms', () => {
  it('calls setActiveHighlightId(null) after 3 500 ms', () => {
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
    });
    renderHook(() => useInitialHighlight(p));
    vi.advanceTimersByTime(3500);
    expect(p.setActiveHighlightId).toHaveBeenCalledWith(null);
  });

  it('clears setHighlightedMessageIds to empty Set after 3 500 ms', () => {
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
    });
    renderHook(() => useInitialHighlight(p));
    vi.advanceTimersByTime(3500);
    const calls = p.setHighlightedMessageIds.mock.calls;
    const lastArg = calls[calls.length - 1][0];
    expect(lastArg).toBeInstanceOf(Set);
    expect(lastArg.size).toBe(0);
  });

  it('calls onHighlightConsumed after the 3 500 ms timer fires', () => {
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
    });
    renderHook(() => useInitialHighlight(p));
    expect(p.onHighlightConsumed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3500);
    expect(p.onHighlightConsumed).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onHighlightConsumed before 3 500 ms', () => {
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
    });
    renderHook(() => useInitialHighlight(p));
    vi.advanceTimersByTime(3000);
    expect(p.onHighlightConsumed).not.toHaveBeenCalled();
  });
});

// ── message not found — exhausted attempts ────────────────────────────────────
describe('useInitialHighlight — message not found after 20 attempts', () => {
  it('fires toast when message is never found', () => {
    const p = makeParams({
      initialHighlightMessageId: 'ghost-id',
      messages: [],
    });
    renderHook(() => useInitialHighlight(p));
    // 20 retries × 250 ms
    vi.advanceTimersByTime(250 * 21);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('toast has variant: "destructive"', () => {
    const p = makeParams({
      initialHighlightMessageId: 'ghost-id',
      messages: [],
    });
    renderHook(() => useInitialHighlight(p));
    vi.advanceTimersByTime(250 * 21);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' })
    );
  });

  it('calls onHighlightConsumed after exhausted attempts', () => {
    const p = makeParams({
      initialHighlightMessageId: 'ghost-id',
      messages: [],
    });
    renderHook(() => useInitialHighlight(p));
    vi.advanceTimersByTime(250 * 21);
    expect(p.onHighlightConsumed).toHaveBeenCalledTimes(1);
  });

  it('does NOT call setHighlightedMessageIds when message is never found', () => {
    const p = makeParams({
      initialHighlightMessageId: 'ghost-id',
      messages: [],
    });
    renderHook(() => useInitialHighlight(p));
    vi.advanceTimersByTime(250 * 21);
    expect(p.setHighlightedMessageIds).not.toHaveBeenCalled();
  });
});

// ── cleanup on unmount ────────────────────────────────────────────────────────
describe('useInitialHighlight — cleanup on unmount', () => {
  it('does not call setActiveHighlightId(null) after unmount', () => {
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
    });
    const { unmount } = renderHook(() => useInitialHighlight(p));
    unmount();
    vi.advanceTimersByTime(3500);
    // May have been called once synchronously with the id, but NOT the null clear
    const nullCalls = p.setActiveHighlightId.mock.calls.filter(([v]) => v === null);
    expect(nullCalls).toHaveLength(0);
  });

  it('does not call onHighlightConsumed after unmount', () => {
    const p = makeParams({
      initialHighlightMessageId: 'msg-1',
      messages: [makeMsg('msg-1')],
    });
    const { unmount } = renderHook(() => useInitialHighlight(p));
    unmount();
    vi.advanceTimersByTime(3500);
    expect(p.onHighlightConsumed).not.toHaveBeenCalled();
  });

  it('does not fire toast after unmount when message was not found', () => {
    const p = makeParams({
      initialHighlightMessageId: 'ghost-id',
      messages: [],
    });
    const { unmount } = renderHook(() => useInitialHighlight(p));
    unmount();
    vi.advanceTimersByTime(250 * 25);
    expect(toast).not.toHaveBeenCalled();
  });
});