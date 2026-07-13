/**
 * Tests for the exported `reducer` from use-toast.ts.
 *
 * Only the state-transition logic is tested here; the setTimeout side-effect
 * inside DISMISS_TOAST (addToRemoveQueue) is ignored — it does not affect
 * the returned state and is tested by integration/E2E layers.
 *
 * TOAST_LIMIT = 1, so ADD_TOAST silently drops the second toast.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Suppress the setTimeout side-effect in DISMISS_TOAST so it doesn't
// leak into other tests.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

import { reducer } from '../use-toast';

// ── helpers ───────────────────────────────────────────────────────────────────
function makeToast(id: string, extra: Record<string, unknown> = {}) {
  return { id, title: `Toast ${id}`, open: true, ...extra };
}

const emptyState = { toasts: [] };

// ── ADD_TOAST ─────────────────────────────────────────────────────────────────
describe('reducer — ADD_TOAST', () => {
  it('adds a toast to an empty state', () => {
    const toast = makeToast('1');
    const state = reducer(emptyState, { type: 'ADD_TOAST', toast });
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0]).toEqual(toast);
  });

  it('prepends new toast (most-recent first)', () => {
    const first = makeToast('1');
    const s1 = reducer(emptyState, { type: 'ADD_TOAST', toast: first });
    // TOAST_LIMIT = 1 — a second ADD replaces the first
    const second = makeToast('2');
    const s2 = reducer(s1, { type: 'ADD_TOAST', toast: second });
    expect(s2.toasts[0].id).toBe('2');
  });

  it('respects TOAST_LIMIT = 1 (drops overflow)', () => {
    const s1 = reducer(emptyState, { type: 'ADD_TOAST', toast: makeToast('a') });
    const s2 = reducer(s1, { type: 'ADD_TOAST', toast: makeToast('b') });
    expect(s2.toasts).toHaveLength(1);
  });

  it('does not mutate the incoming state', () => {
    const state = { toasts: [makeToast('x')] };
    const before = [...state.toasts];
    reducer(state, { type: 'ADD_TOAST', toast: makeToast('y') });
    expect(state.toasts).toEqual(before);
  });
});

// ── UPDATE_TOAST ──────────────────────────────────────────────────────────────
describe('reducer — UPDATE_TOAST', () => {
  it('updates the matching toast by id', () => {
    const state = { toasts: [makeToast('1', { title: 'Old' })] };
    const next = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'New' },
    });
    expect(next.toasts[0].title).toBe('New');
  });

  it('does not touch toasts with a different id', () => {
    const state = {
      toasts: [makeToast('1', { title: 'A' }), makeToast('2', { title: 'B' })],
    };
    const next = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'A-updated' },
    });
    expect(next.toasts.find((t) => t.id === '2')?.title).toBe('B');
  });

  it('merges partial updates without losing existing fields', () => {
    const state = {
      toasts: [makeToast('1', { title: 'Keep', description: 'also keep' })],
    };
    const next = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: '1', title: 'Changed' },
    });
    expect(next.toasts[0].description).toBe('also keep');
    expect(next.toasts[0].title).toBe('Changed');
  });

  it('is a no-op when no toast matches the given id', () => {
    const state = { toasts: [makeToast('1')] };
    const next = reducer(state, {
      type: 'UPDATE_TOAST',
      toast: { id: 'nonexistent', title: 'X' },
    });
    expect(next.toasts).toHaveLength(1);
    expect(next.toasts[0].id).toBe('1');
  });
});

// ── DISMISS_TOAST ─────────────────────────────────────────────────────────────
describe('reducer — DISMISS_TOAST', () => {
  it('sets open:false on the matching toast when toastId provided', () => {
    const state = { toasts: [makeToast('1'), makeToast('2')] };
    const next = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(next.toasts.find((t) => t.id === '1')?.open).toBe(false);
    // other toast is unchanged
    expect(next.toasts.find((t) => t.id === '2')?.open).toBe(true);
  });

  it('sets open:false on ALL toasts when toastId is undefined', () => {
    const state = { toasts: [makeToast('1'), makeToast('2')] };
    const next = reducer(state, { type: 'DISMISS_TOAST', toastId: undefined });
    expect(next.toasts.every((t) => t.open === false)).toBe(true);
  });

  it('does not remove toasts — only closes them', () => {
    const state = { toasts: [makeToast('1')] };
    const next = reducer(state, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(next.toasts).toHaveLength(1);
  });

  it('is a no-op on an empty state', () => {
    const next = reducer(emptyState, { type: 'DISMISS_TOAST', toastId: '1' });
    expect(next.toasts).toHaveLength(0);
  });
});

// ── REMOVE_TOAST ──────────────────────────────────────────────────────────────
describe('reducer — REMOVE_TOAST', () => {
  it('removes the toast with the matching id', () => {
    const state = { toasts: [makeToast('1'), makeToast('2')] };
    const next = reducer(state, { type: 'REMOVE_TOAST', toastId: '1' });
    expect(next.toasts.map((t) => t.id)).toEqual(['2']);
  });

  it('clears all toasts when toastId is undefined', () => {
    const state = { toasts: [makeToast('1'), makeToast('2')] };
    const next = reducer(state, { type: 'REMOVE_TOAST', toastId: undefined });
    expect(next.toasts).toHaveLength(0);
  });

  it('is a no-op when the id does not match any toast', () => {
    const state = { toasts: [makeToast('1')] };
    const next = reducer(state, { type: 'REMOVE_TOAST', toastId: 'ghost' });
    expect(next.toasts).toHaveLength(1);
  });

  it('returns empty array for REMOVE on an already-empty state', () => {
    const next = reducer(emptyState, { type: 'REMOVE_TOAST', toastId: undefined });
    expect(next.toasts).toHaveLength(0);
  });
});
