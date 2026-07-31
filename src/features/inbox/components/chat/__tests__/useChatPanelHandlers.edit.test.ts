/**
 * Regression tests for the edit-message flow in useChatPanelHandlers.
 *
 * Critical invariant: editMessageApi MUST be awaited before any success toast.
 * If the API call fails, no success toast should appear (no false-success).
 * If preconditions are missing (no JID, no externalId, no instance), an error
 * toast must appear instead of a success toast.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPanelHandlers } from '../useChatPanelHandlers';
import type { Message } from '@/types/chat';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

const mockDbUpdate = vi.fn();
const mockDbFrom = vi.fn((..._args: unknown[]): unknown => ({ update: mockDbUpdate }));
mockDbUpdate.mockReturnValue({
  eq: vi.fn(() => ({
    select: vi.fn(() => Promise.resolve({ data: [{ id: 'msg-1' }], error: null })),
  })),
});

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (...args: unknown[]) => mockDbFrom(...args),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
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

const EDIT_JID = '5511999887766@s.whatsapp.net';
const EDIT_MSG: Message = {
  id: 'msg-1',
  external_id: 'ext-abc123',
  content: 'old text',
  status: 'sent',
  timestamp: new Date().toISOString(),
  type: 'text',
  fromMe: true,
  conversationId: 'conv-1',
} as unknown as Message;

type EditMessageApiMock = (
  instance: string,
  params: { number: string; messageId: string; text: string }
) => Promise<unknown>;

function makeHandlers(editMessageApi: ReturnType<typeof vi.fn>) {
  return renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: EDIT_JID,
      contactPhone: '5511999887766',
      instanceName: 'wpp2',
      onSendMessage: vi.fn(),
      editMessageApi: editMessageApi as unknown as EditMessageApiMock,
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
  mockDbFrom.mockReturnValue({
    update: () => ({
      eq: () => ({
        select: () => Promise.resolve({ data: [{ id: 'msg-1' }], error: null }),
      }),
    }),
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('edit message — API called before success toast', () => {
  it('calls editMessageApi before showing success toast on happy path', async () => {
    const callOrder: string[] = [];
    const editMessageApi = vi.fn(async () => {
      callOrder.push('api');
    });
    mockToast.mockImplementation(() => {
      callOrder.push('toast');
    });

    const { result } = makeHandlers(editMessageApi);

    act(() => {
      result.current.handleEditStart(EDIT_MSG);
    });
    act(() => {
      result.current.setInputValue('new text');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(editMessageApi).toHaveBeenCalledTimes(1);
    const apiIdx = callOrder.indexOf('api');
    const toastIdx = callOrder.indexOf('toast');
    expect(apiIdx).toBeGreaterThanOrEqual(0);
    expect(toastIdx).toBeGreaterThan(apiIdx);
  });

  it('does NOT show success toast when editMessageApi throws', async () => {
    const editMessageApi = vi.fn().mockRejectedValue(new Error('Network error'));

    const { result } = makeHandlers(editMessageApi);

    act(() => {
      result.current.handleEditStart(EDIT_MSG);
    });
    act(() => {
      result.current.setInputValue('new text');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    const successToasts = mockToast.mock.calls.filter(([p]) =>
      typeof p === 'object' && p !== null && 'variant' in p
        ? (p as { variant: string }).variant !== 'destructive'
        : true
    );
    // Only destructive toasts (errors) should appear when API throws
    const destructiveToasts = mockToast.mock.calls.filter(
      ([p]) =>
        typeof p === 'object' && p !== null && (p as { variant?: string }).variant === 'destructive'
    );
    expect(successToasts.length).toBe(0);
    expect(destructiveToasts.length).toBeGreaterThan(0);
  });
});

describe('edit message — precondition guard', () => {
  it('shows error toast and does not call API when message has no external_id', async () => {
    const editMessageApi = vi.fn();
    const { result } = makeHandlers(editMessageApi);

    const msgWithoutExternalId: Message = {
      ...EDIT_MSG,
      external_id: undefined,
    } as unknown as Message;
    act(() => {
      result.current.handleEditStart(msgWithoutExternalId);
    });
    act(() => {
      result.current.setInputValue('new text');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(editMessageApi).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('calls editMessageApi with correct params when all preconditions are met', async () => {
    const editMessageApi = vi.fn().mockResolvedValue(undefined);
    const { result } = makeHandlers(editMessageApi);

    act(() => {
      result.current.handleEditStart(EDIT_MSG);
    });
    act(() => {
      result.current.setInputValue('updated text');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(editMessageApi).toHaveBeenCalledWith('wpp2', {
      number: EDIT_JID,
      messageId: 'ext-abc123',
      text: 'updated text',
    });
  });
});
