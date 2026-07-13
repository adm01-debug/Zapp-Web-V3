/**
 * Tests for useChatFilters().
 *
 * The hook derives UI state from URL search params and a messages array:
 * - failuresOnly / failureCategory parsed from ?failuresOnly=1 / ?failureCategory=<category>
 * - failedMessages: messages with status in ('failed', 'failed_auth', 'failed_retries')
 * - categoryCounts: per-category breakdown of failedMessages
 * - categoryFilteredMessages: failedMessages narrowed by failureCategory (all if null)
 * - visibleMessages: categoryFilteredMessages if failuresOnly, else all messages
 * - setFailuresOnly: updates URL; setting false also clears failureCategory
 * - setFailureCategory: sets or removes the failureCategory URL param
 *
 * Because the hook calls useSearchParams(), every renderHook call is wrapped in a
 * MemoryRouter so no real browser URL or history is required.
 *
 * Covered:
 *   - failuresOnly is false when param is absent
 *   - failuresOnly is true when ?failuresOnly=1
 *   - failuresOnly is false for ?failuresOnly=0
 *   - failureCategory is null when param is absent
 *   - failureCategory is null for an unrecognised string
 *   - failureCategory parses each of the three valid values
 *   - failedMessages excludes non-failed statuses
 *   - failedMessages includes all three failure statuses
 *   - categoryCounts counts each category independently
 *   - categoryFilteredMessages returns all failed when failureCategory is null
 *   - categoryFilteredMessages narrows to matching category when set
 *   - visibleMessages is all messages when failuresOnly is false
 *   - visibleMessages is categoryFilteredMessages when failuresOnly is true
 *   - setFailuresOnly(true) sets ?failuresOnly=1
 *   - setFailuresOnly(false) removes failuresOnly AND failureCategory
 *   - setFailuresOnly accepts a functional updater
 *   - setFailureCategory sets the URL param
 *   - setFailureCategory(null) removes the param
 *   - setFailuresOnly and setFailureCategory are stable refs across re-renders
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useChatFilters, FAILURE_CATEGORIES } from '../useChatFilters';
import type { Message } from '@/types/chat';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeWrapper(initialUrl = '/') {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initialUrl] }, children);
}

function makeMsg(id: string, status: Message['status']): Message {
  return {
    id,
    conversationId: 'c1',
    content: 'msg content',
    type: 'text',
    sender: 'agent',
    timestamp: new Date('2024-01-01'),
    status,
  };
}

const MSG_SENT = makeMsg('s1', 'sent');
const MSG_DELIVERED = makeMsg('d1', 'delivered');
const MSG_READ = makeMsg('r1', 'read');
const MSG_FAILED = makeMsg('f1', 'failed');
const MSG_FAILED_AUTH = makeMsg('fa1', 'failed_auth');
const MSG_FAILED_RETRIES = makeMsg('fr1', 'failed_retries');

const ALL_MESSAGES = [MSG_SENT, MSG_DELIVERED, MSG_READ, MSG_FAILED, MSG_FAILED_AUTH, MSG_FAILED_RETRIES];
const ONLY_GOOD = [MSG_SENT, MSG_DELIVERED, MSG_READ];
const ONLY_FAILED = [MSG_FAILED, MSG_FAILED_AUTH, MSG_FAILED_RETRIES];

// ── FAILURE_CATEGORIES export ──────────────────────────────────────────────────
describe('useChatFilters — FAILURE_CATEGORIES constant', () => {
  it('exports the three expected failure category strings', () => {
    expect(FAILURE_CATEGORIES).toContain('failed');
    expect(FAILURE_CATEGORIES).toContain('failed_auth');
    expect(FAILURE_CATEGORIES).toContain('failed_retries');
    expect(FAILURE_CATEGORIES).toHaveLength(3);
  });
});

// ── failuresOnly ───────────────────────────────────────────────────────────────
describe('useChatFilters — failuresOnly URL parsing', () => {
  it('is false when param is absent', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    expect(result.current.failuresOnly).toBe(false);
  });

  it('is true when ?failuresOnly=1', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failuresOnly=1'),
    });
    expect(result.current.failuresOnly).toBe(true);
  });

  it('is false when ?failuresOnly=0', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failuresOnly=0'),
    });
    expect(result.current.failuresOnly).toBe(false);
  });

  it('is false when ?failuresOnly=true (only "1" is accepted)', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failuresOnly=true'),
    });
    expect(result.current.failuresOnly).toBe(false);
  });
});

// ── failureCategory ────────────────────────────────────────────────────────────
describe('useChatFilters — failureCategory URL parsing', () => {
  it('is null when param is absent', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    expect(result.current.failureCategory).toBeNull();
  });

  it('is null for an unrecognised string', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failureCategory=unknown'),
    });
    expect(result.current.failureCategory).toBeNull();
  });

  it('parses "failed"', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failureCategory=failed'),
    });
    expect(result.current.failureCategory).toBe('failed');
  });

  it('parses "failed_auth"', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failureCategory=failed_auth'),
    });
    expect(result.current.failureCategory).toBe('failed_auth');
  });

  it('parses "failed_retries"', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failureCategory=failed_retries'),
    });
    expect(result.current.failureCategory).toBe('failed_retries');
  });
});

// ── failedMessages ─────────────────────────────────────────────────────────────
describe('useChatFilters — failedMessages computation', () => {
  it('is empty when messages array is empty', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    expect(result.current.failedMessages).toHaveLength(0);
  });

  it('excludes non-failed statuses', () => {
    const { result } = renderHook(() => useChatFilters(ONLY_GOOD), { wrapper: makeWrapper('/') });
    expect(result.current.failedMessages).toHaveLength(0);
  });

  it('includes all three failure statuses', () => {
    const { result } = renderHook(() => useChatFilters(ONLY_FAILED), { wrapper: makeWrapper('/') });
    expect(result.current.failedMessages).toHaveLength(3);
  });

  it('returns only failed messages from a mixed array', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), { wrapper: makeWrapper('/') });
    expect(result.current.failedMessages).toHaveLength(3);
    expect(result.current.failedMessages.map((m) => m.id)).toEqual(
      expect.arrayContaining(['f1', 'fa1', 'fr1']),
    );
  });

  it('does not include "sending" or "retrying" in failed', () => {
    const msgs = [makeMsg('x1', 'sending'), makeMsg('x2', 'retrying')];
    const { result } = renderHook(() => useChatFilters(msgs), { wrapper: makeWrapper('/') });
    expect(result.current.failedMessages).toHaveLength(0);
  });
});

// ── categoryCounts ─────────────────────────────────────────────────────────────
describe('useChatFilters — categoryCounts computation', () => {
  it('all counts are 0 for an empty array', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    expect(result.current.categoryCounts).toEqual({ failed: 0, failed_auth: 0, failed_retries: 0 });
  });

  it('counts each category independently', () => {
    const msgs = [
      makeMsg('a', 'failed'),
      makeMsg('b', 'failed'),
      makeMsg('c', 'failed_auth'),
      makeMsg('d', 'failed_retries'),
      makeMsg('e', 'failed_retries'),
      makeMsg('f', 'failed_retries'),
    ];
    const { result } = renderHook(() => useChatFilters(msgs), { wrapper: makeWrapper('/') });
    expect(result.current.categoryCounts).toEqual({ failed: 2, failed_auth: 1, failed_retries: 3 });
  });

  it('ignores non-failed messages in counts', () => {
    const { result } = renderHook(() => useChatFilters(ONLY_GOOD), { wrapper: makeWrapper('/') });
    expect(result.current.categoryCounts).toEqual({ failed: 0, failed_auth: 0, failed_retries: 0 });
  });
});

// ── categoryFilteredMessages ───────────────────────────────────────────────────
describe('useChatFilters — categoryFilteredMessages computation', () => {
  it('returns all failed messages when failureCategory is null', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper('/'),
    });
    expect(result.current.failureCategory).toBeNull();
    expect(result.current.categoryFilteredMessages).toHaveLength(3);
  });

  it('narrows to "failed" when failureCategory=failed', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper('/?failureCategory=failed'),
    });
    expect(result.current.categoryFilteredMessages).toHaveLength(1);
    expect(result.current.categoryFilteredMessages[0].id).toBe('f1');
  });

  it('narrows to "failed_auth" when failureCategory=failed_auth', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper('/?failureCategory=failed_auth'),
    });
    expect(result.current.categoryFilteredMessages).toHaveLength(1);
    expect(result.current.categoryFilteredMessages[0].id).toBe('fa1');
  });

  it('narrows to "failed_retries" when failureCategory=failed_retries', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper('/?failureCategory=failed_retries'),
    });
    expect(result.current.categoryFilteredMessages).toHaveLength(1);
    expect(result.current.categoryFilteredMessages[0].id).toBe('fr1');
  });

  it('returns empty when a valid category has no matching messages', () => {
    const msgs = [makeMsg('a', 'failed'), makeMsg('b', 'failed')];
    const { result } = renderHook(() => useChatFilters(msgs), {
      wrapper: makeWrapper('/?failureCategory=failed_auth'),
    });
    expect(result.current.categoryFilteredMessages).toHaveLength(0);
  });
});

// ── visibleMessages ────────────────────────────────────────────────────────────
describe('useChatFilters — visibleMessages computation', () => {
  it('is all messages when failuresOnly is false', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper('/'),
    });
    expect(result.current.visibleMessages).toHaveLength(ALL_MESSAGES.length);
  });

  it('is categoryFilteredMessages when failuresOnly is true (no category)', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper('/?failuresOnly=1'),
    });
    expect(result.current.visibleMessages).toHaveLength(3);
    expect(result.current.visibleMessages.map((m) => m.id)).toEqual(
      expect.arrayContaining(['f1', 'fa1', 'fr1']),
    );
  });

  it('is narrowed by both failuresOnly and failureCategory together', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper('/?failuresOnly=1&failureCategory=failed_auth'),
    });
    expect(result.current.visibleMessages).toHaveLength(1);
    expect(result.current.visibleMessages[0].id).toBe('fa1');
  });

  it('is empty when failuresOnly=1 but no failed messages exist', () => {
    const { result } = renderHook(() => useChatFilters(ONLY_GOOD), {
      wrapper: makeWrapper('/?failuresOnly=1'),
    });
    expect(result.current.visibleMessages).toHaveLength(0);
  });
});

// ── setFailuresOnly ────────────────────────────────────────────────────────────
describe('useChatFilters — setFailuresOnly', () => {
  it('setting true adds ?failuresOnly=1 to the URL', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFailuresOnly(true); });
    expect(result.current.failuresOnly).toBe(true);
  });

  it('setting false removes failuresOnly from the URL', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failuresOnly=1'),
    });
    act(() => { result.current.setFailuresOnly(false); });
    expect(result.current.failuresOnly).toBe(false);
  });

  it('setting false also removes failureCategory from the URL', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failuresOnly=1&failureCategory=failed'),
    });
    act(() => { result.current.setFailuresOnly(false); });
    expect(result.current.failuresOnly).toBe(false);
    expect(result.current.failureCategory).toBeNull();
  });

  it('accepts a functional updater (false → true)', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFailuresOnly((prev) => !prev); });
    expect(result.current.failuresOnly).toBe(true);
  });

  it('accepts a functional updater (true → false)', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failuresOnly=1'),
    });
    act(() => { result.current.setFailuresOnly((prev) => !prev); });
    expect(result.current.failuresOnly).toBe(false);
  });
});

// ── setFailureCategory ─────────────────────────────────────────────────────────
describe('useChatFilters — setFailureCategory', () => {
  it('sets ?failureCategory=failed in the URL', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFailureCategory('failed'); });
    expect(result.current.failureCategory).toBe('failed');
  });

  it('sets ?failureCategory=failed_auth in the URL', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFailureCategory('failed_auth'); });
    expect(result.current.failureCategory).toBe('failed_auth');
  });

  it('sets ?failureCategory=failed_retries in the URL', () => {
    const { result } = renderHook(() => useChatFilters([]), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFailureCategory('failed_retries'); });
    expect(result.current.failureCategory).toBe('failed_retries');
  });

  it('setting null removes the param', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failureCategory=failed'),
    });
    act(() => { result.current.setFailureCategory(null); });
    expect(result.current.failureCategory).toBeNull();
  });

  it('replacing one category with another works', () => {
    const { result } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/?failureCategory=failed'),
    });
    act(() => { result.current.setFailureCategory('failed_retries'); });
    expect(result.current.failureCategory).toBe('failed_retries');
  });
});

// ── callback stability ─────────────────────────────────────────────────────────
describe('useChatFilters — callback stability', () => {
  it('setFailuresOnly is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/'),
    });
    const first = result.current.setFailuresOnly;
    rerender();
    expect(result.current.setFailuresOnly).toBe(first);
  });

  it('setFailureCategory is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatFilters([]), {
      wrapper: makeWrapper('/'),
    });
    const first = result.current.setFailureCategory;
    rerender();
    expect(result.current.setFailureCategory).toBe(first);
  });
});
