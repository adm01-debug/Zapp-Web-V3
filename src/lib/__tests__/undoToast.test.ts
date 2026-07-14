// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { undoToast, confirmToast } from '@/lib/undoToast';

// ── mock sonner ───────────────────────────────────────────────────────────────
// vi.mock() is hoisted, so the factory must not reference module-scope vars.
// Use vi.hoisted() to create the mock before the hoist boundary.

const { mockToast } = vi.hoisted(() => {
  const mockToast = Object.assign(vi.fn(), { success: vi.fn() });
  return { mockToast };
});

vi.mock('sonner', () => ({
  toast: mockToast,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── undoToast ─────────────────────────────────────────────────────────────────

describe('undoToast — basic call', () => {
  it('calls toast() once', () => {
    undoToast({ message: 'Item removed', onUndo: vi.fn() });
    expect(mockToast).toHaveBeenCalledTimes(1);
  });

  it('passes the message as the first argument', () => {
    undoToast({ message: 'Contato removido', onUndo: vi.fn() });
    expect(mockToast.mock.calls[0][0]).toBe('Contato removido');
  });

  it('uses default delay of 5000', () => {
    undoToast({ message: 'msg', onUndo: vi.fn() });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.duration).toBe(5000);
  });

  it('uses custom delay when provided', () => {
    undoToast({ message: 'msg', onUndo: vi.fn(), delay: 3000 });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.duration).toBe(3000);
  });

  it('uses default icon 🗑️', () => {
    undoToast({ message: 'msg', onUndo: vi.fn() });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.icon).toBe('🗑️');
  });

  it('uses custom icon when provided', () => {
    undoToast({ message: 'msg', onUndo: vi.fn(), icon: '🔥' });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.icon).toBe('🔥');
  });

  it('includes an action with label "Desfazer"', () => {
    undoToast({ message: 'msg', onUndo: vi.fn() });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const action = opts.action as Record<string, unknown>;
    expect(action.label).toBe('Desfazer');
  });
});

describe('undoToast — undo action', () => {
  it('calls onUndo when action.onClick fires', () => {
    const onUndo = vi.fn();
    undoToast({ message: 'msg', onUndo });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const action = opts.action as Record<string, { onClick: () => void }>;
    action.onClick();
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('calls toast.success after undo', () => {
    const onUndo = vi.fn();
    undoToast({ message: 'msg', onUndo });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const action = opts.action as Record<string, { onClick: () => void }>;
    action.onClick();
    expect(mockToast.success).toHaveBeenCalledTimes(1);
  });

  it('toast.success message is "Ação desfeita"', () => {
    const onUndo = vi.fn();
    undoToast({ message: 'msg', onUndo });
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const action = opts.action as Record<string, { onClick: () => void }>;
    action.onClick();
    expect(mockToast.success.mock.calls[0][0]).toBe('Ação desfeita');
  });

  it('does not call onUndo before action.onClick fires', () => {
    const onUndo = vi.fn();
    undoToast({ message: 'msg', onUndo });
    expect(onUndo).not.toHaveBeenCalled();
  });
});

// ── confirmToast ──────────────────────────────────────────────────────────────

describe('confirmToast — returns a Promise', () => {
  it('returns a Promise', () => {
    const result = confirmToast('Are you sure?');
    expect(result).toBeInstanceOf(Promise);
    // Prevent UnhandledRejection: consume the promise
    result.then(() => {});
  });

  it('calls toast() once', () => {
    const result = confirmToast('Delete this?');
    expect(mockToast).toHaveBeenCalledTimes(1);
    result.then(() => {});
  });

  it('passes message as the first argument', () => {
    const result = confirmToast('Are you sure?');
    expect(mockToast.mock.calls[0][0]).toBe('Are you sure?');
    result.then(() => {});
  });

  it('uses Infinity duration (stays until interacted)', () => {
    const result = confirmToast('Delete?');
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.duration).toBe(Infinity);
    result.then(() => {});
  });
});

describe('confirmToast — resolves on user interaction', () => {
  it('resolves to true when action.onClick fires', async () => {
    const promise = confirmToast('Are you sure?');
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const action = opts.action as Record<string, { onClick: () => void }>;
    action.onClick();
    await expect(promise).resolves.toBe(true);
  });

  it('resolves to false when cancel.onClick fires', async () => {
    const promise = confirmToast('Are you sure?');
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const cancel = opts.cancel as Record<string, { onClick: () => void }>;
    cancel.onClick();
    await expect(promise).resolves.toBe(false);
  });

  it('resolves to false when onDismiss fires', async () => {
    const promise = confirmToast('Are you sure?');
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const onDismiss = opts.onDismiss as () => void;
    onDismiss();
    await expect(promise).resolves.toBe(false);
  });

  it('includes "Confirmar" label on action', () => {
    const result = confirmToast('Delete?');
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const action = opts.action as Record<string, unknown>;
    expect(action.label).toBe('Confirmar');
    result.then(() => {});
  });

  it('includes "Cancelar" label on cancel', () => {
    const result = confirmToast('Delete?');
    const opts = mockToast.mock.calls[0][1] as Record<string, unknown>;
    const cancel = opts.cancel as Record<string, unknown>;
    expect(cancel.label).toBe('Cancelar');
    result.then(() => {});
  });
});
