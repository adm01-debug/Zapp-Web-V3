/**
 * E13 — Regression tests for the onSendMessage contract in useChatPanelHandlers.
 *
 * Contract: onSendMessage(content, attachments?, onProgress?) — 3 params.
 * - The progress callback MUST be forwarded so the input bar shows REAL progress
 *   (queue milestones: 5 → 15/media upload % → 100, or 0 on failure).
 * - The caller MUST NOT fake completion (setSendProgress(100)) right after the
 *   await — the sender owns progress reporting once it calls onProgress.
 * - Implementations that never call onProgress (sync, e.g. ChatPopup) must not
 *   leave isSending locked.
 * - A synchronous throw must reset the progress bar to 0.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPanelHandlers } from '../useChatPanelHandlers';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('../../hooks/useWhisperMessagesMutation', () => ({ insertWhisperMessage: vi.fn() }));
vi.mock('../useInputHandlers', async () => {
  const { useState } = await import('react');
  return {
    useInputHandlers: () => {
      const [inputValue, setInputValue] = useState('');
      return {
        inputValue,
        setInputValue,
        handleInputChange: vi.fn(),
        applyTemplate: vi.fn(),
        clearInput: vi.fn(),
      };
    },
  };
});
vi.mock('../useProductHandlers', () => ({
  useProductHandlers: () => ({ handleSendProduct: vi.fn() }),
}));
vi.mock('../useAudioVoiceChange', () => ({
  useAudioVoiceChange: () => ({ handleAudioVoiceChange: vi.fn() }),
}));
vi.mock('../useMessageReactionHandlers', () => ({
  useMessageReactionHandlers: () => ({ handleReaction: vi.fn() }),
}));

// ── Test helpers ──────────────────────────────────────────────────────────────

type OnSendMessageMock = ReturnType<typeof vi.fn>;

function makeHandlers(onSendMessage: OnSendMessageMock) {
  return renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: 'uuid-contact-1',
      contactPhone: '5511999887766',
      instanceName: 'wpp2',
      onSendMessage,
      editMessageApi: vi.fn(),
      applySignature: (t: string) => t,
      handleTypingStart: vi.fn(),
      handleTypingStop: vi.fn(),
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      handleSetActiveTool: vi.fn(),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('E13 — onSendMessage 3-param contract', () => {
  it('passes (content, attachments, onProgress) with onProgress as a function', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('hello');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    const [content, attachments, onProgress] = onSendMessage.mock.calls[0];
    expect(content).toBe('hello');
    expect(attachments).toBeUndefined();
    expect(typeof onProgress).toBe('function');
  });

  it('forwards attachments as the 2nd param', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = makeHandlers(onSendMessage);
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.handleSend([file]);
    });

    const [, attachments] = onSendMessage.mock.calls[0];
    expect(attachments).toEqual([file]);
  });
});

describe('E13 — progress is real (wired through onProgress)', () => {
  it('updates sendProgress from the onProgress callback (queue milestones)', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('hi');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    // Caller must NOT fake 100 right after the await: the sender owns completion.
    expect(result.current.sendProgress).toBe(0);

    // Queue reports milestones → bar follows in real time.
    const onProgress = onSendMessage.mock.calls[0][2];
    await act(async () => {
      onProgress(5);
    });
    expect(result.current.sendProgress).toBe(5);
    await act(async () => {
      onProgress(42);
    });
    expect(result.current.sendProgress).toBe(42);
    await act(async () => {
      onProgress(100);
    });
    expect(result.current.sendProgress).toBe(100);
  });

  it('resets sendProgress to 0 when the send fails after reporting progress', async () => {
    const onSendMessage = vi
      .fn()
      .mockImplementation(
        async (_content: string, _attachments?: File[], onProgress?: (p: number) => void) => {
          onProgress?.(30);
          throw new Error('Network error');
        }
      );
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('hi');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(result.current.sendProgress).toBe(0);
    expect(result.current.lastSendError).toBe('Network error');
  });
});

describe('E13 — sync implementations without progress support', () => {
  it('does not leave isSending locked when onProgress is never called', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('hi');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(result.current.isSending).toBe(false);
  });
});
