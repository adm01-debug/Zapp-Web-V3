/**
 * Tests for useIndexKeyboardShortcuts().
 *
 * The hook registers a 'keydown' listener on window and dispatches to
 * goBack / goForward / setCurrentView based on the key combination.
 * happy-dom provides a real window event system — no mocking needed.
 *
 * Covered:
 *   - Alt+ArrowLeft calls goBack()
 *   - Alt+ArrowRight calls goForward()
 *   - Alt+Home calls setCurrentView('inbox')
 *   - Escape (no dialog, no input, canGoBack=true) calls goBack()
 *   - Escape with canGoBack=false does NOT call goBack()
 *   - Escape when dialog is open does NOT call goBack()
 *   - Escape when target is INPUT does NOT call goBack()
 *   - Escape when target is TEXTAREA does NOT call goBack()
 *   - Escape when target is contentEditable does NOT call goBack()
 *   - Unrelated key does not trigger any callback
 *   - Listener is removed on unmount (subsequent events are ignored)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIndexKeyboardShortcuts } from '../useIndexKeyboardShortcuts';

function fireKey(key: string, options: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }));
}

function makeProps(overrides?: Partial<{
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  setCurrentView: (v: string) => void;
}>) {
  return {
    goBack: vi.fn(),
    goForward: vi.fn(),
    canGoBack: true,
    setCurrentView: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  // Clean up any dialogs added by previous tests
  document.querySelectorAll('[data-state="open"][role="dialog"]').forEach((el) => el.remove());
});

// ── Alt+ArrowLeft ──────────────────────────────────────────────────────────────
describe('useIndexKeyboardShortcuts — Alt+ArrowLeft', () => {
  it('calls goBack()', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('ArrowLeft', { altKey: true });
    expect(props.goBack).toHaveBeenCalledTimes(1);
  });

  it('does NOT call goForward or setCurrentView', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('ArrowLeft', { altKey: true });
    expect(props.goForward).not.toHaveBeenCalled();
    expect(props.setCurrentView).not.toHaveBeenCalled();
  });
});

// ── Alt+ArrowRight ─────────────────────────────────────────────────────────────
describe('useIndexKeyboardShortcuts — Alt+ArrowRight', () => {
  it('calls goForward()', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('ArrowRight', { altKey: true });
    expect(props.goForward).toHaveBeenCalledTimes(1);
  });

  it('does NOT call goBack or setCurrentView', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('ArrowRight', { altKey: true });
    expect(props.goBack).not.toHaveBeenCalled();
    expect(props.setCurrentView).not.toHaveBeenCalled();
  });
});

// ── Alt+Home ───────────────────────────────────────────────────────────────────
describe('useIndexKeyboardShortcuts — Alt+Home', () => {
  it('calls setCurrentView("inbox")', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('Home', { altKey: true });
    expect(props.setCurrentView).toHaveBeenCalledWith('inbox');
  });

  it('does NOT call goBack or goForward', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('Home', { altKey: true });
    expect(props.goBack).not.toHaveBeenCalled();
    expect(props.goForward).not.toHaveBeenCalled();
  });
});

// ── Escape ─────────────────────────────────────────────────────────────────────
describe('useIndexKeyboardShortcuts — Escape', () => {
  it('calls goBack() when no dialog is open and canGoBack=true', () => {
    const props = makeProps({ canGoBack: true });
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('Escape');
    expect(props.goBack).toHaveBeenCalledTimes(1);
  });

  it('does NOT call goBack() when canGoBack=false', () => {
    const props = makeProps({ canGoBack: false });
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('Escape');
    expect(props.goBack).not.toHaveBeenCalled();
  });

  it('does NOT call goBack() when a dialog is open', () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('data-state', 'open');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    const props = makeProps({ canGoBack: true });
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('Escape');
    expect(props.goBack).not.toHaveBeenCalled();

    dialog.remove();
  });

  it('does NOT call goBack() when the event target is an INPUT', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);

    const props = makeProps({ canGoBack: true });
    renderHook(() => useIndexKeyboardShortcuts(props));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(props.goBack).not.toHaveBeenCalled();

    input.remove();
  });

  it('does NOT call goBack() when the event target is a TEXTAREA', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);

    const props = makeProps({ canGoBack: true });
    renderHook(() => useIndexKeyboardShortcuts(props));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(props.goBack).not.toHaveBeenCalled();

    ta.remove();
  });

  it('does NOT call goBack() when the target is contentEditable', () => {
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);

    const props = makeProps({ canGoBack: true });
    renderHook(() => useIndexKeyboardShortcuts(props));
    div.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(props.goBack).not.toHaveBeenCalled();

    div.remove();
  });
});

// ── unrelated keys ─────────────────────────────────────────────────────────────
describe('useIndexKeyboardShortcuts — unrelated keys', () => {
  it('ignores Enter key', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('Enter');
    expect(props.goBack).not.toHaveBeenCalled();
    expect(props.goForward).not.toHaveBeenCalled();
    expect(props.setCurrentView).not.toHaveBeenCalled();
  });

  it('ignores ArrowLeft without Alt modifier', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('ArrowLeft');
    expect(props.goBack).not.toHaveBeenCalled();
  });

  it('ignores ArrowRight without Alt modifier', () => {
    const props = makeProps();
    renderHook(() => useIndexKeyboardShortcuts(props));
    fireKey('ArrowRight');
    expect(props.goForward).not.toHaveBeenCalled();
  });
});

// ── cleanup on unmount ─────────────────────────────────────────────────────────
describe('useIndexKeyboardShortcuts — cleanup', () => {
  it('does not respond to events after unmount', () => {
    const props = makeProps();
    const { unmount } = renderHook(() => useIndexKeyboardShortcuts(props));
    unmount();
    fireKey('ArrowLeft', { altKey: true });
    expect(props.goBack).not.toHaveBeenCalled();
  });
});
