/**
 * SIMULAÇÃO — bateria de edge cases do módulo chat (19 cenários numerados).
 *
 * Cobre cenários que os testes de regressão existentes NÃO exercitam:
 *   - usoChatPanelHandlers (1-3): regressão anti-fix do whisper com
 *     attachments em envio NORMAL; JID em whisper; whisper sem perfil.
 *   - useProductHandlers (4-10): location/interactive com dados extremos
 *     (JID, lat/lng negativos, phone vazio, buttons [], title ausente).
 *   - useInputHandlers (11-17): callbacks AUSENTES e comandos honestos
 *     (/archive, /priority) com todos os callbacks presentes.
 *   - ChatMessagesArea (18-19): handler realtime de DELETE com e sem
 *     payload.old.id (BUG-25 — REPLICA IDENTITY FULL).
 *
 * Padrões de mock copiados de:
 *   - useChatPanelHandlers.whisper.test.ts  (insertWhisperMessage, useAuth, undoToast)
 *   - useProductHandlers.location.test.ts   (whatsapp.sendLocation, dbFrom, toast)
 *   - useInputHandlers.slash.test.ts        (callbacks, makeHandlers)
 *   - ChatMessagesArea.scrollToMessage.test.tsx (supabase/query/virtualizer/logger/RO)
 *
 * NOTA: useInputHandlers e useProductHandlers são usados REAIS (importam
 * apenas toast + tipos + módulos mockados), então o mesmo arquivo consegue
 * exercitar o hook real E o useChatPanelHandlers que os consome.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render } from '@testing-library/react';
// NOTA: arquivo .ts (sem JSX) — os renders do ChatMessagesArea usam
// createElement para manter o nome de arquivo exato pedido (.ts).
import { createElement } from 'react';
import { useChatPanelHandlers } from '../useChatPanelHandlers';
import { insertWhisperMessage } from '../../../hooks/useWhisperMessagesMutation';
import { useProductHandlers } from '../useProductHandlers';
import { whatsapp } from '@/lib/whatsappAdapter';
import { dbFrom } from '@/integrations/datasource/db';
import { useInputHandlers } from '../useInputHandlers';
import { ChatMessagesArea } from '../ChatMessagesArea';
import type { Message, InteractiveButton } from '@/types/chat';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

// useAuth mutável por cenário (cenário 3 precisa de profile SEM id).
const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock('@/features/auth', () => ({ useAuth: () => authMock() }));

// dbFrom com insert (cenários de location) E select (padrão whisper test).
const { dbFromMock, mockInsert } = vi.hoisted(() => {
  const mockInsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const dbFromMock = vi.fn(() => ({
    select: vi.fn(() => Promise.resolve({ data: [], error: null })),
    insert: mockInsert,
  }));
  return { dbFromMock, mockInsert };
});
vi.mock('@/integrations/datasource/db', () => ({ dbFrom: dbFromMock }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('../../../hooks/useWhisperMessagesMutation', () => ({ insertWhisperMessage: vi.fn() }));
vi.mock('@/lib/whatsappAdapter', () => ({
  whatsapp: { sendLocation: vi.fn(), sendInteractive: vi.fn() },
}));

// useChatPanelHandlers consome estes hooks — mockados como no whisper test.
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

// ── Mocks ChatMessagesArea (mesmo padrão do scrollToMessage test) ────────────
const { channelSpy, channelMock, queryClientMock } = vi.hoisted(() => {
  const channelSpy = vi.fn();
  const channelMock = { on: vi.fn(), subscribe: vi.fn() };
  channelMock.on.mockReturnValue(channelMock);
  channelMock.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
  channelSpy.mockReturnValue(channelMock);
  return {
    channelSpy,
    channelMock,
    queryClientMock: { invalidateQueries: vi.fn() },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: channelSpy, removeChannel: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
    measureElement: () => {},
    scrollToIndex: vi.fn(),
  }),
}));

vi.mock('@/components/ui/motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: () => null,
}));

vi.mock('@/features/inbox/components/chat/MessageBubble', () => ({
  MessageBubble: () => null,
}));
vi.mock('@/features/inbox/components/chat/ChatWatermark', () => ({
  ChatWatermark: () => null,
}));
vi.mock('@/features/inbox/components/TypingIndicator', () => ({
  TypingIndicator: () => null,
}));
vi.mock('@/features/inbox/hooks/reactions/useConversationReactionsRealtime', () => ({
  useConversationReactionsRealtime: () => {},
}));

// happy-dom não expõe ResizeObserver; o componente o usa no useLayoutEffect
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// ── Fixtures compartilhadas ───────────────────────────────────────────────────

// UUID válido — contato interno (whisper/insert permitidos).
const WHISPER_CONTACT_ID = '123e4567-e89b-12d3-a456-426614174000';
// JID do WhatsApp — contato externo (whisper/insert bloqueados).
const CONTACT_JID = '5511999887766@s.whatsapp.net';

type OnSendMessage = (
  content: string,
  attachments?: File[],
  onProgress?: (p: number) => void
) => void | Promise<void>;

const sendLocationMock = whatsapp.sendLocation as unknown as ReturnType<typeof vi.fn>;
const sendInteractiveMock = whatsapp.sendInteractive as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(insertWhisperMessage).mockReset();
  authMock.mockReturnValue({ profile: { id: 'user-1' } });
  sendLocationMock.mockReset();
  sendLocationMock.mockResolvedValue({ key: { id: 'loc-1' } });
  sendInteractiveMock.mockReset();
  sendInteractiveMock.mockResolvedValue({ key: { id: 'int-1' } });
  mockInsert.mockReset();
  mockInsert.mockResolvedValue({ data: null, error: null });
  dbFromMock.mockClear();
});

// ═════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO 01-03 — useChatPanelHandlers
// ═════════════════════════════════════════════════════════════════════════════

function makePanelHandlers(
  onSendMessage: OnSendMessage,
  overrides: Partial<Parameters<typeof useChatPanelHandlers>[0]> = {}
) {
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
      ...overrides,
    })
  );
}

describe('SIMULAÇÃO 01-03 — useChatPanelHandlers', () => {
  it('CENARIO 1 — envio NORMAL com attachments NUNCA e bloqueado pelo fix do whisper', async () => {
    // Regressão anti-fix: o guard de attachments do whisper (early-return)
    // NÃO pode vazar para o caminho não-whisper.
    const onSendMessage = vi.fn<OnSendMessage>().mockResolvedValue(undefined);
    const { result } = makePanelHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('promocao de julho');
    });
    const file = new File(['x'], 'flyer.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.handleSend([file]);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('promocao de julho', [file], expect.any(Function));
    // O fix do whisper não pode sequer tocar o caminho de whisper.
    expect(vi.mocked(insertWhisperMessage)).not.toHaveBeenCalled();
    expect(result.current.isSending).toBe(false);
  });

  it('CENARIO 1b — envio SO-MIDIA (texto vazio) com attachments nao e bloqueado', async () => {
    // bypassEmptyText só vale para envio novo não-whisper — mídia sem legenda
    // precisa chegar no onSendMessage.
    const onSendMessage = vi.fn<OnSendMessage>().mockResolvedValue(undefined);
    const { result } = makePanelHandlers(onSendMessage);

    act(() => {
      result.current.setInputValue('');
    });
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.handleSend([file]);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('', [file], expect.any(Function));
  });

  it('CENARIO 2 — whisper com contactId JID → toast "Sussurro indisponivel" e insertWhisperMessage NUNCA chamado', async () => {
    const onSendMessage = vi.fn<OnSendMessage>().mockResolvedValue(undefined);
    const { result } = makePanelHandlers(onSendMessage, { contactId: CONTACT_JID });

    act(() => {
      result.current.setIsWhisper(true);
    });
    act(() => {
      result.current.setInputValue('nota interna');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    // Guard: whisper_messages.contact_id é uuid — JID causaria PostgREST 400.
    expect(vi.mocked(insertWhisperMessage)).not.toHaveBeenCalled();
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sussurro indisponivel', variant: 'destructive' })
    );
    expect(result.current.isSending).toBe(false);
  });

  it('CENARIO 3 — whisper sem profile.id → erro "Usuario nao autenticado" e lastFailedSendRef NAO populado', async () => {
    authMock.mockReturnValue({ profile: null });
    const onSendMessage = vi.fn<OnSendMessage>().mockResolvedValue(undefined);
    const { result } = makePanelHandlers(onSendMessage);

    act(() => {
      result.current.setIsWhisper(true);
    });
    act(() => {
      result.current.setInputValue('nota sem usuario');
    });

    await act(async () => {
      await result.current.handleSend();
    });

    expect(result.current.lastSendError).toBe('Usuario nao autenticado');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao enviar sussurro', variant: 'destructive' })
    );

    // Prova de que lastFailedSendRef NÃO foi populado: retry é no-op e nunca
    // vaza a nota interna para o cliente via onSendMessage.
    await act(async () => {
      await result.current.retryLastSend();
    });
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO 04-10 — useProductHandlers
// ═════════════════════════════════════════════════════════════════════════════

function makeProductHandlers(overrides: Partial<Parameters<typeof useProductHandlers>[0]> = {}) {
  return renderHook(() =>
    useProductHandlers({
      contactId: WHISPER_CONTACT_ID,
      contactPhone: '+55 (11) 99988-7766',
      instanceName: 'wpp2',
      onSendMessage: vi.fn<OnSendMessage>(() => Promise.resolve()),
      ...overrides,
    })
  );
}

describe('SIMULAÇÃO 04-10 — useProductHandlers', () => {
  it('CENARIO 4 — location sem phone → toast erro e sendLocation NUNCA chamado', async () => {
    const { result } = makeProductHandlers({ contactPhone: '' });

    await act(async () => {
      await result.current.handleSendLocation({ latitude: -23.55052, longitude: -46.633308 });
    });

    expect(sendLocationMock).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ title: 'Contato sem telefone', variant: 'destructive' });
  });

  it('CENARIO 5 — location com contactId JID → sendLocation chamado, dbFrom.insert NUNCA chamado', async () => {
    const { result } = makeProductHandlers({ contactId: CONTACT_JID });

    await act(async () => {
      await result.current.handleSendLocation({
        latitude: -23.55052,
        longitude: -46.633308,
        name: 'Loja',
      });
    });

    expect(sendLocationMock).toHaveBeenCalledTimes(1);
    expect(sendLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({ remoteJid: '5511999887766@s.whatsapp.net' })
    );
    // JID violaria a FK uuid de messages.contact_id — não pode persistir.
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Localizacao enviada!' })
    );
  });

  it('CENARIO 6 — location com lat/lng negativos → sendLocation com os valores exatos', async () => {
    const { result } = makeProductHandlers();

    await act(async () => {
      await result.current.handleSendLocation({ latitude: -23.55052, longitude: -46.633308 });
    });

    expect(sendLocationMock).toHaveBeenCalledTimes(1);
    const params = sendLocationMock.mock.calls[0][0] as {
      latitude: number;
      longitude: number;
    };
    expect(params.latitude).toBe(-23.55052);
    expect(params.longitude).toBe(-46.633308);
    expect(sendLocationMock).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: -23.55052, longitude: -46.633308 })
    );
  });

  it('CENARIO 7 — location com sendLocation REJEITADO → toast destructive e dbFrom.insert NUNCA chamado', async () => {
    sendLocationMock.mockRejectedValue(new Error('instancia offline'));
    const { result } = makeProductHandlers();

    await act(async () => {
      await result.current.handleSendLocation({ latitude: -23.55, longitude: -46.63 });
    });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro ao enviar localizacao',
        description: 'instancia offline',
        variant: 'destructive',
      })
    );
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Localizacao enviada!' })
    );
  });

  it('CENARIO 8 — interactive com buttons [] → sendInteractive chamado com buttons [] (sem crash)', async () => {
    const { result } = makeProductHandlers();

    await act(async () => {
      await result.current.handleSendInteractiveMessage({
        type: 'buttons',
        body: 'Escolha uma opcao:',
        buttons: [],
      });
    });

    expect(sendInteractiveMock).toHaveBeenCalledTimes(1);
    expect(sendInteractiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ remoteJid: '5511999887766@s.whatsapp.net', buttons: [] })
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Mensagem interativa enviada!',
        description: 'Mensagem com 0 botoes enviada.',
      })
    );
  });

  it('CENARIO 9 — interactive com phone vazio → toast erro e sendInteractive NUNCA chamado', async () => {
    const { result } = makeProductHandlers({ contactPhone: '' });

    await act(async () => {
      await result.current.handleSendInteractiveMessage({
        type: 'buttons',
        body: 'Escolha:',
        buttons: [{ type: 'reply', id: 'b1', title: 'Sim' }],
      });
    });

    expect(sendInteractiveMock).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith({ title: 'Contato sem telefone', variant: 'destructive' });
  });

  it('CENARIO 10 — botao click com title undefined e id presente → onSendMessage chamado com o id', () => {
    const onSendMessage = vi.fn<OnSendMessage>(() => Promise.resolve());
    const { result } = makeProductHandlers({ onSendMessage });
    const buttonWithoutTitle = { type: 'reply', id: 'b1' } as unknown as InteractiveButton;

    act(() => {
      result.current.handleInteractiveButtonClick(buttonWithoutTitle);
    });

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('b1');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO 11-17 — useInputHandlers
// ═════════════════════════════════════════════════════════════════════════════

function makeInputHandlers(overrides: Partial<Parameters<typeof useInputHandlers>[0]> = {}) {
  const setInputValue = vi.fn();
  const setIsWhisper = vi.fn();
  const openDialog = vi.fn();
  const closeDialog = vi.fn();
  const handleTypingStart = vi.fn();
  const handleTypingStop = vi.fn();
  const handleSend = vi.fn();
  const handleSetActiveTool = vi.fn();
  const callbacks = {
    onResolveConversation: vi.fn().mockResolvedValue(undefined),
    onSnooze: vi.fn().mockResolvedValue(undefined),
    onStarToggle: vi.fn().mockResolvedValue(undefined),
    onRemind: vi.fn().mockResolvedValue(undefined),
    onAddNote: vi.fn().mockResolvedValue(undefined),
    onAddTag: vi.fn().mockResolvedValue(undefined),
    onTransferDialog: vi.fn(),
    ...overrides,
  };
  const { result } = renderHook(() =>
    useInputHandlers({
      setInputValue,
      setIsWhisper,
      openDialog,
      closeDialog,
      handleTypingStart,
      handleTypingStop,
      handleSend,
      handleSetActiveTool,
      ...callbacks,
    })
  );
  return { result, callbacks };
}

describe('SIMULAÇÃO 11-17 — useInputHandlers', () => {
  it('CENARIO 11 — resolve com onResolveConversation AUSENTE → nenhum erro, nenhum toast de sucesso', async () => {
    const { result, callbacks } = makeInputHandlers({ onResolveConversation: undefined });

    await act(async () => {
      result.current.handleSlashCommand({ id: 'resolve' });
    });

    // Sem callback configurado, NÃO há falso-sucesso nem toast de erro.
    expect(mockToast).not.toHaveBeenCalled();
    expect(callbacks.onResolveConversation).toBeUndefined();
  });

  it('CENARIO 12 — snooze sem subCommand → toast pedindo periodo e onSnooze NUNCA chamado', async () => {
    const { result, callbacks } = makeInputHandlers();

    await act(async () => {
      result.current.handleSlashCommand({ id: 'snooze' });
    });

    expect(callbacks.onSnooze).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Adiar Conversa',
        description: 'Escolha um periodo: 1h, 3h, tomorrow ou nextweek.',
      })
    );
  });

  it('CENARIO 13 — star com onStarToggle AUSENTE → sem crash, nenhum toast', async () => {
    const { result } = makeInputHandlers({ onStarToggle: undefined });

    await act(async () => {
      result.current.handleSlashCommand({ id: 'star' });
    });

    expect(mockToast).not.toHaveBeenCalled();
  });

  it('CENARIO 14 — tag com subCommand vazio ("") → toast pedindo nome e onAddTag NUNCA chamado', async () => {
    const { result, callbacks } = makeInputHandlers();

    await act(async () => {
      result.current.handleSlashCommand({ id: 'tag' }, '');
    });

    expect(callbacks.onAddTag).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Digite o nome da tag apos /tag.' })
    );
  });

  it('CENARIO 15 — note com subCommand vazio ("") → toast pedindo texto e onAddNote NUNCA chamado', async () => {
    const { result, callbacks } = makeInputHandlers();

    await act(async () => {
      result.current.handleSlashCommand({ id: 'note' }, '');
    });

    expect(callbacks.onAddNote).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Digite o texto da nota apos /note.' })
    );
  });

  it('CENARIO 16 — archive → toast informativo honesto e NENHUM callback chamado (mesmo com todos presentes)', async () => {
    const { result, callbacks } = makeInputHandlers();

    await act(async () => {
      result.current.handleSlashCommand({ id: 'archive' }, 'qualquer-coisa');
    });

    expect(callbacks.onResolveConversation).not.toHaveBeenCalled();
    expect(callbacks.onSnooze).not.toHaveBeenCalled();
    expect(callbacks.onStarToggle).not.toHaveBeenCalled();
    expect(callbacks.onRemind).not.toHaveBeenCalled();
    expect(callbacks.onAddNote).not.toHaveBeenCalled();
    expect(callbacks.onAddTag).not.toHaveBeenCalled();
    expect(callbacks.onTransferDialog).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Arquivar Conversa',
        description: 'Arquivo nao disponivel nesta versao.',
      })
    );
  });

  it('CENARIO 17 — priority → toast informativo honesto e NENHUM callback chamado', async () => {
    const { result, callbacks } = makeInputHandlers();

    await act(async () => {
      result.current.handleSlashCommand({ id: 'priority' }, 'high');
    });

    expect(callbacks.onResolveConversation).not.toHaveBeenCalled();
    expect(callbacks.onSnooze).not.toHaveBeenCalled();
    expect(callbacks.onStarToggle).not.toHaveBeenCalled();
    expect(callbacks.onRemind).not.toHaveBeenCalled();
    expect(callbacks.onAddNote).not.toHaveBeenCalled();
    expect(callbacks.onAddTag).not.toHaveBeenCalled();
    expect(callbacks.onTransferDialog).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Prioridade',
        description: 'Prioridade nao disponivel nesta versao.',
      })
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO 18-19 — ChatMessagesArea (realtime DELETE — BUG-25)
// ═════════════════════════════════════════════════════════════════════════════

function makeMessage(overrides: Partial<Message>): Message {
  return {
    id: 'm1',
    conversationId: 'conv-1',
    content: 'mensagem',
    type: 'text',
    sender: 'contact',
    timestamp: new Date(),
    status: 'sent',
    ...overrides,
  };
}

const baseProps = {
  isContactTyping: false,
  typingUserName: '',
  ttsLoading: false,
  ttsPlaying: false,
  ttsMessageId: null,
  onSpeak: vi.fn(),
  onStop: vi.fn(),
  onReply: vi.fn(),
  onForward: vi.fn(),
  onCopy: vi.fn(),
  onScrollToMessage: vi.fn(),
  onInteractiveButtonClick: vi.fn(),
  onLoadOlder: vi.fn(),
  loadingOlder: false,
  hasMoreOlder: false,
};

/** Retorna o callback registrado no .on('postgres_changes', {event:'DELETE'}) do canal. */
function getRealtimeDeleteHandler(): (payload: { old?: { id?: string } }) => void {
  const calls = channelMock.on.mock.calls as unknown as [
    string,
    { event?: string },
    (payload: { old?: { id?: string } }) => void,
  ][];
  const deleteCall = calls.find(([, config]) => config?.event === 'DELETE');
  expect(deleteCall, 'handler DELETE registrado no canal realtime').toBeDefined();
  return deleteCall![2];
}

describe('SIMULAÇÃO 18-19 — ChatMessagesArea realtime DELETE', () => {
  it('CENARIO 18 — DELETE com payload.old SEM id → queryClient.invalidateQueries NÃO chamado', () => {
    render(
      createElement(ChatMessagesArea, {
        ...baseProps,
        messages: [makeMessage({ id: 'm1' })],
        contactJid: '5511999887766@s.whatsapp.net',
      })
    );

    const handler = getRealtimeDeleteHandler();
    // payload.old sem id (REPLICA IDENTITY ausente na tabela) → sem invalidação.
    handler({ old: {} });

    expect(queryClientMock.invalidateQueries).not.toHaveBeenCalled();
  });

  it('CENARIO 19 — DELETE com payload.old COM id → invalidateQueries chamado', () => {
    render(
      createElement(ChatMessagesArea, {
        ...baseProps,
        messages: [makeMessage({ id: 'm1' })],
        contactJid: '5511999887766@s.whatsapp.net',
      })
    );

    const handler = getRealtimeDeleteHandler();
    handler({ old: { id: 'WAMID.123' } });

    expect(queryClientMock.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClientMock.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['messages'],
    });
  });
});
