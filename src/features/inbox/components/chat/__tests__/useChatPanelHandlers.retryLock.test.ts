/**
 * Etapa 44 do plano ChatPanel (CRÍTICO) — regressão do retry preso à conversa.
 *
 * Bug original: `retryLastSend` usava o `onSendMessage` ATUAL com o payload
 * falho retido em ref. Falha na conversa A + troca para B + "Reenviar" =
 * mensagem de A enviada para o CONTATO B.
 *
 * Correções sob teste:
 *  1. O reset da troca de conversa limpa payload falho + banner de erro.
 *  2. Retry na MESMA conversa continua funcionando.
 *  3. Estado residual (whisper/reply/gravação/progresso) não vaza na troca.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPanelHandlers } from '../useChatPanelHandlers';

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
vi.mock('../useInputHandlers', () => ({
  useInputHandlers: () => ({
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleSlashCommand: vi.fn(),
  }),
}));
vi.mock('../useProductHandlers', () => ({
  useProductHandlers: () => ({ handleSendProduct: vi.fn() }),
}));
vi.mock('../useAudioVoiceChange', () => ({
  useAudioVoiceChange: () => ({ handleAudioVoiceChange: vi.fn() }),
}));
vi.mock('../useMessageReactionHandlers', () => ({
  useMessageReactionHandlers: () => ({
    handleReplyToMessage: vi.fn(),
    handleCopyMessage: vi.fn(),
    handleForwardMessage: vi.fn(),
    handleForwardToTargets: vi.fn(),
  }),
}));

type OnSendMessageProp = (
  content: string,
  attachments?: File[],
  onProgress?: (p: number) => void
) => void | Promise<void>;

function makeHandlers(onSendMessage: ReturnType<typeof vi.fn>) {
  return renderHook(
    ({ conversationId, contactId }: { conversationId: string; contactId: string }) =>
      useChatPanelHandlers({
        conversationId,
        contactId,
        contactPhone: '5511999887766',
        instanceName: 'wpp2',
        onSendMessage: onSendMessage as unknown as OnSendMessageProp,
        editMessageApi: vi.fn(),
        applySignature: (t: string) => t,
        handleTypingStart: vi.fn(),
        handleTypingStop: vi.fn(),
        openDialog: vi.fn(),
        closeDialog: vi.fn(),
        handleSetActiveTool: vi.fn(),
      }),
    { initialProps: { conversationId: 'conv-A', contactId: 'contact-A' } }
  );
}

describe('useChatPanelHandlers — retry preso à conversa (etapa 44)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.clear();
    } catch {
      /* indisponível */
    }
  });

  it('payload falho da conversa A NÃO é reenviado após trocar para B', async () => {
    const onSendMessage = vi.fn().mockRejectedValueOnce(new Error('rede caiu'));
    const { result, rerender } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('mensagem confidencial para A');
    });
    await act(async () => {
      await result.current.handleSend();
    });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(result.current.lastSendError).toBe('rede caiu');

    // Troca de conversa: A → B (o ChatPanel não re-monta por key).
    rerender({ conversationId: 'conv-B', contactId: 'contact-B' });

    // Banner da conversa anterior não aparece na nova (etapa 43).
    expect(result.current.lastSendError).toBeNull();

    // "Reenviar" (ex.: clique atrasado) é NO-OP — nada vaza para o contato B.
    await act(async () => {
      await result.current.retryLastSend();
    });
    expect(onSendMessage).toHaveBeenCalledTimes(1);
  });

  it('retry na MESMA conversa reenvia o payload original com sucesso', async () => {
    const onSendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('falha transitória'))
      .mockResolvedValueOnce(undefined);
    const { result } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('tenta de novo');
    });
    await act(async () => {
      await result.current.handleSend();
    });
    expect(result.current.lastSendError).toBe('falha transitória');

    await act(async () => {
      await result.current.retryLastSend();
    });
    expect(onSendMessage).toHaveBeenCalledTimes(2);
    expect(onSendMessage).toHaveBeenLastCalledWith('tenta de novo', undefined);
    expect(result.current.lastSendError).toBeNull();
  });

  it('estado residual não vaza na troca: whisper/reply/gravação/progresso resetados', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = makeHandlers(onSendMessage);

    act(() => {
      result.current.setIsWhisper(true);
      result.current.setIsRecordingAudio(true);
      result.current.setReplyToMessage({
        id: 'm-1',
        conversationId: 'conv-A',
        content: 'msg da conversa A',
        type: 'text',
        sender: 'contact',
        timestamp: new Date(),
        status: 'sent',
      } as never);
    });
    expect(result.current.isWhisper).toBe(true);

    rerender({ conversationId: 'conv-B', contactId: 'contact-B' });

    expect(result.current.isWhisper).toBe(false); // etapa 42
    expect(result.current.isRecordingAudio).toBe(false); // etapa 45
    expect(result.current.replyToMessage).toBeNull(); // etapa 40
    expect(result.current.sendProgress).toBe(0); // etapa 46
    expect(result.current.inputStore.get()).toBe(''); // sem rascunho salvo p/ B
  });
});
