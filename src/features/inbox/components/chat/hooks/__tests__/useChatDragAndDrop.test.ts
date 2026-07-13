/**
 * Tests for useChatDragAndDrop().
 *
 * The hook manages drag-and-drop UX for the chat panel:
 * a counter-based isDraggingOver flag (to handle nested drag-enter/leave
 * events correctly) and a handleDrop that delegates file lists to
 * fileUploaderRef.current.handleExternalFiles.
 *
 * All DragEvent interactions are simulated via plain mock objects —
 * no real DOM or file system access required.
 *
 * Covered:
 *   - isDraggingOver starts as false
 *   - handleDragEnter with Files sets isDraggingOver to true
 *   - handleDragEnter without Files does NOT set isDraggingOver to true
 *   - handleDragEnter calls preventDefault and stopPropagation
 *   - multiple handleDragEnter calls (nested divs) keep isDraggingOver true
 *   - handleDragLeave decrements counter but stays true while counter > 0
 *   - handleDragLeave sets isDraggingOver to false when counter reaches 0
 *   - handleDragLeave calls preventDefault and stopPropagation
 *   - handleDragOver calls preventDefault and stopPropagation
 *   - handleDrop sets isDraggingOver to false
 *   - handleDrop resets drag counter (subsequent leave does not keep overlay)
 *   - handleDrop calls handleExternalFiles with the dropped File array
 *   - handleDrop with no files does NOT call handleExternalFiles
 *   - handleDrop with no ref.current does NOT throw
 *   - drag handlers are stable references across re-renders
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { useChatDragAndDrop } from '../useChatDragAndDrop';
import type { FileUploaderRef } from '../../../FileUploader';

function makeUploaderRef(overrides: Partial<FileUploaderRef> = {}): React.RefObject<FileUploaderRef> {
  const ref = createRef<FileUploaderRef>();
  (ref as { current: FileUploaderRef }).current = {
    handleExternalFile: vi.fn(),
    handleExternalFiles: vi.fn(),
    triggerFilePicker: vi.fn(),
    ...overrides,
  };
  return ref;
}

function makeNullRef(): React.RefObject<FileUploaderRef> {
  return { current: null } as React.RefObject<FileUploaderRef>;
}

function makeDragEvent(withFiles = true): React.DragEvent {
  const file = new File(['content'], 'photo.png', { type: 'image/png' });
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      types: withFiles ? ['Files'] : ['text/plain'],
      files: withFiles ? [file] : [],
    },
  } as unknown as React.DragEvent;
}

// ── initial state ──────────────────────────────────────────────────────────────
describe('useChatDragAndDrop — initial state', () => {
  it('isDraggingOver starts as false', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    expect(result.current.isDraggingOver).toBe(false);
  });

  it('exposes the four drag handler callbacks', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    expect(typeof result.current.dragHandlers.onDragEnter).toBe('function');
    expect(typeof result.current.dragHandlers.onDragLeave).toBe('function');
    expect(typeof result.current.dragHandlers.onDragOver).toBe('function');
    expect(typeof result.current.dragHandlers.onDrop).toBe('function');
  });
});

// ── handleDragEnter ────────────────────────────────────────────────────────────
describe('useChatDragAndDrop — handleDragEnter', () => {
  it('sets isDraggingOver to true when Files are present in dataTransfer', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => { result.current.dragHandlers.onDragEnter(makeDragEvent(true)); });
    expect(result.current.isDraggingOver).toBe(true);
  });

  it('does NOT set isDraggingOver when no Files in dataTransfer', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => { result.current.dragHandlers.onDragEnter(makeDragEvent(false)); });
    expect(result.current.isDraggingOver).toBe(false);
  });

  it('calls preventDefault', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const e = makeDragEvent(true);
    act(() => { result.current.dragHandlers.onDragEnter(e); });
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('calls stopPropagation', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const e = makeDragEvent(true);
    act(() => { result.current.dragHandlers.onDragEnter(e); });
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('keeps isDraggingOver true across multiple nested enters', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => {
      result.current.dragHandlers.onDragEnter(makeDragEvent(true));
      result.current.dragHandlers.onDragEnter(makeDragEvent(true));
      result.current.dragHandlers.onDragEnter(makeDragEvent(true));
    });
    expect(result.current.isDraggingOver).toBe(true);
  });
});

// ── handleDragLeave ────────────────────────────────────────────────────────────
describe('useChatDragAndDrop — handleDragLeave', () => {
  it('calls preventDefault and stopPropagation', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => { result.current.dragHandlers.onDragEnter(makeDragEvent(true)); });
    const e = makeDragEvent(true);
    act(() => { result.current.dragHandlers.onDragLeave(e); });
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('keeps isDraggingOver true while counter > 0 after leave', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    // Enter twice (counter → 2)
    act(() => {
      result.current.dragHandlers.onDragEnter(makeDragEvent(true));
      result.current.dragHandlers.onDragEnter(makeDragEvent(true));
    });
    // Leave once (counter → 1)
    act(() => { result.current.dragHandlers.onDragLeave(makeDragEvent(true)); });
    expect(result.current.isDraggingOver).toBe(true);
  });

  it('sets isDraggingOver to false when counter reaches 0', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => { result.current.dragHandlers.onDragEnter(makeDragEvent(true)); }); // → 1
    act(() => { result.current.dragHandlers.onDragLeave(makeDragEvent(true)); }); // → 0
    expect(result.current.isDraggingOver).toBe(false);
  });

  it('balances multiple enters with matching leaves', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => {
      result.current.dragHandlers.onDragEnter(makeDragEvent(true)); // 1
      result.current.dragHandlers.onDragEnter(makeDragEvent(true)); // 2
      result.current.dragHandlers.onDragEnter(makeDragEvent(true)); // 3
    });
    act(() => {
      result.current.dragHandlers.onDragLeave(makeDragEvent(true)); // 2
      result.current.dragHandlers.onDragLeave(makeDragEvent(true)); // 1
    });
    expect(result.current.isDraggingOver).toBe(true);
    act(() => { result.current.dragHandlers.onDragLeave(makeDragEvent(true)); }); // 0
    expect(result.current.isDraggingOver).toBe(false);
  });
});

// ── handleDragOver ─────────────────────────────────────────────────────────────
describe('useChatDragAndDrop — handleDragOver', () => {
  it('calls preventDefault', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const e = makeDragEvent(true);
    act(() => { result.current.dragHandlers.onDragOver(e); });
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('calls stopPropagation', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const e = makeDragEvent(true);
    act(() => { result.current.dragHandlers.onDragOver(e); });
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('does not change isDraggingOver', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => { result.current.dragHandlers.onDragOver(makeDragEvent(true)); });
    expect(result.current.isDraggingOver).toBe(false);
  });
});

// ── handleDrop ─────────────────────────────────────────────────────────────────
describe('useChatDragAndDrop — handleDrop', () => {
  it('calls preventDefault and stopPropagation', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const e = makeDragEvent(true);
    act(() => { result.current.dragHandlers.onDrop(e); });
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('sets isDraggingOver to false', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    act(() => { result.current.dragHandlers.onDragEnter(makeDragEvent(true)); });
    expect(result.current.isDraggingOver).toBe(true);
    act(() => { result.current.dragHandlers.onDrop(makeDragEvent(true)); });
    expect(result.current.isDraggingOver).toBe(false);
  });

  it('resets the drag counter (subsequent leave does not re-trigger hide)', () => {
    const { result } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    // Enter twice, drop → counter should be 0
    act(() => {
      result.current.dragHandlers.onDragEnter(makeDragEvent(true));
      result.current.dragHandlers.onDragEnter(makeDragEvent(true));
    });
    act(() => { result.current.dragHandlers.onDrop(makeDragEvent(true)); });
    // One leave after drop should set counter to -1; isDraggingOver already false, no crash
    act(() => { result.current.dragHandlers.onDragLeave(makeDragEvent(true)); });
    expect(result.current.isDraggingOver).toBe(false);
  });

  it('calls handleExternalFiles with the dropped files', () => {
    const ref = makeUploaderRef();
    const { result } = renderHook(() => useChatDragAndDrop(ref));
    const e = makeDragEvent(true);
    act(() => { result.current.dragHandlers.onDrop(e); });
    expect(ref.current!.handleExternalFiles).toHaveBeenCalledTimes(1);
    expect(ref.current!.handleExternalFiles).toHaveBeenCalledWith(
      Array.from(e.dataTransfer.files)
    );
  });

  it('does NOT call handleExternalFiles when no files are dropped', () => {
    const ref = makeUploaderRef();
    const { result } = renderHook(() => useChatDragAndDrop(ref));
    act(() => { result.current.dragHandlers.onDrop(makeDragEvent(false)); });
    expect(ref.current!.handleExternalFiles).not.toHaveBeenCalled();
  });

  it('does NOT throw when ref.current is null', () => {
    const ref = makeNullRef();
    const { result } = renderHook(() => useChatDragAndDrop(ref));
    expect(() => {
      act(() => { result.current.dragHandlers.onDrop(makeDragEvent(true)); });
    }).not.toThrow();
  });
});

// ── handler stability ──────────────────────────────────────────────────────────
describe('useChatDragAndDrop — handler stability', () => {
  it('onDragEnter is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const first = result.current.dragHandlers.onDragEnter;
    rerender();
    expect(result.current.dragHandlers.onDragEnter).toBe(first);
  });

  it('onDragLeave is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const first = result.current.dragHandlers.onDragLeave;
    rerender();
    expect(result.current.dragHandlers.onDragLeave).toBe(first);
  });

  it('onDragOver is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useChatDragAndDrop(makeUploaderRef()));
    const first = result.current.dragHandlers.onDragOver;
    rerender();
    expect(result.current.dragHandlers.onDragOver).toBe(first);
  });
});
