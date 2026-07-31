/**
 * Testes de ChatMessagesArea:
 *  - BUG-25: o canal de realtime registra listener de DELETE — mensagens
 *    apagadas no banco (Evolution) somem da UI via invalidação de query.
 *  - BUG-21: getItemSize (estimateSize do virtualizer) soma incrementos de
 *    altura para replyTo, reactions e interactive.buttons.
 *
 * getItemSize não é exportado (useCallback interno). Para testar a LÓGICA
 * real sem refatorar exports do componente, renderizamos ChatMessagesArea com
 * useVirtualizer mockado que captura o callback estimateSize passado pelo
 * componente, e com o supabase mockado que expõe o canal de realtime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ChatMessagesArea } from '../ChatMessagesArea';
import type { Message } from '@/types/chat';

// ── Estado compartilhado entre mocks e testes ────────────────────────────────
const { channelSpy, channelMock, queryClientMock, estimateSizeRef } = vi.hoisted(() => {
  const channelSpy = vi.fn();
  const channelMock = { on: vi.fn(), subscribe: vi.fn() };
  channelMock.on.mockReturnValue(channelMock);
  channelMock.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
  channelSpy.mockReturnValue(channelMock);
  return {
    channelSpy,
    channelMock,
    queryClientMock: { invalidateQueries: vi.fn() },
    estimateSizeRef: { current: undefined as ((index: number) => number) | undefined },
  };
});

// ── Mocks de módulos externos/pesados ────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: channelSpy, removeChannel: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { estimateSize?: (index: number) => number }) => {
    if (opts.estimateSize) estimateSizeRef.current = opts.estimateSize;
    return {
      getTotalSize: () => 0,
      getVirtualItems: () => [],
      measureElement: () => {},
      scrollToIndex: () => {},
    };
  },
}));

vi.mock('@/components/ui/motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: () => null,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  // externalClient (shim) chama createLogger no top-level — precisa existir
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// ATENÇÃO: specifiers de mock com caminho relativo resolvem a partir do
// ARQUIVO DE TESTE (__tests__/), não do componente. Por isso usamos o alias
// '@/' completo — './MessageBubble' a partir de __tests__/ apontaria para um
// arquivo inexistente e o mock NUNCA interceptaria o módulo real.
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

// ── Helpers ──────────────────────────────────────────────────────────────────
const CONTACT_JID = '5511999999999@s.whatsapp.net';

let seq = 0;
function makeMessage(overrides: Partial<Message> = {}): Message {
  seq += 1;
  return {
    id: `msg-${seq}`,
    conversationId: 'conv-1',
    content: '',
    type: 'text',
    sender: 'contact',
    timestamp: new Date('2026-07-31T10:00:00Z'),
    status: 'read',
    ...overrides,
  };
}

const REPLY = { messageId: 'msg-0', content: 'citado', sender: 'agent' as const };
const REACTION = [{ emoji: '👍', userId: 'u1', timestamp: new Date('2026-07-31T10:00:00Z') }];
const BUTTONS = [
  { type: 'reply' as const, id: 'b1', title: 'Sim' },
  { type: 'reply' as const, id: 'b2', title: 'Não' },
];

function renderArea(messages: Message[]) {
  return render(
    <ChatMessagesArea
      messages={messages}
      isContactTyping={false}
      typingUserName=""
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      contactJid={CONTACT_JID}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onScrollToMessage={vi.fn()}
      onInteractiveButtonClick={vi.fn()}
    />
  );
}

function getDeleteCallback(): (payload: { old: unknown }) => void {
  const deleteCall = channelMock.on.mock.calls.find((call) => call[1]?.event === 'DELETE');
  expect(deleteCall).toBeDefined();
  return deleteCall![2] as (payload: { old: unknown }) => void;
}

// ── BUG-25: realtime DELETE ──────────────────────────────────────────────────
describe('ChatMessagesArea realtime (BUG-25)', () => {
  beforeEach(() => {
    channelSpy.mockClear();
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
    queryClientMock.invalidateQueries.mockClear();
    estimateSizeRef.current = undefined;
  });

  it('registra listeners UPDATE e DELETE no mesmo canal', () => {
    renderArea([makeMessage()]);

    expect(channelSpy).toHaveBeenCalledWith(`chat-updates:${CONTACT_JID}`);
    const configs = channelMock.on.mock.calls.map((call) => call[1]);
    expect(configs).toHaveLength(2);
    expect(configs[0]).toMatchObject({
      event: 'UPDATE',
      schema: 'evo',
      table: 'evolution_messages',
    });
    expect(configs[1]).toMatchObject({
      event: 'DELETE',
      schema: 'evo',
      table: 'evolution_messages',
    });
    expect(configs[1].filter).toContain(CONTACT_JID);
  });

  it('invalida a query de mensagens quando o DELETE traz old.id', () => {
    renderArea([makeMessage()]);

    getDeleteCallback()({ old: { id: 'msg-1' } });

    expect(queryClientMock.invalidateQueries).toHaveBeenCalledTimes(1);
    expect(queryClientMock.invalidateQueries).toHaveBeenCalledWith({
      queryKey: expect.any(Array),
    });
  });

  it('não invalida quando o DELETE não traz old.id', () => {
    renderArea([makeMessage()]);

    getDeleteCallback()({ old: null });

    expect(queryClientMock.invalidateQueries).not.toHaveBeenCalled();
  });
});

// ── BUG-21: getItemSize com incrementos ──────────────────────────────────────
describe('ChatMessagesArea getItemSize (BUG-21)', () => {
  beforeEach(() => {
    estimateSizeRef.current = undefined;
  });

  it('soma incrementos de replyTo/reactions/interactive à altura base', () => {
    const messages = [
      makeMessage({ content: 'Oi' }), // 0: texto curto → 92
      makeMessage({ content: 'Oi', replyTo: REPLY }), // 1: +56 → 148
      makeMessage({ content: 'Oi', reactions: REACTION }), // 2: +24 → 116
      makeMessage({ content: 'Oi', replyTo: REPLY, reactions: REACTION }), // 3: +56+24 → 172
      makeMessage({
        type: 'interactive',
        content: '',
        interactive: { type: 'buttons', body: 'Escolha', buttons: BUTTONS },
      }), // 4: base 80 + 2 botões*40 → 160
      makeMessage({ type: 'image', mediaUrl: 'x' }), // 5: 300
      makeMessage({ type: 'image', mediaUrl: 'x', replyTo: REPLY }), // 6: 356
      makeMessage({ type: 'video', mediaUrl: 'x', reactions: REACTION }), // 7: 324
      makeMessage({ type: 'audio', mediaUrl: 'x' }), // 8: 120
      makeMessage({ type: 'document', mediaUrl: 'x' }), // 9: 100
      makeMessage({ content: 'x'.repeat(120) }), // 10: 2 linhas → 114
    ];

    renderArea(messages);

    const estimateSize = estimateSizeRef.current;
    expect(estimateSize).toBeDefined();
    expect(estimateSize!(0)).toBe(92);
    expect(estimateSize!(1)).toBe(148);
    expect(estimateSize!(2)).toBe(116);
    expect(estimateSize!(3)).toBe(172);
    expect(estimateSize!(4)).toBe(160);
    expect(estimateSize!(5)).toBe(300);
    expect(estimateSize!(6)).toBe(356);
    expect(estimateSize!(7)).toBe(324);
    expect(estimateSize!(8)).toBe(120);
    expect(estimateSize!(9)).toBe(100);
    expect(estimateSize!(10)).toBe(114);
    expect(estimateSize!(11)).toBe(80); // índice fora do range
  });
});
