/**
 * E32 — useRealtimeInbox (orquestrador primário do inbox, 513 ln) — TDD.
 *
 * Contrato coberto (plano: PLANO-100-ETAPAS-ZAPP-20260816.md, Etapa 32):
 *  1. boot da cadeia de canais (canal whisper: schema zapp, tabela
 *     whisper_messages, filtro contact_id=eq.<uuid>, tópico DETERMINÍSTICO);
 *  2. atualização incremental ao receber mensagem nova (evento postgres_changes
 *     → invalidateQueries da query batch; lista do source propagada sem re-sort);
 *  3. concatenação/ordenação de conversas (ordem do source preservada; offline
 *     cache exposto separadamente via cachedConversations/usingCache);
 *  4. filtros pass-through (não lidas/busca/ordenação): search, statusFilter,
 *     sortBy e setters delegam ao source;
 *  5. reconcile de entregas com RECONCILED_MAX_ENTRIES=1000 + dedupe de
 *     eventos duplicados (external_id; bot por content);
 *  6. erro de canal (CHANNEL_ERROR/TIMED_OUT) → logChannelError e a lista
 *     NÃO quebra;
 *  7. limpeza de canais no unmount (unsubscribe + removeChannel, sem vazamento);
 *  8. vazamento de tópico aleatório (padrão A8 findings-08:675): montar/
 *     desmontar 3× → tópico estável/determinístico `inbox-realtime:{userId}:whisper:{uuid}`
 *     e removido no cleanup. RED hoje (Math.random no tópico) → GREEN após fix.
 *
 * Estado RED esperado (pré-fix): testes que assertam o tópico determinístico
 * falham com o tópico atual `whisper-count-{id}:{random}`. Após o fix (tópico
 * determinístico derivado de profile.id + ref.uuid), todos verdes.
 *
 * Estratégia de mocks: sub-hooks (useRealtimeMessages/useMessages por baixo do
 * useInboxSource REAL; heartbeat, deep links, fallback, batch, queue, offline
 * cache, auth) mockados; supabase.client com fake realtime (semântica
 * supabase-js: cache por topic, .on() após subscribe lança, removeChannel limpa
 * o cache). Mappers legacy mockados (contrato próprio, fora do escopo).
 *
 * E36 (dual-path zapp×evo): o teste fixa `VITE_INBOX_SOURCE_MODE=zapp`
 * (beforeEach) para exercitar o ORQUESTRADOR sobre o path legado — que é o
 * leaf mockado aqui (useMessages). Sem o pin, o default 'auto' resolve
 * evo→useMessagesCursor REAL: criaria canal `evolution_messages:{jid}:{random}`
 * (quebra os asserts de canal) e selecionaria mensagens via rpc_list_messages_lite
 * (vazio no fake → reconcile/legacyMessages quebram). O path evo é contrato
 * coberto por useInboxSource.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRealtimeInbox } from '@/features/inbox/hooks/useRealtimeInbox';
import type {
  ConversationContact,
  ConversationWithMessages,
  RealtimeMessage,
} from '@/features/inbox/hooks/useRealtimeMessages';

// ── Constantes do contrato ────────────────────────────────────────────────────
const PROFILE_ID = 'p1';
const CONTACT_UUID = '11111111-1111-4111-8111-111111111111';
const SECOND_UUID = '22222222-2222-4222-8222-222222222222';
const JID = '5511999999999';
const WHISPER_TOPIC = `inbox-realtime:${PROFILE_ID}:whisper:${CONTACT_UUID}`;
const BATCH_KEY = ['contact-summary-batch', CONTACT_UUID, SECOND_UUID];

// ── Fake RealtimeClient (semântica supabase-js: cache por topic; .on() após
//    subscribe lança; removeChannel limpa o cache) ────────────────────────────
interface FakeChannel {
  topic: string;
  subscribed: boolean;
  onCalls: Array<{ event: string; filter: unknown; callback?: () => void }>;
  subscribeCb?: (status: string) => void;
  on: (event: string, filter: unknown, callback?: () => void) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  unsubscribe: () => FakeChannel;
}

const fakeSupabase = vi.hoisted(() => {
  const channelsByTopic = new Map<string, FakeChannel>();
  const createdChannels: FakeChannel[] = [];
  const channel = vi.fn((topic: string): FakeChannel => {
    const cached = channelsByTopic.get(topic);
    if (cached) return cached;
    const instance: FakeChannel = {
      topic,
      subscribed: false,
      onCalls: [],
      on: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };
    instance.on = vi.fn((event: string, filter: unknown, callback?: () => void) => {
      if (instance.subscribed) {
        throw new Error('cannot add postgres_changes callbacks after subscribe()');
      }
      instance.onCalls.push({ event, filter, callback });
      return instance;
    });
    instance.subscribe = vi.fn((cb?: (status: string) => void) => {
      instance.subscribed = true;
      instance.subscribeCb = cb;
      return instance;
    });
    instance.unsubscribe = vi.fn(() => {
      instance.subscribed = false;
      return instance;
    });
    channelsByTopic.set(topic, instance);
    createdChannels.push(instance);
    return instance;
  });
  const removeChannel = vi.fn((target: FakeChannel) => {
    for (const [topic, instance] of channelsByTopic) {
      if (instance === target) channelsByTopic.delete(topic);
    }
  });
  return {
    channel,
    removeChannel,
    channelsByTopic,
    createdChannels,
    from: vi.fn(),
    reset() {
      channelsByTopic.clear();
      createdChannels.length = 0;
    },
  };
});

// ── Estado e funções dos mocks (lidos pelas factories a cada render) ─────────
const h = vi.hoisted(() => {
  const state = {
    profile: { id: 'p1' } as unknown,
    convos: [] as unknown[],
    loading: false,
    error: null as string | null,
    search: '',
    statusFilter: 'all' as string,
    sortBy: 'lastMessage' as string,
    msgs: [] as unknown[],
    summary: null as unknown,
    cacheOn: false,
    cachedConvos: [] as unknown[],
    isOnline: true,
    notification: null as unknown,
  };
  const fns = {
    refetch: vi.fn(),
    setSearch: vi.fn(),
    setStatusFilter: vi.fn(),
    setSortBy: vi.fn(),
    sendMessage: vi.fn(),
    markAsRead: vi.fn(),
    markManyAsRead: vi.fn(),
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
    loadMoreConversations: vi.fn(),
    refetchMsgs: vi.fn(),
    addToQueue: vi.fn(),
    reconcileWithDelivery: vi.fn(),
    seedAvatarCache: vi.fn(),
    logChannelError: vi.fn(),
    toastError: vi.fn(),
    validatePttBlob: vi.fn(
      async (): Promise<{ ok: boolean; message?: string }> => ({ ok: true })
    ),
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  return { state, fns };
});

// ── Mocks de módulo ───────────────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: fakeSupabase.channel,
    removeChannel: fakeSupabase.removeChannel,
    from: fakeSupabase.from,
  },
}));
vi.mock('@/integrations/supabase/channelErrorLogging', () => ({
  logChannelError: h.fns.logChannelError,
}));
vi.mock('@/lib/logger', () => ({ getLogger: () => h.fns.logger }));
vi.mock('@/lib/audio/pttLimits', () => ({ validatePttBlob: h.fns.validatePttBlob }));
vi.mock('sonner', () => ({ toast: { error: h.fns.toastError } }));
vi.mock('@/integrations/datasource/db', () => ({ dbFrom: vi.fn() }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ profile: h.state.profile }) }));
vi.mock('@/features/inbox', () => ({ seedAvatarCache: h.fns.seedAvatarCache }));
vi.mock('@/hooks/useOfflineCache', () => ({
  useOfflineCache: (convs: unknown) => ({
    conversations: h.state.cacheOn ? h.state.cachedConvos : convs,
    isOffline: h.state.cacheOn,
    usingCache: h.state.cacheOn,
    clearCache: vi.fn(),
  }),
}));
vi.mock('@/features/inbox/hooks/useInboxHeartbeat', () => ({
  useInboxHeartbeat: () => ({ isOnline: h.state.isOnline }),
}));
vi.mock('@/features/inbox/hooks/useInboxDeepLinks', () => ({ useInboxDeepLinks: vi.fn() }));
vi.mock('@/features/inbox/hooks/useFallbackContact', () => ({
  useFallbackContact: (_contactId: unknown, selected: unknown) => selected,
}));
vi.mock('@/features/inbox/hooks/useContactSummaryBatch', () => ({
  useContactSummaryBatch: () => ({ data: h.state.summary }),
}));
vi.mock('@/features/inbox/hooks/useMessageQueue', () => ({
  useMessageQueue: () => ({
    queue: [],
    addToQueue: h.fns.addToQueue,
    retryMessage: vi.fn(),
    updateProgress: vi.fn(),
    reconcileWithDelivery: h.fns.reconcileWithDelivery,
    getMetrics: vi.fn(),
    removeFromQueue: vi.fn(),
  }),
}));
// useInboxSource (REAL) compõe estes dois por baixo do orquestrador:
vi.mock('@/features/inbox/hooks/useRealtimeMessages', () => ({
  useRealtimeMessages: () => ({
    conversations: h.state.convos,
    loading: h.state.loading,
    error: h.state.error,
    refetch: h.fns.refetch,
    search: h.state.search,
    setSearch: h.fns.setSearch,
    statusFilter: h.state.statusFilter,
    setStatusFilter: h.fns.setStatusFilter,
    sortBy: h.state.sortBy,
    setSortBy: h.fns.setSortBy,
    loadMoreConversations: h.fns.loadMoreConversations,
    hasMoreConversations: false,
    loadingMoreConversations: false,
    sendMessage: h.fns.sendMessage,
    markAsRead: h.fns.markAsRead,
    markManyAsRead: h.fns.markManyAsRead,
    newMessageNotification: h.state.notification,
    dismissNotification: h.fns.dismissNotification,
    setSelectedContact: h.fns.setSelectedContact,
    setSoundEnabled: h.fns.setSoundEnabled,
    batcherStatus: 'idle',
  }),
}));
vi.mock('@/features/inbox/hooks/useMessages', () => ({
  useMessages: () => ({ messages: h.state.msgs, loading: false, refetch: h.fns.refetchMsgs }),
}));
// E36 dual-path: leaf evo (cursor) mockado — o orquestrador roda sobre o path
// legado ('zapp' via stubEnv). O cursor REAL criaria canal + RPC evo e, mesmo
// desabilitado, dispararia setPages([]) extra (re-render) que re-dispara o
// efeito de reconcile — com >1000 entregas a cascata de evicção dobra as
// chamadas (contrato evo coberto por useInboxSource.test.tsx).
const cursorReturn = vi.hoisted(() => ({
  messages: [] as unknown[],
  loading: false,
  loadingOlder: false,
  hasMoreOlder: false,
  error: null as string | null,
  loadOlder: vi.fn(),
  cancelLoadOlder: vi.fn(),
  refetch: vi.fn(),
  addMessage: vi.fn(),
  updateMessage: vi.fn(),
  removeMessage: vi.fn(),
}));
vi.mock('@/features/inbox/hooks/useMessagesCursor', () => ({
  useMessagesCursor: () => cursorReturn,
}));
vi.mock('@/adapters/inboxLegacyMapper', () => ({
  mapToLegacyConversation: (resolved: unknown) => {
    if (!resolved) return null;
    const r = resolved as { contact: { id: string; name: string; phone: string } };
    return {
      id: r.contact.id,
      contact: { id: r.contact.id, name: r.contact.name, phone: r.contact.phone },
      lastMessage: undefined,
      unreadCount: 0,
      status: 'open',
      priority: 'medium',
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  },
  mapToLegacyMessages: (msgs: unknown, contactId: unknown) =>
    ((msgs as Array<{ id: string; content: string }>) ?? []).map((m) => ({
      id: m.id,
      conversationId: contactId,
      content: m.content,
    })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────
function makeContact(id: string, overrides: Partial<ConversationContact> = {}): ConversationContact {
  return {
    id,
    name: `Contact ${id}`,
    surname: null,
    nickname: null,
    phone: '5500000000000',
    email: null,
    avatar_url: null,
    tags: [],
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    whatsapp_connection_id: null,
    contact_type: null,
    group_category: null,
    ai_sentiment: null,
    channel_type: null,
    channel_connection_id: null,
    routing_status: null,
    remote_jid: null,
    instance_name: null,
    ...overrides,
  };
}

function makeMsg(id: string, overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
  return {
    id,
    contact_id: null,
    agent_id: null,
    content: `msg ${id}`,
    sender: 'agent',
    message_type: 'text',
    media_url: null,
    is_read: null,
    status: 'sent',
    status_updated_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    external_id: null,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: null,
    retry_attempt: null,
    retry_total: null,
    ...overrides,
  };
}

function makeConversation(
  contact: ConversationContact,
  messages: RealtimeMessage[] = [],
  unreadCount = 0
): ConversationWithMessages {
  return {
    contact,
    messages,
    unreadCount,
    lastMessage: messages[messages.length - 1] ?? null,
    isArchived: false,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60000 } } });
}

function lastChannel(): FakeChannel {
  const arr = fakeSupabase.createdChannels;
  if (arr.length === 0) throw new Error('nenhum canal criado');
  return arr[arr.length - 1];
}

function fireSubscribeStatus(status: string) {
  const cb = lastChannel().subscribeCb;
  if (!cb) throw new Error('subscribe sem callback registrado');
  act(() => cb(status));
}

function fireWhisperEvent() {
  const cb = lastChannel().onCalls.find((c) => c.event === 'postgres_changes')?.callback;
  if (!cb) throw new Error('callback postgres_changes não registrado');
  act(() => cb());
}

/** Renderiza o orquestrador e seleciona o contato UUID (ativa o canal whisper). */
function renderAndSelectContact(qc: QueryClient, contactId: string) {
  const rendered = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });
  act(() => rendered.result.current.setSelectedContactId(contactId));
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  // E36 dual-path: fixa o modo 'zapp' (path legado, leaf mockado aqui). O
  // default 'auto' ativaria o useMessagesCursor REAL (canal + RPC evo) e
  // quebraria os asserts de canal/reconcile deste arquivo (ver header).
  vi.stubEnv('VITE_INBOX_SOURCE_MODE', 'zapp');
  fakeSupabase.reset();
  Object.assign(h.state, {
    profile: { id: PROFILE_ID },
    convos: [] as unknown[],
    loading: false,
    error: null as string | null,
    search: '',
    statusFilter: 'all' as string,
    sortBy: 'lastMessage' as string,
    msgs: [] as unknown[],
    summary: null as unknown,
    cacheOn: false,
    cachedConvos: [] as unknown[],
    isOnline: true,
    notification: null as unknown,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('E32 useRealtimeInbox — boot da cadeia de canais (whisper)', () => {
  it('monta o canal whisper com tópico determinístico, filtro correto e subscribe', () => {
    const qc = newQueryClient();
    h.state.convos = [makeConversation(makeContact(CONTACT_UUID))];
    const { result } = renderAndSelectContact(qc, CONTACT_UUID);

    expect(fakeSupabase.channel).toHaveBeenCalledTimes(1);
    // E32: tópico DETERMINÍSTICO derivado do estado — RED com Math.random.
    expect(fakeSupabase.channel).toHaveBeenCalledWith(WHISPER_TOPIC);
    const ch = lastChannel();
    expect(ch.onCalls).toHaveLength(1);
    expect(ch.onCalls[0].event).toBe('postgres_changes');
    expect(ch.onCalls[0].filter).toEqual({
      event: '*',
      schema: 'zapp',
      table: 'whisper_messages',
      filter: `contact_id=eq.${CONTACT_UUID}`,
    });
    expect(ch.subscribed).toBe(true);
    expect(result.current.selectedContactId).toBe(CONTACT_UUID);
  });

  it('evento postgres_changes invalida a query batch (atualização incremental do whisper)', () => {
    const qc = newQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    h.state.convos = [
      makeConversation(makeContact(CONTACT_UUID)),
      makeConversation(makeContact(SECOND_UUID)),
    ];
    renderAndSelectContact(qc, CONTACT_UUID);
    expect(invalidateSpy).not.toHaveBeenCalled();

    fireWhisperEvent();

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: BATCH_KEY });
    // O evento não derruba o hook — lista continua íntegra.
    expect(h.fns.logger.error).not.toHaveBeenCalled();
  });

  it('selectedContactId não-UUID (JID/telefone) NÃO cria canal (guard uuid)', () => {
    const qc = newQueryClient();
    const { result } = renderAndSelectContact(qc, JID);
    expect(fakeSupabase.channel).not.toHaveBeenCalled();
    expect(result.current.whisperCount).toBe(0);
  });

  it('sem profile não cria canal', () => {
    const qc = newQueryClient();
    h.state.profile = null;
    renderAndSelectContact(qc, CONTACT_UUID);
    expect(fakeSupabase.channel).not.toHaveBeenCalled();
  });
});

describe('E32 useRealtimeInbox — erro de canal não quebra a lista', () => {
  it('CHANNEL_ERROR/TIMED_OUT → logChannelError e lista permanece funcional', () => {
    const qc = newQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const convos = [
      makeConversation(makeContact(CONTACT_UUID), [makeMsg('m1', { sender: 'contact' })], 1),
    ];
    h.state.convos = convos;
    const { result } = renderAndSelectContact(qc, CONTACT_UUID);

    fireSubscribeStatus('SUBSCRIBED');
    expect(h.fns.logChannelError).not.toHaveBeenCalled();
    expect(result.current.conversations).toHaveLength(1);

    fireSubscribeStatus('CHANNEL_ERROR');
    expect(h.fns.logChannelError).toHaveBeenCalledTimes(1);
    expect(h.fns.logChannelError.mock.calls[0][3]).toBe('CHANNEL_ERROR');
    // A lista NÃO quebra com o erro de canal:
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.conversations[0].contact.id).toBe(CONTACT_UUID);
    expect(result.current.conversations[0].unreadCount).toBe(1);

    fireSubscribeStatus('TIMED_OUT');
    expect(h.fns.logChannelError).toHaveBeenCalledTimes(2);

    // Canal segue vivo após erro: evento ainda invalida a query.
    fireWhisperEvent();
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['contact-summary-batch', CONTACT_UUID],
    });
  });
});

describe('E32 useRealtimeInbox — limpeza de canais no unmount (sem vazamento)', () => {
  it('unmount chama unsubscribe + removeChannel com a instância correta', () => {
    const qc = newQueryClient();
    h.state.convos = [makeConversation(makeContact(CONTACT_UUID))];
    const { unmount } = renderAndSelectContact(qc, CONTACT_UUID);

    const ch = lastChannel();
    expect(fakeSupabase.removeChannel).not.toHaveBeenCalled();

    unmount();
    expect(ch.unsubscribe).toHaveBeenCalledTimes(1);
    expect(fakeSupabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(fakeSupabase.removeChannel).toHaveBeenCalledWith(ch);
    expect(fakeSupabase.channelsByTopic.size).toBe(0);
  });

  it('RED→GREEN: montar/desmontar 3× usa o MESMO tópico determinístico e não vaza canais', () => {
    const qc = newQueryClient();
    h.state.convos = [makeConversation(makeContact(CONTACT_UUID))];

    for (let i = 0; i < 3; i += 1) {
      const { unmount } = renderAndSelectContact(qc, CONTACT_UUID);
      // E32: tópico estável/determinístico em TODOS os mounts (RED com Math.random).
      expect(fakeSupabase.channel).toHaveBeenLastCalledWith(WHISPER_TOPIC);
      unmount();
      expect(fakeSupabase.channelsByTopic.size).toBe(0);
    }
    expect(fakeSupabase.createdChannels).toHaveLength(3);
    // Nenhum tópico com sufixo aleatório (padrão A8 — acúmulo de canais).
    for (const ch of fakeSupabase.createdChannels) {
      expect(ch.topic).toBe(WHISPER_TOPIC);
    }
  });

  it('StrictMode: montar/desmontar 3× com tópico determinístico (sem throw, sem vazamento)', () => {
    const qc = newQueryClient();
    h.state.convos = [makeConversation(makeContact(CONTACT_UUID))];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Probe seleciona o contato no efeito; StrictMode duplica efeitos e renders.
    function Probe() {
      const inbox = useRealtimeInbox();
      // Probe de ciclo de vida: seleciona o contato UMA vez no mount.
      /* eslint-disable react-hooks/exhaustive-deps */
      React.useEffect(() => {
        inbox.setSelectedContactId(CONTACT_UUID);
      }, []);
      /* eslint-enable react-hooks/exhaustive-deps */
      return null;
    }

    try {
      for (let i = 0; i < 3; i += 1) {
        const container = document.createElement('div');
        const root = createRoot(container);
        act(() => {
          root.render(
            React.createElement(
              StrictMode,
              null,
              React.createElement(
                QueryClientProvider,
                { client: qc },
                React.createElement(Probe)
              )
            )
          );
        });
        // Tópico determinístico em cada mount (RED com Math.random).
        expect(fakeSupabase.channel).toHaveBeenLastCalledWith(WHISPER_TOPIC);
        act(() => root.unmount());
        expect(fakeSupabase.channelsByTopic.size).toBe(0);
      }
    } finally {
      errorSpy.mockRestore();
    }

    for (const ch of fakeSupabase.createdChannels) {
      expect(ch.topic).toBe(WHISPER_TOPIC);
    }
    expect(fakeSupabase.removeChannel).toHaveBeenCalled();
  });
});

describe('E32 useRealtimeInbox — concatenação/ordenação de conversas e atualização incremental', () => {
  it('ordem da lista do source preservada (sem re-sort) e atualização incremental propagada', () => {
    const qc = newQueryClient();
    const cOlder = makeContact('older-contact');
    const cNewest = makeContact(CONTACT_UUID);
    h.state.convos = [makeConversation(cOlder), makeConversation(cNewest)];
    const { result, rerender } = renderHook(() => useRealtimeInbox(), {
      wrapper: makeWrapper(qc),
    });

    expect(result.current.conversations.map((c) => c.contact.id)).toEqual([
      'older-contact',
      CONTACT_UUID,
    ]);

    // Mensagem nova → source emite lista nova com conversa nova no topo.
    const cBrandNew = makeContact('brand-new');
    h.state.convos = [makeConversation(cBrandNew), makeConversation(cOlder), makeConversation(cNewest)];
    rerender();
    expect(result.current.conversations.map((c) => c.contact.id)).toEqual([
      'brand-new',
      'older-contact',
      CONTACT_UUID,
    ]);
    expect(result.current.conversations[0].contact.name).toBe('Contact brand-new');
  });

  it('offline cache: usingCache=true expõe cachedConversations sem tocar a lista viva', () => {
    const qc = newQueryClient();
    const live = [makeConversation(makeContact(CONTACT_UUID))];
    const cached = [makeConversation(makeContact('cached-contact'))];
    h.state.convos = live;
    h.state.cacheOn = true;
    h.state.cachedConvos = cached;
    const { result } = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });

    expect(result.current.usingCache).toBe(true);
    expect(result.current.cachedConversations.map((c) => c.contact.id)).toEqual(['cached-contact']);
    // A lista viva do source permanece íntegra para quando a conexão voltar.
    expect(result.current.conversations.map((c) => c.contact.id)).toEqual([CONTACT_UUID]);
  });
});

describe('E32 useRealtimeInbox — filtros pass-through (não lidas / busca / ordenação)', () => {
  it('search/statusFilter/sortBy refletem o source e os setters delegam', () => {
    const qc = newQueryClient();
    h.state.search = 'urgente';
    h.state.statusFilter = 'unread';
    h.state.sortBy = 'name';
    const { result } = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });

    expect(result.current.search).toBe('urgente');
    expect(result.current.statusFilter).toBe('unread');
    expect(result.current.sortBy).toBe('name');

    act(() => result.current.setSearch('novo termo'));
    expect(h.fns.setSearch).toHaveBeenCalledWith('novo termo');
    act(() => result.current.setStatusFilter('unread'));
    expect(h.fns.setStatusFilter).toHaveBeenCalledWith('unread');
    act(() => result.current.setSortBy('unread'));
    expect(h.fns.setSortBy).toHaveBeenCalledWith('unread');
  });

  it('seleção de conversa: legacyConversation/legacyMessages resolvem e marca como lida', () => {
    const qc = newQueryClient();
    const msgs = [
      makeMsg('m1', { sender: 'contact', content: 'oi' }),
      makeMsg('m2', { sender: 'agent', content: 'olá' }),
    ];
    h.state.convos = [makeConversation(makeContact(CONTACT_UUID), msgs, 2)];
    h.state.msgs = msgs;
    const { result } = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });

    act(() => result.current.handleSelectConversation(CONTACT_UUID));
    expect(result.current.selectedContactId).toBe(CONTACT_UUID);
    expect(h.fns.setSelectedContact).toHaveBeenCalledWith(CONTACT_UUID);
    expect(h.fns.markAsRead).toHaveBeenCalledWith(CONTACT_UUID);
    expect(result.current.legacyConversation?.contact.id).toBe(CONTACT_UUID);
    expect(result.current.legacyMessages).toHaveLength(2);
    expect(result.current.legacyMessages[0].conversationId).toBe(CONTACT_UUID);
  });
});

describe('E32 useRealtimeInbox — reconcile de entregas (dedupe + RECONCILED_MAX=1000)', () => {
  it('dedupe de eventos duplicados: external_id repetido reconcilia 1x; sender contact ignorado; bot dedupe por content; status failed mapeado', () => {
    const qc = newQueryClient();
    h.state.convos = [makeConversation(makeContact('c1'))];
    h.state.msgs = [
      makeMsg('m1', { external_id: 'e1' }),
      makeMsg('m2', { external_id: 'e1' }), // duplicado → deve ser ignorado
      makeMsg('m3', { sender: 'contact', external_id: 'e1' }), // contato → ignorado
      makeMsg('m4', { sender: 'bot', external_id: null, content: 'olá' }),
      makeMsg('m5', { sender: 'bot', external_id: null, content: 'olá' }), // duplicado por content
      makeMsg('m6', { status: 'failed', external_id: 'e2' }),
    ];
    const { result } = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });
    act(() => result.current.setSelectedContactId('c1'));

    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledTimes(3);
    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledWith('c1', 'e1', 'confirmed');
    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledWith('c1', 'olá', 'confirmed');
    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledWith('c1', 'e2', 'failed');
  });

  it('cap RECONCILED_MAX=1000: 1001 entregas não estouram o Set; entrega nova após evicção reconcilia', () => {
    const qc = newQueryClient();
    h.state.convos = [makeConversation(makeContact('c1'))];
    const burst = Array.from({ length: 1001 }, (_, i) =>
      makeMsg(`burst-${i}`, { external_id: `e${i}` })
    );
    h.state.msgs = burst;
    const { result, rerender } = renderHook(() => useRealtimeInbox(), {
      wrapper: makeWrapper(qc),
    });
    act(() => result.current.setSelectedContactId('c1'));

    // Todas as 1001 entregas reconciliadas (cap evicta a mais antiga ao estourar).
    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledTimes(1001);
    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledWith('c1', 'e0', 'confirmed');
    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledWith('c1', 'e1000', 'confirmed');

    // Entrega nova chega → reconcilia; as já processadas não reprocessam.
    h.state.msgs = [makeMsg('nova', { external_id: 'e1001' })];
    rerender();
    expect(h.fns.reconcileWithDelivery).toHaveBeenCalledTimes(1002);
    expect(h.fns.reconcileWithDelivery).toHaveBeenLastCalledWith('c1', 'e1001', 'confirmed');

    // Set interno limitado em 1000 (RECONCILED_MAX_ENTRIES): re-emitir o burst
    // inteiro reconcilia de novo APENAS o que foi evictado (cascata de evicção)
    // — se o Set crescesse sem limite, nada seria reprocessado e o total
    // ficaria em 1002. Total exato: 1001 (burst) + 1 (e1001) + 1001 (re-emissão).
    h.state.msgs = burst;
    rerender();
    const callsAfter = h.fns.reconcileWithDelivery.mock.calls.length;
    expect(callsAfter).toBe(1001 + 1 + 1001);
  });
});

describe('E32 useRealtimeInbox — ações do orquestrador (envio/áudio)', () => {
  it('handleSendAudio sem contato selecionado → toast de erro e NÃO enfileira', async () => {
    const qc = newQueryClient();
    const { result } = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.handleSendAudio(new Blob(['x']));
    });
    expect(h.fns.toastError).toHaveBeenCalledWith('Selecione uma conversa primeiro');
    expect(h.fns.addToQueue).not.toHaveBeenCalled();
  });

  it('handleSendAudio com blob inválido → toast de erro do validatePttBlob', async () => {
    const qc = newQueryClient();
    h.fns.validatePttBlob.mockResolvedValueOnce({ ok: false, message: 'Áudio inválido.' });
    const { result } = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });
    act(() => result.current.setSelectedContactId(CONTACT_UUID));
    await act(async () => {
      await result.current.handleSendAudio(new Blob(['x']));
    });
    expect(h.fns.toastError).toHaveBeenCalledWith('Áudio inválido.');
    expect(h.fns.addToQueue).not.toHaveBeenCalled();
  });

  it('handleSendAudio válido → enfileira como audio com File e contato selecionado', async () => {
    const qc = newQueryClient();
    const { result } = renderHook(() => useRealtimeInbox(), { wrapper: makeWrapper(qc) });
    act(() => result.current.setSelectedContactId(CONTACT_UUID));
    await act(async () => {
      await result.current.handleSendAudio(new Blob(['x'], { type: 'audio/ogg' }));
    });
    expect(h.fns.addToQueue).toHaveBeenCalledTimes(1);
    const [contactId, label, files, type] = h.fns.addToQueue.mock.calls[0];
    expect(contactId).toBe(CONTACT_UUID);
    expect(label).toBe('Mensagem de áudio');
    expect(files).toHaveLength(1);
    expect((files[0] as File).type).toBe('audio/ogg');
    expect(type).toBe('audio');
  });
});
