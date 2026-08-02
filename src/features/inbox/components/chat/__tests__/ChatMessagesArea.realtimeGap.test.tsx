/**
 * REGRESSÃO — GAP: subscription Realtime redundante em ChatMessagesArea
 *
 * Problema original: ChatMessagesArea criava um channel Supabase via `supabase.channel()`
 * para escutar UPDATE/DELETE em evolution_messages e chamar queryClient.invalidateQueries.
 * Isso era duplamente inútil:
 *   1. O cliente interno `supabase` != `externalSupabase` usado pelo useMessagesCursor
 *      (modo FATOR X usa cliente externo) — so mensagens do banco interno seriam afetadas.
 *   2. `queryClient.invalidateQueries(['messages'])` nao afeta o `useState` local em
 *      useMessagesCursor — as mensagens na tela nao eram atualizadas de forma alguma.
 *
 * Esta suite garante que o componente NAO chama `supabase.channel()` ao montar,
 * protegendo contra regressao acidental onde a subscription seja reintroduzida.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ChatMessagesArea } from '../ChatMessagesArea';
import type { Message } from '@/types/chat';

// ── Estado compartilhado (padrão do repo: vi.hoisted para refs de mocks) ──────
const { channelSpy, queryClientMock, scrollToIndexSpy } = vi.hoisted(() => {
  const scrollToIndexSpy = vi.fn();
  const channelSpy = vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  }));
  return {
    channelSpy,
    queryClientMock: { invalidateQueries: vi.fn() },
    scrollToIndexSpy,
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
    scrollToIndex: scrollToIndexSpy,
  }),
}));

vi.mock('@/components/ui/motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: () => null,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
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

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    content: 'ola',
    type: 'text',
    sender: 'contact',
    timestamp: new Date(),
    status: 'delivered',
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

describe('REGRESSAO — subscription Realtime removida de ChatMessagesArea', () => {
  beforeEach(() => {
    channelSpy.mockClear();
    queryClientMock.invalidateQueries.mockClear();
  });

  it('NAO cria canal Supabase ao montar com mensagens (foi removido — nao regredir)', () => {
    render(
      <ChatMessagesArea
        {...baseProps}
        messages={[makeMsg()]}
        contactJid="5511999999999@s.whatsapp.net"
        instanceName="wpp2"
      />
    );
    // A subscription redundante foi removida. Se alguem reintroduzir
    // supabase.channel() no ChatMessagesArea, este teste falha imediatamente.
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it('NAO cria canal Supabase ao montar com lista vazia', () => {
    render(
      <ChatMessagesArea
        {...baseProps}
        messages={[]}
        contactJid="5511999999999@s.whatsapp.net"
        instanceName="wpp2"
      />
    );
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it('NAO cria canal mesmo com conversationId e contactJid presentes', () => {
    const msgs = [makeMsg({ id: 'a', conversationId: 'conv-abc' })];
    render(
      <ChatMessagesArea
        {...baseProps}
        messages={msgs}
        contactJid="grupo@g.us"
        instanceName="wpp2"
        contactId="5511999999999"
      />
    );
    expect(channelSpy).not.toHaveBeenCalled();
  });

  it('queryClient.invalidateQueries nao eh chamado passivamente durante montagem', () => {
    render(
      <ChatMessagesArea
        {...baseProps}
        messages={[makeMsg(), makeMsg({ id: 'msg-2' })]}
        contactJid="jid@s.whatsapp.net"
        instanceName="wpp2"
      />
    );
    // Nenhuma invalidacao passiva — so handleMessageDeleted (callback do MessageBubble)
    // pode chamar invalidateQueries, e esse nao e invocado sem acao do usuario.
    expect(queryClientMock.invalidateQueries).not.toHaveBeenCalled();
  });
});
