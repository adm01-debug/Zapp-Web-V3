/**
 * Tests for useChatSearchState().
 *
 * The hook manages local UI state for chat-panel message search:
 * a Set of highlighted message IDs, the currently active highlight ID,
 * and the search query string. All logic is plain React state — no network,
 * no storage, no side-effects.
 *
 * Covered:
 *   - Initial state: empty Set, null activeHighlightId, empty searchQuery
 *   - setSearchQuery updates searchQuery
 *   - setHighlightedMessageIds replaces the Set
 *   - setActiveHighlightId updates activeHighlightId
 *   - handleHighlightChange updates both highlight states atomically
 *   - resetSearch resets all three fields to their initial values
 *   - resetSearch after changes returns to the initial state
 *   - resetSearch and handleHighlightChange are stable references (useCallback)
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatSearchState } from '../useChatSearchState';

// ── initial state ──────────────────────────────────────────────────────────────
describe('useChatSearchState — initial state', () => {
  it('highlightedMessageIds is an empty Set', () => {
    const { result } = renderHook(() => useChatSearchState());
    expect(result.current.highlightedMessageIds).toBeInstanceOf(Set);
    expect(result.current.highlightedMessageIds.size).toBe(0);
  });

  it('activeHighlightId is null', () => {
    const { result } = renderHook(() => useChatSearchState());
    expect(result.current.activeHighlightId).toBeNull();
  });

  it('searchQuery is an empty string', () => {
    const { result } = renderHook(() => useChatSearchState());
    expect(result.current.searchQuery).toBe('');
  });
});

// ── setSearchQuery ─────────────────────────────────────────────────────────────
describe('useChatSearchState — setSearchQuery', () => {
  it('updates searchQuery', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setSearchQuery('hello'); });
    expect(result.current.searchQuery).toBe('hello');
  });

  it('can be set back to empty string', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setSearchQuery('something'); });
    act(() => { result.current.setSearchQuery(''); });
    expect(result.current.searchQuery).toBe('');
  });
});

// ── setHighlightedMessageIds ───────────────────────────────────────────────────
describe('useChatSearchState — setHighlightedMessageIds', () => {
  it('replaces the highlighted set', () => {
    const { result } = renderHook(() => useChatSearchState());
    const ids = new Set(['msg-1', 'msg-2']);
    act(() => { result.current.setHighlightedMessageIds(ids); });
    expect(result.current.highlightedMessageIds).toEqual(ids);
  });

  it('clearing to an empty Set works', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setHighlightedMessageIds(new Set(['a'])); });
    act(() => { result.current.setHighlightedMessageIds(new Set()); });
    expect(result.current.highlightedMessageIds.size).toBe(0);
  });
});

// ── setActiveHighlightId ───────────────────────────────────────────────────────
describe('useChatSearchState — setActiveHighlightId', () => {
  it('updates activeHighlightId', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setActiveHighlightId('msg-42'); });
    expect(result.current.activeHighlightId).toBe('msg-42');
  });

  it('can be set back to null', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setActiveHighlightId('msg-1'); });
    act(() => { result.current.setActiveHighlightId(null); });
    expect(result.current.activeHighlightId).toBeNull();
  });
});

// ── handleHighlightChange ──────────────────────────────────────────────────────
describe('useChatSearchState — handleHighlightChange', () => {
  it('updates both highlightedMessageIds and activeHighlightId', () => {
    const { result } = renderHook(() => useChatSearchState());
    const ids = new Set(['m1', 'm2', 'm3']);
    act(() => { result.current.handleHighlightChange(ids, 'm2'); });
    expect(result.current.highlightedMessageIds).toEqual(ids);
    expect(result.current.activeHighlightId).toBe('m2');
  });

  it('accepts null activeId (no active highlight)', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.handleHighlightChange(new Set(['x']), null); });
    expect(result.current.activeHighlightId).toBeNull();
  });

  it('can be called with an empty set to clear highlights', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.handleHighlightChange(new Set(['a']), 'a'); });
    act(() => { result.current.handleHighlightChange(new Set(), null); });
    expect(result.current.highlightedMessageIds.size).toBe(0);
    expect(result.current.activeHighlightId).toBeNull();
  });
});

// ── resetSearch ────────────────────────────────────────────────────────────────
describe('useChatSearchState — resetSearch', () => {
  it('clears highlightedMessageIds to an empty Set', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setHighlightedMessageIds(new Set(['a', 'b'])); });
    act(() => { result.current.resetSearch(); });
    expect(result.current.highlightedMessageIds.size).toBe(0);
  });

  it('clears activeHighlightId to null', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setActiveHighlightId('msg-5'); });
    act(() => { result.current.resetSearch(); });
    expect(result.current.activeHighlightId).toBeNull();
  });

  it('clears searchQuery to empty string', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => { result.current.setSearchQuery('find me'); });
    act(() => { result.current.resetSearch(); });
    expect(result.current.searchQuery).toBe('');
  });

  it('resets all fields simultaneously after a full search session', () => {
    const { result } = renderHook(() => useChatSearchState());
    act(() => {
      result.current.setSearchQuery('test');
      result.current.handleHighlightChange(new Set(['m1', 'm2']), 'm1');
    });
    act(() => { result.current.resetSearch(); });
    expect(result.current.searchQuery).toBe('');
    expect(result.current.highlightedMessageIds.size).toBe(0);
    expect(result.current.activeHighlightId).toBeNull();
  });
});

// ── callback stability ─────────────────────────────────────────────────────────
describe('useChatSearchState — callback stability', () => {
  it('resetSearch is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatSearchState());
    const first = result.current.resetSearch;
    rerender();
    expect(result.current.resetSearch).toBe(first);
  });

  it('handleHighlightChange is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatSearchState());
    const first = result.current.handleHighlightChange;
    rerender();
    expect(result.current.handleHighlightChange).toBe(first);
  });
});
