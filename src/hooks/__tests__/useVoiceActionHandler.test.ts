/**
 * Tests for useVoiceActionHandler().
 *
 * The hook takes an `onViewChange` callback and returns a memoised handler
 * that dispatches navigation/UI side-effects based on a VoiceAgentAction.
 * `toast` from sonner is mocked so we can assert calls without a real DOM.
 *
 * Covered:
 *   - 'navigate' with data.route calls onViewChange(route) and toast.success
 *   - 'navigate' without data.route does NOT call onViewChange or toast
 *   - 'search' with data.query calls onViewChange('contacts') and toast.info
 *   - 'search' without data.query does NOT call onViewChange
 *   - 'filter' with data.filters calls onViewChange('inbox') and toast.info
 *   - 'filter' without data.filters does NOT call onViewChange
 *   - 'sort' with data.sortBy calls toast.info (does NOT change view)
 *   - 'sort' without data.sortBy does NOT call toast
 *   - 'clear' calls toast.info (does NOT change view)
 *   - 'answer' is a no-op (neither onViewChange nor toast called)
 *   - handler identity is stable across re-renders with same callback ref
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useVoiceActionHandler } from '../useVoiceActionHandler';
import type { VoiceAgentAction } from '@/features/inbox/hooks/voice/types';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

function makeAction(
  action: VoiceAgentAction['action'],
  data?: VoiceAgentAction['data']
): VoiceAgentAction {
  return { action, response: '', data };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── navigate ───────────────────────────────────────────────────────────────────
describe('useVoiceActionHandler — navigate', () => {
  it('calls onViewChange with route when data.route is provided', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('navigate', { route: 'contacts' }));
    expect(onViewChange).toHaveBeenCalledWith('contacts');
  });

  it('calls toast.success when navigating', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('navigate', { route: 'dashboard' }));
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onViewChange when data.route is absent', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('navigate'));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('does NOT call any toast when data.route is absent', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('navigate'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});

// ── search ─────────────────────────────────────────────────────────────────────
describe('useVoiceActionHandler — search', () => {
  it('calls onViewChange("contacts") when data.query is provided', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('search', { query: 'João' }));
    expect(onViewChange).toHaveBeenCalledWith('contacts');
  });

  it('calls toast.info when searching', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('search', { query: 'Maria' }));
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onViewChange when data.query is absent', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('search'));
    expect(onViewChange).not.toHaveBeenCalled();
  });
});

// ── filter ─────────────────────────────────────────────────────────────────────
describe('useVoiceActionHandler — filter', () => {
  it('calls onViewChange("inbox") when data.filters is provided', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('filter', { filters: { status: 'open' } }));
    expect(onViewChange).toHaveBeenCalledWith('inbox');
  });

  it('calls toast.info when filtering', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('filter', { filters: { unread: true } }));
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onViewChange when data.filters is absent', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('filter'));
    expect(onViewChange).not.toHaveBeenCalled();
  });
});

// ── sort ───────────────────────────────────────────────────────────────────────
describe('useVoiceActionHandler — sort', () => {
  it('calls toast.info when data.sortBy is provided', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('sort', { sortBy: 'date' }));
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onViewChange for sort action', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('sort', { sortBy: 'name' }));
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('does NOT call toast when data.sortBy is absent', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('sort'));
    expect(toast.info).not.toHaveBeenCalled();
  });
});

// ── clear ──────────────────────────────────────────────────────────────────────
describe('useVoiceActionHandler — clear', () => {
  it('calls toast.info', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('clear'));
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onViewChange', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('clear'));
    expect(onViewChange).not.toHaveBeenCalled();
  });
});

// ── answer ─────────────────────────────────────────────────────────────────────
describe('useVoiceActionHandler — answer', () => {
  it('is a complete no-op (no onViewChange, no toast)', () => {
    const onViewChange = vi.fn();
    const { result } = renderHook(() => useVoiceActionHandler(onViewChange));
    result.current(makeAction('answer'));
    expect(onViewChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});

// ── handler stability ──────────────────────────────────────────────────────────
describe('useVoiceActionHandler — handler stability', () => {
  it('returns the same function reference across re-renders with the same callback', () => {
    const onViewChange = vi.fn();
    const { result, rerender } = renderHook(() => useVoiceActionHandler(onViewChange));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
