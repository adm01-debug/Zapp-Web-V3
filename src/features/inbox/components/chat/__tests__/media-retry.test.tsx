/**
 * A4 — RETRY DE MÍDIA (avatar): MessageBubble + ChatHeader
 *
 * GAP confirmado: onError inline (MessageBubble.tsx:180 / ChatHeader.tsx:119)
 * só removia o `src` — e com radix-avatar 1.2.x o `<img>` só é renderizado
 * DEPOIS de um preload via `new window.Image()` dar `loaded`, então o onError
 * inline nunca disparava (código morto). A correção usa a máquina de estados
 * idle → backoff → retrying → failed disparada por onLoadingStatusChange.
 *
 * Este arquivo renderiza os componentes REAIS (mockando apenas deps pesadas,
 * mesma convenção dos testes vizinhos) e simula o preload do navegador com um
 * FakeImage global: URLs contendo 'broken' falham, as demais carregam.
 *
 * Cobertura exigida:
 *  (a) URL quebrada permanente → 1 retry após ~800ms e FIM (sem loop);
 *  (b) re-render com a mesma URL não re-dispara retry (memória por URL);
 *  (c) CORS/offline (erro de exibição no <img> renderizado) → mesmo caminho;
 *  (d) troca de URL (mensagem/conversa) limpa o estado de retry;
 *  (e) fallback de iniciais preservado como estado final;
 *  (f) double-mount (StrictMode) não duplica retry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import { ChatHeader } from '../ChatHeader';
import type { Message, Conversation } from '@/types/chat';

const BROKEN_URL = 'https://cdn.example.com/broken/avatar.jpg';
const OK_URL = 'https://cdn.example.com/ok/avatar.jpg';
const OK_URL_2 = 'https://cdn.example.com/ok/avatar-2.jpg';

// URL "atual" do avatar — mutável para simular troca de conversa.
// (vi.hoisted roda antes das consts — URL literal aqui.)
const avatarState = vi.hoisted(() => ({ url: 'https://cdn.example.com/broken/avatar.jpg' }));

// ── Mocks de módulos externos/pesados (convenção dos testes vizinhos) ────────
vi.mock('@/features/inbox', () => ({
  useContactAvatar: () => ({ avatarUrl: avatarState.url, loading: false }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/logger', () => {
  const noopLogger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
  return {
    getLogger: noopLogger,
    createLogger: noopLogger,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logPerformance: vi.fn(),
    logAsyncPerformance: vi.fn(),
    generateRequestTag: vi.fn(() => 'req-test'),
    generateCorrelationId: vi.fn(() => 'req-test'),
    getSessionId: vi.fn(() => 'session-test'),
  };
});

vi.mock('@/components/ui/motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/mobile/SwipeableMessage', () => ({
  SwipeableMessage: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/context-menu', () => ({
  ContextMenu: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ContextMenuTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  ContextMenuContent: () => null,
  ContextMenuItem: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}));

vi.mock('@/features/inbox/components/MessageReactions', () => ({
  MessageReactions: () => null,
  QuickReactionBar: () => null,
}));

vi.mock('@/features/inbox/components/chat/MessageHoverToolbar', () => ({
  MessageHoverToolbar: () => null,
}));

vi.mock('@/features/inbox/components/chat/messageBubbleParts', () => ({
  MessageBubbleBody: () => null,
  WhisperBadge: () => null,
}));

vi.mock('@/features/inbox/components/DeletedMessagePlaceholder', () => ({
  DeletedMessagePlaceholder: () => null,
}));

vi.mock('@/features/inbox/components/chat/ChatHeaderMenu', () => ({
  ChatHeaderMenu: () => null,
}));

vi.mock('@/features/inbox/components/ai-tools/VisionIcon', () => ({
  VisionIcon: () => null,
}));

vi.mock('@/features/inbox/components/VoiceSelector', () => ({
  VoiceSelector: () => null,
}));

vi.mock('@/features/inbox/components/RealtimeCollaboration', () => ({
  RealtimeCollaboration: () => null,
}));

vi.mock('@/features/inbox/components/SLAIndicatorForContact', () => ({
  SLAIndicatorForContact: () => null,
}));

vi.mock('@/features/inbox/components/KeyboardShortcutsHelp', () => ({
  KeyboardShortcutsHelp: () => null,
}));

vi.mock('@/hooks/useContactIntelligence', () => ({
  useContactIntelligence: () => ({ intelligence: null }),
}));

vi.mock('@/hooks/useDensity', () => ({
  useDensity: () => ({ density: 'comfortable', cycleDensity: vi.fn() }),
}));

// ── FakeImage: simula o preload do navegador usado pelo radix-avatar ─────────
// 'broken' na URL → dispara 'error' síncrono; caso contrário dispara 'load'.
class FakeImage {
  static instances = 0;
  complete = false;
  naturalWidth = 0;
  referrerPolicy = '';
  crossOrigin: string | null = null;
  private _src = '';
  private handlers: Record<string, Array<(e: unknown) => void>> = {};

  constructor() {
    FakeImage.instances += 1;
  }

  addEventListener(type: string, cb: (e: unknown) => void) {
    (this.handlers[type] ??= []).push(cb);
  }

  removeEventListener(type: string, cb: (e: unknown) => void) {
    this.handlers[type] = (this.handlers[type] ?? []).filter((h) => h !== cb);
  }

  get src() {
    return this._src;
  }

  set src(v: string) {
    this._src = v;
    if (!v) return;
    if (v.includes('broken')) {
      this.complete = true;
      this.naturalWidth = 0;
      this.dispatch('error');
    } else {
      this.complete = true;
      this.naturalWidth = 120;
      this.dispatch('load');
    }
  }

  private dispatch(type: string) {
    const ev = { currentTarget: this, type } as unknown as Event;
    for (const h of [...(this.handlers[type] ?? [])]) h(ev);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
const message: Message = {
  id: 'msg-1',
  conversationId: 'conv-1',
  content: 'Olá',
  type: 'text',
  sender: 'contact',
  timestamp: new Date('2026-08-18T12:00:00Z'),
  status: 'delivered',
  senderName: 'João Silva',
  external_id: 'ext-1',
  message_type: 'text',
};

function renderBubble(overrides?: Partial<Parameters<typeof MessageBubble>[0]>) {
  return render(
    <MessageBubble
      message={message}
      isFirstInGroup
      isLastInGroup
      instanceName="inst-1"
      contactJid="5511999999999@s.whatsapp.net"
      ttsLoading={false}
      ttsPlaying={false}
      ttsMessageId={null}
      onSpeak={vi.fn()}
      onStop={vi.fn()}
      onReply={vi.fn()}
      onForward={vi.fn()}
      onCopy={vi.fn()}
      onScrollToMessage={vi.fn()}
      onInteractiveButtonClick={vi.fn()}
      onEditStart={vi.fn()}
      onMessageDeleted={vi.fn()}
      registerRef={() => {}}
      density="comfortable"
      {...overrides}
    />
  );
}

const conversation: Conversation = {
  id: 'conv-1',
  contact: {
    id: 'contact-1',
    name: 'João Silva',
    phone: '5511999999999',
    remote_jid: '5511999999999@s.whatsapp.net',
    avatar: BROKEN_URL,
    tags: [],
    createdAt: new Date('2026-08-18T12:00:00Z'),
  },
  unreadCount: 0,
  status: 'open',
  priority: 'medium',
  tags: [],
  createdAt: new Date('2026-08-18T12:00:00Z'),
  updatedAt: new Date('2026-08-18T12:00:00Z'),
};

function renderHeader(conv: Conversation = conversation) {
  return render(
    <ChatHeader
      conversation={conv}
      messages={[]}
      isContactTyping={false}
      showAIAssistant={false}
      showDetails={false}
      voiceId="default"
      onToggleAIAssistant={vi.fn()}
      onToggleDetails={vi.fn()}
      onStartCall={vi.fn()}
      onOpenSearch={vi.fn()}
      onOpenTransfer={vi.fn()}
      onOpenSchedule={vi.fn()}
      onVoiceChange={vi.fn()}
    />
  );
}

beforeEach(() => {
  FakeImage.instances = 0;
  avatarState.url = BROKEN_URL;
  vi.useFakeTimers();
  vi.stubGlobal('Image', FakeImage);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Testes ────────────────────────────────────────────────────────────────────
describe('A4 — retry de avatar: MessageBubble', () => {
  it('(a/c) URL quebrada/CORS: 1 retry após ~800ms e placeholder no 2º erro — sem loop', () => {
    renderBubble();

    // Preload falha no mount → backoff: sem <img>, fallback de iniciais no DOM.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Jo')).toBeInTheDocument();

    // Retry dispara após ~800ms → novo preload → falha de novo → placeholder.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Jo')).toBeInTheDocument();

    // FIM: nenhum timer pendente → nada muda mesmo avançando muito.
    const instancesAfterCycle = FakeImage.instances;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('img')).toBeNull();
    expect(FakeImage.instances).toBe(instancesAfterCycle); // sem loop
  });

  it('(b) re-render com a mesma URL não re-dispara retry (memória por URL)', () => {
    const view = renderBubble();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    // 2º erro → failed (sem <img>).
    expect(screen.queryByRole('img')).toBeNull();
    const instancesAfterFail = FakeImage.instances;

    // Re-render com props diferentes (mesma URL) → estado persiste.
    view.rerender(
      <MessageBubble
        message={message}
        isFirstInGroup
        isLastInGroup
        instanceName="inst-1"
        contactJid="5511999999999@s.whatsapp.net"
        ttsLoading={false}
        ttsPlaying
        ttsMessageId={null}
        onSpeak={vi.fn()}
        onStop={vi.fn()}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onCopy={vi.fn()}
        onScrollToMessage={vi.fn()}
        onInteractiveButtonClick={vi.fn()}
        onEditStart={vi.fn()}
        onMessageDeleted={vi.fn()}
        registerRef={() => {}}
        density="comfortable"
      />
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('img')).toBeNull();
    expect(FakeImage.instances).toBe(instancesAfterFail); // nenhum retry novo
  });

  it('(d) troca de URL (mensagem/conversa nova) limpa o estado e re-tenta', () => {
    const view = renderBubble();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByRole('img')).toBeNull(); // failed

    // Conversa troca → URL nova (ok) → estado resetado → <img> carrega.
    avatarState.url = OK_URL;
    view.rerender(
      <MessageBubble
        message={{ ...message, id: 'msg-2' }}
        isFirstInGroup
        isLastInGroup
        instanceName="inst-1"
        contactJid="outro@s.whatsapp.net"
        ttsLoading={false}
        ttsPlaying={false}
        ttsMessageId={null}
        onSpeak={vi.fn()}
        onStop={vi.fn()}
        onReply={vi.fn()}
        onForward={vi.fn()}
        onCopy={vi.fn()}
        onScrollToMessage={vi.fn()}
        onInteractiveButtonClick={vi.fn()}
        onEditStart={vi.fn()}
        onMessageDeleted={vi.fn()}
        registerRef={() => {}}
        density="comfortable"
      />
    );
    const fresh = screen.getByRole('img');
    expect(fresh.getAttribute('src')).toBe(OK_URL);

    // Erro na URL nova passa pelo mesmo caminho: 1 retry → placeholder.
    fireEvent.error(fresh);
    expect(screen.queryByRole('img')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    const retried = screen.getByRole('img');
    expect(retried.getAttribute('src')).toBe(OK_URL);
    fireEvent.error(retried);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Jo')).toBeInTheDocument();
  });

  it('(c) erro de exibição no <img> renderizado (CORS/offline) segue o mesmo caminho', () => {
    avatarState.url = OK_URL;
    renderBubble();

    // Preload ok → <img> renderizado com src.
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe(OK_URL);

    // Falha de exibição (CORS/offline) → backoff → 1 retry → 2º erro → failed.
    fireEvent.error(img);
    expect(screen.queryByRole('img')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    const retried = screen.getByRole('img');
    expect(retried.getAttribute('src')).toBe(OK_URL);
    fireEvent.error(retried);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Jo')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('img')).toBeNull(); // sem loop
  });

  it('(f) StrictMode double-mount não duplica retry', () => {
    render(
      <StrictMode>
        <MessageBubble
          message={message}
          isFirstInGroup
          isLastInGroup
          instanceName="inst-1"
          contactJid="5511999999999@s.whatsapp.net"
          ttsLoading={false}
          ttsPlaying={false}
          ttsMessageId={null}
          onSpeak={vi.fn()}
          onStop={vi.fn()}
          onReply={vi.fn()}
          onForward={vi.fn()}
          onCopy={vi.fn()}
          onScrollToMessage={vi.fn()}
          onInteractiveButtonClick={vi.fn()}
          onEditStart={vi.fn()}
          onMessageDeleted={vi.fn()}
          registerRef={() => {}}
          density="comfortable"
        />
      </StrictMode>
    );

    // Double-mount: cada mount sob StrictMode roda os efeitos 2x → 2 preloads
    // no mount + 2 no remount do retry = 4 instâncias. O que NÃO pode haver:
    // timer duplicado (viriam 6+) ou loop (contagem seguiria crescendo).
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(FakeImage.instances).toBe(4); // exatamente 1 retry
    expect(screen.queryByRole('img')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(FakeImage.instances).toBe(4); // sem retry duplicado nem loop
  });
});

describe('A4 — retry de avatar: ChatHeader', () => {
  it('(a/e) 1 retry após ~800ms; fallback de iniciais preservado como estado final', () => {
    renderHeader();

    // Preload falha → backoff → fallback de iniciais ("JS") visível.
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('JS')).toBeInTheDocument();

    // Retry → nova falha → placeholder final (iniciais), sem loop.
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('JS')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('(d) troca de conversa limpa o estado de retry', () => {
    const view = renderHeader();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByRole('img')).toBeNull(); // failed

    // Nova conversa → URL nova (ok) → estado resetado → <img> carrega.
    avatarState.url = OK_URL_2;
    const conv2: Conversation = {
      ...conversation,
      id: 'conv-2',
      contact: {
        ...conversation.contact,
        id: 'contact-2',
        remote_jid: 'outro@s.whatsapp.net',
        avatar: OK_URL_2,
      },
    };
    view.rerender(
      <ChatHeader
        conversation={conv2}
        messages={[]}
        isContactTyping={false}
        showAIAssistant={false}
        showDetails={false}
        voiceId="default"
        onToggleAIAssistant={vi.fn()}
        onToggleDetails={vi.fn()}
        onStartCall={vi.fn()}
        onOpenSearch={vi.fn()}
        onOpenTransfer={vi.fn()}
        onOpenSchedule={vi.fn()}
        onVoiceChange={vi.fn()}
      />
    );
    const fresh = screen.getByRole('img');
    expect(fresh.getAttribute('src')).toBe(OK_URL_2);
  });
});
