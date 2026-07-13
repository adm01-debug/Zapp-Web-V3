/**
 * Tests for useChatDialogs().
 *
 * The hook wraps a useReducer that manages a flat boolean map of dialog keys.
 * All four actions — OPEN, CLOSE, TOGGLE, RESET — are exercised through the
 * public API (openDialog / closeDialog / toggleDialog / resetDialogs).
 * No network, no storage, no external dependencies.
 *
 * Covered:
 *   - Initial state: every dialog key is false
 *   - openDialog sets the target key to true
 *   - openDialog is idempotent (already-open key stays true, same ref)
 *   - closeDialog sets the target key to false
 *   - closeDialog is idempotent (already-closed key stays false, same ref)
 *   - toggleDialog flips false → true
 *   - toggleDialog flips true → false
 *   - resetDialogs sets specified keys to false, leaves others untouched
 *   - resetDialogs with all-already-false is idempotent (same state ref)
 *   - Multiple dialogs can be open simultaneously
 *   - openDialog, closeDialog, toggleDialog, resetDialogs are stable refs
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatDialogs } from '../useChatDialogs';
import type { DialogKey } from '../useChatDialogs';

// ── initial state ──────────────────────────────────────────────────────────────
describe('useChatDialogs — initial state', () => {
  it('all dialog keys are false', () => {
    const { result } = renderHook(() => useChatDialogs());
    const dialogs = result.current.dialogs;
    for (const value of Object.values(dialogs)) {
      expect(value).toBe(false);
    }
  });

  it('contains all expected dialog keys', () => {
    const { result } = renderHook(() => useChatDialogs());
    const keys: DialogKey[] = [
      'quickReplies', 'slashCommands', 'transferDialog', 'scheduleDialog',
      'callDialog', 'globalSearch', 'chatSearch', 'interactiveBuilder',
      'forwardDialog', 'locationPicker', 'aiAssistant', 'catalogDirect',
      'whisper', 'templatesWithVars', 'realtimeTranscription', 'closeDialog',
      'visualValidation',
    ];
    for (const key of keys) {
      expect(result.current.dialogs).toHaveProperty(key);
    }
  });
});

// ── openDialog ─────────────────────────────────────────────────────────────────
describe('useChatDialogs — openDialog', () => {
  it('sets the target key to true', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => { result.current.openDialog('quickReplies'); });
    expect(result.current.dialogs.quickReplies).toBe(true);
  });

  it('does not affect other keys', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => { result.current.openDialog('chatSearch'); });
    expect(result.current.dialogs.quickReplies).toBe(false);
    expect(result.current.dialogs.aiAssistant).toBe(false);
  });

  it('is idempotent — already-open key does not produce a new state object', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => { result.current.openDialog('whisper'); });
    const stateBefore = result.current.dialogs;
    act(() => { result.current.openDialog('whisper'); });
    expect(result.current.dialogs).toBe(stateBefore);
  });
});

// ── closeDialog ────────────────────────────────────────────────────────────────
describe('useChatDialogs — closeDialog', () => {
  it('sets an open key back to false', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => { result.current.openDialog('transferDialog'); });
    act(() => { result.current.closeDialog('transferDialog'); });
    expect(result.current.dialogs.transferDialog).toBe(false);
  });

  it('is idempotent — already-closed key does not produce a new state object', () => {
    const { result } = renderHook(() => useChatDialogs());
    const stateBefore = result.current.dialogs;
    act(() => { result.current.closeDialog('globalSearch'); });
    expect(result.current.dialogs).toBe(stateBefore);
  });
});

// ── toggleDialog ───────────────────────────────────────────────────────────────
describe('useChatDialogs — toggleDialog', () => {
  it('flips false → true', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => { result.current.toggleDialog('aiAssistant'); });
    expect(result.current.dialogs.aiAssistant).toBe(true);
  });

  it('flips true → false', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => { result.current.openDialog('aiAssistant'); });
    act(() => { result.current.toggleDialog('aiAssistant'); });
    expect(result.current.dialogs.aiAssistant).toBe(false);
  });

  it('double-toggle returns to the original value', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => { result.current.toggleDialog('catalogDirect'); });
    act(() => { result.current.toggleDialog('catalogDirect'); });
    expect(result.current.dialogs.catalogDirect).toBe(false);
  });
});

// ── resetDialogs ───────────────────────────────────────────────────────────────
describe('useChatDialogs — resetDialogs', () => {
  it('closes the specified open keys', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => {
      result.current.openDialog('slashCommands');
      result.current.openDialog('scheduleDialog');
    });
    act(() => { result.current.resetDialogs(['slashCommands', 'scheduleDialog']); });
    expect(result.current.dialogs.slashCommands).toBe(false);
    expect(result.current.dialogs.scheduleDialog).toBe(false);
  });

  it('does not affect keys not in the reset list', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => {
      result.current.openDialog('callDialog');
      result.current.openDialog('locationPicker');
    });
    act(() => { result.current.resetDialogs(['callDialog']); });
    expect(result.current.dialogs.callDialog).toBe(false);
    expect(result.current.dialogs.locationPicker).toBe(true);
  });

  it('is idempotent when all specified keys are already false', () => {
    const { result } = renderHook(() => useChatDialogs());
    const stateBefore = result.current.dialogs;
    act(() => { result.current.resetDialogs(['forwardDialog', 'whisper']); });
    expect(result.current.dialogs).toBe(stateBefore);
  });

  it('handles an empty keys array without throwing', () => {
    const { result } = renderHook(() => useChatDialogs());
    expect(() => {
      act(() => { result.current.resetDialogs([]); });
    }).not.toThrow();
  });
});

// ── multiple dialogs open ──────────────────────────────────────────────────────
describe('useChatDialogs — concurrent open dialogs', () => {
  it('multiple dialogs can be open simultaneously', () => {
    const { result } = renderHook(() => useChatDialogs());
    act(() => {
      result.current.openDialog('quickReplies');
      result.current.openDialog('chatSearch');
      result.current.openDialog('closeDialog');
    });
    expect(result.current.dialogs.quickReplies).toBe(true);
    expect(result.current.dialogs.chatSearch).toBe(true);
    expect(result.current.dialogs.closeDialog).toBe(true);
    expect(result.current.dialogs.aiAssistant).toBe(false);
  });
});

// ── callback stability ─────────────────────────────────────────────────────────
describe('useChatDialogs — callback stability', () => {
  it('openDialog is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatDialogs());
    const first = result.current.openDialog;
    rerender();
    expect(result.current.openDialog).toBe(first);
  });

  it('closeDialog is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatDialogs());
    const first = result.current.closeDialog;
    rerender();
    expect(result.current.closeDialog).toBe(first);
  });

  it('toggleDialog is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatDialogs());
    const first = result.current.toggleDialog;
    rerender();
    expect(result.current.toggleDialog).toBe(first);
  });

  it('resetDialogs is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatDialogs());
    const first = result.current.resetDialogs;
    rerender();
    expect(result.current.resetDialogs).toBe(first);
  });
});
