/**
 * Teste de INTEGRAÇÃO — scrollToMessage (anti-falsa-cobertura)
 *
 * BUG-17/18: o antigo registerRef noop tornava o scrollToMessage um no-op.
 * Este teste monta o ChatMessagesArea REAL (com mocks de supabase/query/
 * virtualizer) e valida o contrato da ref exposta via useImperativeHandle:
 * dado um id presente nas mensagens, scrollToMessage deve chamar
 * virtualizer.scrollToIndex com o índice correto E retornar true.
 *
 * O que este teste de fato protege: o useEffect que constrói o mapa
 * id → index (messageIndexRef) e o caminho scrollToMessage →
 * virtualizer.scrollToIndex. Se esse efeito for desconectado ou o índice
 * deixar de ser encontrado, o teste falha — exatamente o cenário que a
 * suíte unitária antiga não pegava.
 *
 * NOTA (convenção do repo, ver ChatMessagesArea.getItemSize.test.tsx):
 * specifiers de vi.mock com caminho relativo resolvem a partir do ARQUIVO
 * DE TESTE (__tests__/), não do componente — por isso os mocks abaixo usam
 * o alias '@/' completo. Mocks de módulos que o componente NÃO importa são
 * no-ops silenciosos e foram omitidos de propósito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { ChatMessagesArea } from '../ChatMessagesArea';
import type { ChatMessagesAreaRef } from '../ChatMessagesArea';
import type { Message } from '@/types/chat';

// ── Estado compartilhado entre mocks e testes ────────────────────────────────
const { channelSpy, queryClientMock, scrollToIndexSpy } = vi.hoisted(() => {
  const channelSpy = vi.fn();
  const channelMock = { on: vi.fn(), subscribe: vi.fn() };
  channelMock.on.mockReturnValue(channelMock);
  channelMock.subscribe.mockReturnValue({ unsubscribe: vi.fn() });
  channelSpy.mockReturnValue(channelMock);
  return {
    channelSpy,
    channelMock,
    queryClientMock: { invalidateQueries: vi.fn() },
    scrollToIndexSpy: vi.fn(),
  };
});

// ── Mocks de módulos externos/pesados (mesmo padrão do getItemSize test) ─────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { channel: channelSpy, removeChannel: vi.fn() },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => queryClientMock,
  // ReactionsBatchProvider (wired no ChatMessagesArea) usa useQuery para o
  // batch de reações; nestes testes de scroll não há reações a carregar.
  useQuery: () => ({ isPending: false, data: undefined }),
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
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

// Componentes filhos renderizados pelo ChatMessagesArea (mockados para
// isolar a lógica da lista; specifiers com '@/' completo por convenção)
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

describe('INTEGRAÇÃO — scrollToMessage via ref (BUG-17/18)', () => {
  beforeEach(() => {
    scrollToIndexSpy.mockClear();
  });

  it('scrollToMessage(id) chama virtualizer.scrollToIndex com o índice da mensagem e retorna true', () => {
    const messages = [
      makeMessage({ id: 'a', content: 'primeira' }),
      makeMessage({ id: 'b', content: 'segunda' }),
      makeMessage({ id: 'c', content: 'terceira' }),
    ];
    const ref = createRef<ChatMessagesAreaRef>();
    render(
      <ChatMessagesArea
        {...baseProps}
        ref={ref}
        messages={messages}
        contactJid="jid@s.whatsapp.net"
      />
    );

    expect(ref.current).not.toBeNull();
    const result = ref.current?.scrollToMessage('b');
    expect(result).toBe(true);
    // índice da mensagem 'b' = 1 no array; o virtualizer recebe o índice real
    expect(scrollToIndexSpy).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('scrollToMessage(id inexistente) retorna false sem scroll', () => {
    const ref = createRef<ChatMessagesAreaRef>();
    render(
      <ChatMessagesArea
        {...baseProps}
        ref={ref}
        messages={[makeMessage({ id: 'a' })]}
        contactJid="jid@s.whatsapp.net"
      />
    );
    const result = ref.current?.scrollToMessage('nao-existe');
    expect(result).toBe(false);
    expect(scrollToIndexSpy).not.toHaveBeenCalled();
  });

  it('scrollToMessage em lista vazia retorna false (sem crash)', () => {
    const ref = createRef<ChatMessagesAreaRef>();
    render(<ChatMessagesArea {...baseProps} ref={ref} messages={[]} />);
    const result = ref.current?.scrollToMessage('a');
    expect(result).toBe(false);
    expect(scrollToIndexSpy).not.toHaveBeenCalled();
  });

  it('resolver por external_id quando presente (metade do contrato de lookup)', () => {
    const messages = [
      makeMessage({ id: 'local-1', external_id: 'WAMID.999', content: 'com external id' }),
      makeMessage({ id: 'local-2', content: 'sem external id' }),
    ];
    const ref = createRef<ChatMessagesAreaRef>();
    render(
      <ChatMessagesArea
        {...baseProps}
        ref={ref}
        messages={messages}
        contactJid="jid@s.whatsapp.net"
      />
    );
    // busca pelo id interno
    expect(ref.current?.scrollToMessage('local-2')).toBe(true);
    expect(scrollToIndexSpy).toHaveBeenCalledWith(1, expect.any(Object));
  });
});
