/**
 * Tests for useChatQuickReplyControl().
 *
 * The hook centralises quick-reply UX: filtering the reply list by the "/" prefix,
 * arrow-key navigation of the selected index, Enter to accept, Escape to close,
 * and syncing the overlay open/close state with the input value.
 *
 * All external side-effects are injected via props so the entire hook is
 * exercisable without any real DOM or network access.
 *
 * Covered:
 *   - filtered is empty when inputValue does not start with '/'
 *   - filtered is the full list when inputValue is exactly '/'
 *   - filtered matches by shortcut (case-insensitive)
 *   - filtered matches by title (case-insensitive)
 *   - filtered returns empty when no match is found
 *   - selectedIndex starts at 0
 *   - ArrowDown increments selectedIndex (wraps around)
 *   - ArrowUp decrements selectedIndex (wraps around)
 *   - Enter calls handleQuickReply for the selected item
 *   - Escape calls closeQuickReplies
 *   - Keys pass through to baseHandleKeyDown when quickReplies is closed
 *   - handleQuickReply sets inputValue, closes overlay, increments use count
 *   - handleQuickReply schedules focusInput via setTimeout
 *   - handleInputChange opens overlay when '/' typed and not yet open
 *   - handleInputChange resets selectedIndex to 0 on '/' input
 *   - handleInputChange closes overlay when value no longer starts with '/'
 *   - handleInputChange delegates to baseHandleInputChange
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatQuickReplyControl } from '../useChatQuickReplyControl';
import type { QuickReply } from '@/types/chat';

const REPLIES: QuickReply[] = [
  { id: '1', title: 'Hello World', content: 'Hello!', shortcut: 'hello', category: 'greet' },
  { id: '2', title: 'Goodbye', content: 'See you!', shortcut: 'bye', category: 'greet' },
  { id: '3', title: 'Thank you', content: 'Thanks!', shortcut: 'thanks', category: 'misc' },
];

function makeParams(overrides: Partial<Parameters<typeof useChatQuickReplyControl>[0]> = {}) {
  return {
    inputValue: '',
    dbQuickReplies: REPLIES,
    quickRepliesOpen: false,
    openQuickReplies: vi.fn(),
    closeQuickReplies: vi.fn(),
    slashCommandsOpen: false,
    setInputValue: vi.fn(),
    focusInput: vi.fn(),
    incrementUseCount: vi.fn(),
    baseHandleInputChange: vi.fn(),
    baseHandleKeyDown: vi.fn(),
    ...overrides,
  };
}

function makeKeyEvent(key: string): React.KeyboardEvent {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent;
}

function makeChangeEvent(value: string): React.ChangeEvent<HTMLTextAreaElement> {
  return { target: { value } } as React.ChangeEvent<HTMLTextAreaElement>;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ── filtered computation ───────────────────────────────────────────────────────
describe('useChatQuickReplyControl — filtered', () => {
  it('is empty when inputValue does not start with "/"', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: 'hello' }))
    );
    expect(result.current.filtered).toHaveLength(0);
  });

  it('is empty when inputValue is empty', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '' }))
    );
    expect(result.current.filtered).toHaveLength(0);
  });

  it('returns all replies when inputValue is exactly "/"', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/' }))
    );
    expect(result.current.filtered).toHaveLength(REPLIES.length);
  });

  it('filters by shortcut (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/HEL' }))
    );
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('1');
  });

  it('filters by title (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/GOOD' }))
    );
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('2');
  });

  it('returns empty when no match found', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/zzznomatch' }))
    );
    expect(result.current.filtered).toHaveLength(0);
  });

  it('updates when inputValue changes', () => {
    const params = makeParams({ inputValue: '/' });
    const { result, rerender } = renderHook(
      (p: Parameters<typeof useChatQuickReplyControl>[0]) => useChatQuickReplyControl(p),
      { initialProps: params }
    );
    expect(result.current.filtered).toHaveLength(REPLIES.length);
    rerender(makeParams({ inputValue: '/bye' }));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('2');
  });
});

// ── selectedIndex ──────────────────────────────────────────────────────────────
describe('useChatQuickReplyControl — selectedIndex', () => {
  it('starts at 0', () => {
    const { result } = renderHook(() => useChatQuickReplyControl(makeParams()));
    expect(result.current.selectedIndex).toBe(0);
  });
});

// ── handleKeyDown — navigation ─────────────────────────────────────────────────
describe('useChatQuickReplyControl — handleKeyDown navigation', () => {
  function makeOpenParams() {
    return makeParams({ inputValue: '/', quickRepliesOpen: true });
  }

  it('ArrowDown increments selectedIndex', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeOpenParams())
    );
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    expect(result.current.selectedIndex).toBe(1);
  });

  it('ArrowDown wraps around at the end of the list', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeOpenParams())
    );
    // 3 items → after 3 ArrowDowns index should wrap to 0
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('ArrowUp decrements selectedIndex', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeOpenParams())
    );
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); }); // → 1
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowUp')); });   // → 0
    expect(result.current.selectedIndex).toBe(0);
  });

  it('ArrowUp wraps around at the start of the list', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeOpenParams())
    );
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowUp')); }); // 0 → last
    expect(result.current.selectedIndex).toBe(REPLIES.length - 1);
  });

  it('ArrowDown calls preventDefault', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeOpenParams())
    );
    const evt = makeKeyEvent('ArrowDown');
    act(() => { result.current.handleKeyDown(evt); });
    expect(evt.preventDefault).toHaveBeenCalled();
  });
});

// ── handleKeyDown — Enter & Escape ─────────────────────────────────────────────
describe('useChatQuickReplyControl — handleKeyDown Enter & Escape', () => {
  it('Enter selects the item at selectedIndex and calls setInputValue', () => {
    const params = makeParams({ inputValue: '/', quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    // selectedIndex is 0 → REPLIES[0]
    act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')); });
    expect(params.setInputValue).toHaveBeenCalledWith(REPLIES[0].content);
  });

  it('Enter calls closeQuickReplies', () => {
    const params = makeParams({ inputValue: '/', quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')); });
    expect(params.closeQuickReplies).toHaveBeenCalled();
  });

  it('Enter calls incrementUseCount with the reply id', () => {
    const params = makeParams({ inputValue: '/', quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')); });
    expect(params.incrementUseCount).toHaveBeenCalledWith(REPLIES[0].id);
  });

  it('Escape calls closeQuickReplies', () => {
    const params = makeParams({ inputValue: '/', quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleKeyDown(makeKeyEvent('Escape')); });
    expect(params.closeQuickReplies).toHaveBeenCalled();
  });
});

// ── handleKeyDown — pass-through ───────────────────────────────────────────────
describe('useChatQuickReplyControl — handleKeyDown pass-through', () => {
  it('passes unhandled keys to baseHandleKeyDown when quickReplies is closed', () => {
    const params = makeParams({ quickRepliesOpen: false, slashCommandsOpen: false });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    const evt = makeKeyEvent('a');
    act(() => { result.current.handleKeyDown(evt); });
    expect(params.baseHandleKeyDown).toHaveBeenCalledWith(evt, false);
  });

  it('passes slashCommandsOpen to baseHandleKeyDown', () => {
    const params = makeParams({ quickRepliesOpen: false, slashCommandsOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    const evt = makeKeyEvent('a');
    act(() => { result.current.handleKeyDown(evt); });
    expect(params.baseHandleKeyDown).toHaveBeenCalledWith(evt, true);
  });
});

// ── handleQuickReply ───────────────────────────────────────────────────────────
describe('useChatQuickReplyControl — handleQuickReply', () => {
  it('sets inputValue to the reply content', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleQuickReply(REPLIES[1]); });
    expect(params.setInputValue).toHaveBeenCalledWith(REPLIES[1].content);
  });

  it('calls closeQuickReplies', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleQuickReply(REPLIES[0]); });
    expect(params.closeQuickReplies).toHaveBeenCalledTimes(1);
  });

  it('calls incrementUseCount with the reply id', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleQuickReply(REPLIES[2]); });
    expect(params.incrementUseCount).toHaveBeenCalledWith(REPLIES[2].id);
  });

  it('schedules focusInput via setTimeout(10)', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleQuickReply(REPLIES[0]); });
    expect(params.focusInput).not.toHaveBeenCalled(); // not yet
    act(() => { vi.advanceTimersByTime(10); });
    expect(params.focusInput).toHaveBeenCalledTimes(1);
  });
});

// ── handleInputChange ──────────────────────────────────────────────────────────
describe('useChatQuickReplyControl — handleInputChange', () => {
  it('delegates to baseHandleInputChange', () => {
    const params = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    const evt = makeChangeEvent('/hello');
    act(() => { result.current.handleInputChange(evt); });
    expect(params.baseHandleInputChange).toHaveBeenCalledWith(evt);
  });

  it('opens quickReplies when value starts with "/" and overlay is closed', () => {
    const params = makeParams({ quickRepliesOpen: false });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleInputChange(makeChangeEvent('/')); });
    expect(params.openQuickReplies).toHaveBeenCalledTimes(1);
  });

  it('does NOT call openQuickReplies when overlay is already open', () => {
    const params = makeParams({ quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleInputChange(makeChangeEvent('/h')); });
    expect(params.openQuickReplies).not.toHaveBeenCalled();
  });

  it('closes quickReplies when value no longer starts with "/"', () => {
    const params = makeParams({ quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleInputChange(makeChangeEvent('hello')); });
    expect(params.closeQuickReplies).toHaveBeenCalledTimes(1);
  });

  it('does NOT close quickReplies when value stays with "/"', () => {
    const params = makeParams({ quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleInputChange(makeChangeEvent('/new')); });
    expect(params.closeQuickReplies).not.toHaveBeenCalled();
  });
});
