/**
 * Tests for useChatFilters — referential identity (memoization).
 *
 * Guard against regressions where derived arrays lose referential stability,
 * causing unnecessary re-renders in virtualised message lists. Each useMemo
 * derivation must return the same array reference when its inputs haven't changed.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { useChatFilters } from '../hooks/useChatFilters';
import type { Message } from '@/types/chat';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    content: 'hello',
    status: 'sent',
    timestamp: new Date().toISOString(),
    type: 'text',
    fromMe: true,
    conversationId: 'conv-1',
    ...overrides,
  } as Message;
}

function makeWrapper() {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(MemoryRouter, null, children);
  return Wrapper;
}

const SENT = makeMessage({ id: 'ok-1', status: 'sent' });
const FAILED = makeMessage({ id: 'fail-1', status: 'failed' });
const FAILED_AUTH = makeMessage({ id: 'fail-2', status: 'failed_auth' });
const FAILED_RETRIES = makeMessage({ id: 'fail-3', status: 'failed_retries' });

const ALL_MESSAGES = [SENT, FAILED, FAILED_AUTH, FAILED_RETRIES];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useChatFilters — referential identity', () => {
  it('failedMessages reference is stable across renders with same input', () => {
    const { result, rerender } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    const ref1 = result.current.failedMessages;
    rerender();
    const ref2 = result.current.failedMessages;

    expect(ref1).toBe(ref2);
  });

  it('visibleMessages reference is stable across renders with same input', () => {
    const { result, rerender } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    const ref1 = result.current.visibleMessages;
    rerender();
    const ref2 = result.current.visibleMessages;

    expect(ref1).toBe(ref2);
  });

  it('categoryCounts reference is stable across renders with same input', () => {
    const { result, rerender } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    const ref1 = result.current.categoryCounts;
    rerender();
    const ref2 = result.current.categoryCounts;

    expect(ref1).toBe(ref2);
  });

  it('categoryFilteredMessages reference is stable across renders with same input', () => {
    const { result, rerender } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    const ref1 = result.current.categoryFilteredMessages;
    rerender();
    const ref2 = result.current.categoryFilteredMessages;

    expect(ref1).toBe(ref2);
  });
});

describe('useChatFilters — correctness', () => {
  it('failedMessages contains only failed-status messages', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    expect(result.current.failedMessages).toHaveLength(3);
    expect(result.current.failedMessages.map((m) => m.id)).toEqual(['fail-1', 'fail-2', 'fail-3']);
  });

  it('categoryCounts matches actual failure distribution', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    expect(result.current.categoryCounts).toEqual({
      failed: 1,
      failed_auth: 1,
      failed_retries: 1,
    });
  });

  it('visibleMessages equals all messages when failuresOnly is false', () => {
    const { result } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    expect(result.current.failuresOnly).toBe(false);
    expect(result.current.visibleMessages).toHaveLength(ALL_MESSAGES.length);
  });

  it('setFailuresOnly callback is stable across renders', () => {
    const { result, rerender } = renderHook(() => useChatFilters(ALL_MESSAGES), {
      wrapper: makeWrapper(),
    });

    const cb1 = result.current.setFailuresOnly;
    rerender();
    expect(result.current.setFailuresOnly).toBe(cb1);
  });

  it('failedMessages updates when new failed message added', () => {
    let messages = [SENT, FAILED];
    const { result, rerender } = renderHook(() => useChatFilters(messages), {
      wrapper: makeWrapper(),
    });

    expect(result.current.failedMessages).toHaveLength(1);

    act(() => {
      messages = [...messages, FAILED_AUTH];
    });
    rerender();

    expect(result.current.failedMessages).toHaveLength(2);
  });
});
