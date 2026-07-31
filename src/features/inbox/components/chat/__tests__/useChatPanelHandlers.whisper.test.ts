/**
 * BUG-01/BUG-02 — Regression tests for whisper-mode error handling in useChatPanelHandlers.
 *
 * BUG-01: whisper failures must NOT populate lastFailedSendRef — otherwise
 * retryLastSend re-sends the internal note to the client via onSendMessage.
 * BUG-02: attachments in whisper mode must early-return (never reach
 * insertWhisperMessage — attachments are silently dropped today).
 * Regression: normal (non-whisper) send failures STILL populate lastFailedSendRef.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPanelHandlers } from '../useChatPanelHandlers';
import { insertWhisperMessage } from '../../../hooks/useWhisperMessagesMutation';

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
vi.mock('../../../hooks/useWhisperMessagesMutation', () => ({ insertWhisperMessage: vi.fn() }));
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

// UUID válido — o guard de whisper exige contato interno com UUID
// (JID WhatsApp faz o envio abortar com 'Sussurro indisponivel').
const WHISPER_CONTACT_ID = '123e4567-e89b-12d3-a456-426614174000';

type OnSendMessage = (
  content: string,
  attachments?: File[],
  onProgress?: (p: number) => void
) => void | Promise<void>;

function makeHandlers(onSendMessage: OnSendMessage) {
  return renderHook(() =>
    useChatPanelHandlers({
      conversationId: 'conv-1',
      contactId: WHISPER_CONTACT_ID,
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
  vi.mocked(insertWhisperMessage).mockReset();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BUG-01 — whisper failure must not leak into WhatsApp retry', () => {
  it('does NOT populate lastFailedSendRef and retryLastSend never calls onSendMessage', async () => {
    const onSendMessage = vi.fn<OnSendMessage>().mockResolvedValue(undefined);
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setIsWhisper(true);
    });
    act(() => {
      result.current.setInputValue('nota interna secreta');
    });
    vi.mocked(insertWhisperMessage).mockRejectedValue(new Error('whisper insert failed'));

    await act(async () => {
      await result.current.handleSend();
    });

    // Whisper path: nunca toca onSendMessage.
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(result.current.lastSendError).toBe('whisper insert failed');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao enviar sussurro', variant: 'destructive' })
    );

    // Retry deve ser no-op: lastFailedSendRef NÃO foi populado.
    await act(async () => {
      await result.current.retryLastSend();
    });
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

describe('BUG-02 — attachments in whisper mode early-return', () => {
  it('returns early and NEVER calls insertWhisperMessage', async () => {
    const onSendMessage = vi.fn<OnSendMessage>().mockResolvedValue(undefined);
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setIsWhisper(true);
    });
    act(() => {
      result.current.setInputValue('nota com anexo');
    });

    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
    await act(async () => {
      await result.current.handleSend([file]);
    });

    expect(vi.mocked(insertWhisperMessage)).not.toHaveBeenCalled();
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(result.current.isSending).toBe(false);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Aviso',
        description: 'Arquivos nao sao suportados em modo sussurro no momento.',
        variant: 'destructive',
      })
    );
  });
});

describe('Regression — normal send failure still populates lastFailedSendRef', () => {
  it('retryLastSend re-sends via onSendMessage after a non-whisper failure', async () => {
    const onSendMessage = vi.fn<OnSendMessage>().mockRejectedValue(new Error('network down'));
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('mensagem normal');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(result.current.lastSendError).toBe('network down');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao enviar', variant: 'destructive' })
    );

    // Retry reenvia via WhatsApp (onSendMessage) — comportamento não-whisper intacto.
    await act(async () => {
      await result.current.retryLastSend();
    });
    expect(onSendMessage).toHaveBeenCalledTimes(2);
  });
});
