/**
 * E36 — CONTRATO DE WIRING do useInboxSource (dual-path zapp×evo).
 *
 * RED: o hook atual (69 ln) usa APENAS o path legado (useMessages +
 * useRealtimeMessages). O contrato E36 exige seleção de fonte POR
 * CONFIGURAÇÃO (VITE_INBOX_SOURCE_MODE: 'evo' | 'zapp' | 'auto') com fallback
 * automático em modo 'auto' quando o path evo (useMessagesCursor /
 * rpc_list_messages_lite) falha — gravando telemetria `source_fallback` em
 * reconciliationTelemetry. Testes abaixo falham contra o hook atual:
 *  - não existe seleção por configuração (modo/remoteJid/sourcePath ausentes);
 *  - evo nunca é usado (loadOlderMessages sempre undefined).
 *
 * Contrato futuro (docs/adr/dual-path-inbox.md):
 *   - conversations/search/filtros continuam vindo de useRealtimeMessages.
 *   - selectedMessages: path evo → cursor-based (mapped para Message[]);
 *     path legado → useMessages.
 *   - callbacks de paginação (loadOlderMessages/cancelLoadOlderMessages/
 *     hasMoreMessages/loadingOlderMessages) vêm do cursor em modo evo e são
 *     undefined/false em modo legado.
 *   - auto + erro do cursor → fallback para legado + recordSourceFallback(reason).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  resetReconciliationStats,
  getReconciliationStats,
  getSourceSwitchEvents,
} from '../realtime/reconciliationTelemetry';
import { useInboxSource, type UseInboxSourceReturn } from '../useInboxSource';
import type { EvolutionMessageLite } from '@/types/evolutionExternal';
import type { Message } from '@/types/chat';

const mocks = vi.hoisted(() => {
  const cursorOptions: Array<Record<string, unknown>> = [];
  const legacyOptions: Array<Record<string, unknown>> = [];
  return {
    cursorOptions,
    legacyOptions,
    realtime: {
      conversations: [] as Array<Record<string, unknown>>,
      loading: false,
      error: null as string | null,
      refetch: vi.fn(async () => undefined),
      search: '',
      setSearch: vi.fn(),
      statusFilter: 'all',
      setStatusFilter: vi.fn(),
      sortBy: 'recent',
      setSortBy: vi.fn(),
      loadMoreConversations: vi.fn(async () => undefined),
      hasMoreConversations: false,
      loadingMoreConversations: false,
      sendMessage: vi.fn(),
      markAsRead: vi.fn(),
      markManyAsRead: vi.fn(),
      newMessageNotification: null,
      dismissNotification: vi.fn(),
      setSelectedContact: vi.fn(),
      setSoundEnabled: vi.fn(),
    },
    cursor: {
      messages: [] as EvolutionMessageLite[],
      loading: false,
      loadingOlder: false,
      hasMoreOlder: false,
      error: null as string | null,
      loadOlder: vi.fn(async () => undefined),
      cancelLoadOlder: vi.fn(),
      refetch: vi.fn(async () => undefined),
      addMessage: vi.fn(),
      updateMessage: vi.fn(),
      removeMessage: vi.fn(),
    },
    legacy: {
      messages: [] as Message[],
      loading: false,
      error: null as string | null,
      refetch: vi.fn(async () => undefined),
      addMessage: vi.fn(),
      updateMessage: vi.fn(),
      removeMessage: vi.fn(),
    },
  };
});

vi.mock('../useRealtimeMessages', () => ({
  useRealtimeMessages: () => mocks.realtime,
}));

vi.mock('../useMessagesCursor', () => ({
  useMessagesCursor: (opts: Record<string, unknown>) => {
    mocks.cursorOptions.push(opts);
    return mocks.cursor;
  },
}));

vi.mock('../useMessages', () => ({
  useMessages: (opts: Record<string, unknown>) => {
    mocks.legacyOptions.push(opts);
    return mocks.legacy;
  },
}));

const JID = '5511999999999@s.whatsapp.net';
const UUID = '123e4567-e89b-12d3-a456-426614174000';

function evoLite(id = 'ev1'): EvolutionMessageLite {
  return {
    id,
    message_id: `WA-${id}`,
    remote_jid: JID,
    from_me: false,
    direction: 'inbound',
    status: 'delivered',
    message_type: 'conversation',
    content: `msg-${id}`,
    media_url: null,
    media_mimetype: null,
    media_type: null,
    media_filename: null,
    caption: null,
    quoted_message_id: null,
    is_starred: false,
    is_important: false,
    sent_by_bot: false,
    push_name: 'Cliente',
    instance_name: 'default',
    created_at: '2026-08-18T10:00:00.000Z',
    status_at: '2026-08-18T10:00:01.000Z',
    deleted_at: null,
  };
}

beforeEach(() => {
  resetReconciliationStats();
  mocks.cursorOptions.length = 0;
  mocks.legacyOptions.length = 0;
  mocks.realtime.conversations = [];
  mocks.cursor.messages = [];
  mocks.cursor.error = null;
  mocks.cursor.hasMoreOlder = false;
  mocks.cursor.loadingOlder = false;
  mocks.legacy.messages = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('useInboxSource — seleção de fonte por configuração', () => {
  it('modo auto (default) + evo OK → dados cursor-based do path evo', async () => {
    mocks.cursor.messages = [evoLite('ev1'), evoLite('ev2')];
    mocks.cursor.hasMoreOlder = true;
    mocks.cursor.loadingOlder = true;

    const { result } = renderHook(() => useInboxSource(JID));

    await waitFor(() => expect(result.current.selectedMessages).toHaveLength(2));

    // dados cursor-based mapeados para Message[]
    expect(result.current.sourcePath).toBe('evo');
    expect(result.current.selectedMessages[0].id).toBe('ev1');
    expect(result.current.selectedMessages[0].conversationId).toBe(JID);
    expect(result.current.selectedMessages[0].sender).toBe('contact');
    expect(result.current.selectedMessages[0].type).toBe('text');
    expect(result.current.selectedMessages[1].content).toBe('msg-ev2');

    // paginação por cursor exposta
    expect(result.current.loadOlderMessages).toBe(mocks.cursor.loadOlder);
    expect(result.current.cancelLoadOlderMessages).toBe(mocks.cursor.cancelLoadOlder);
    expect(result.current.hasMoreMessages).toBe(true);
    expect(result.current.loadingOlderMessages).toBe(true);

    // path legado desligado; cursor habilitado com PAGE_SIZE
    expect(mocks.legacyOptions[mocks.legacyOptions.length - 1]?.enabled).toBe(false);
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.enabled).toBe(true);
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.remoteJid).toBe(JID);
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.pageSize).toBe(50);

    // sem telemetria de fallback
    expect(getReconciliationStats().sourceFallback).toBe(0);
    expect(getSourceSwitchEvents()).toEqual([]);
  });

  it('modo zapp (configuração) → path legado; cursor desligado; sem callbacks de paginação', async () => {
    vi.stubEnv('VITE_INBOX_SOURCE_MODE', 'zapp');
    mocks.legacy.messages = [
      {
        id: 'leg1',
        conversationId: JID,
        content: 'legado',
        type: 'text',
        sender: 'agent',
        timestamp: new Date('2026-08-18T09:00:00.000Z'),
        status: 'sent',
      } as Message,
    ];

    const { result } = renderHook(() => useInboxSource(JID));

    await waitFor(() => expect(result.current.selectedMessages).toHaveLength(1));

    expect(result.current.sourcePath).toBe('zapp');
    expect(result.current.selectedMessages[0].id).toBe('leg1');
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.enabled).toBe(false);
    expect(mocks.legacyOptions[mocks.legacyOptions.length - 1]?.enabled).toBe(true);
    expect(result.current.loadOlderMessages).toBeUndefined();
    expect(result.current.cancelLoadOlderMessages).toBeUndefined();
    expect(result.current.hasMoreMessages).toBe(false);
    expect(result.current.loadingOlderMessages).toBe(false);
    expect(getReconciliationStats().sourceFallback).toBe(0);
  });

  it('modo evo forçado (configuração) + erro do cursor → NÃO cai para legado, sem telemetria', async () => {
    vi.stubEnv('VITE_INBOX_SOURCE_MODE', 'evo');
    mocks.cursor.error = 'RPC list_messages_lite failed';

    const { result } = renderHook(() => useInboxSource(JID));

    // forçado: permanece no path evo (erro exposto via sourcePath) — sem fallback
    await waitFor(() => expect(result.current.sourcePath).toBe('evo'));
    expect(mocks.legacyOptions[mocks.legacyOptions.length - 1]?.enabled).toBe(false);
    expect(getReconciliationStats().sourceFallback).toBe(0);
  });

  it('modo auto + erro do cursor → fallback para legado com telemetria source_fallback', async () => {
    mocks.cursor.error = 'RPC list_messages_lite failed';
    mocks.legacy.messages = [
      {
        id: 'leg-fb',
        conversationId: JID,
        content: 'fallback',
        type: 'text',
        sender: 'contact',
        timestamp: new Date('2026-08-18T09:30:00.000Z'),
        status: 'sent',
      } as Message,
    ];

    const { result } = renderHook(() => useInboxSource(JID));

    // transição automática: evo → zapp
    await waitFor(() => expect(result.current.sourcePath).toBe('zapp'));

    expect(result.current.selectedMessages[0].id).toBe('leg-fb');
    // legado ativo, cursor desligado após o fallback
    expect(mocks.legacyOptions[mocks.legacyOptions.length - 1]?.enabled).toBe(true);
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.enabled).toBe(false);
    // telemetria: counter + evento source_switch (1 única vez)
    expect(getReconciliationStats().sourceFallback).toBe(1);
    const events = getSourceSwitchEvents();
    expect(events).toHaveLength(1);
    expect(events[0].from).toBe('evo');
    expect(events[0].to).toBe('zapp');
    expect(events[0].reason).toContain('RPC list_messages_lite failed');
  });

  it('fallback dispara UMA única vez (idempotente sob re-renders)', async () => {
    mocks.cursor.error = 'boom';

    const { result } = renderHook(() => useInboxSource(JID));
    await waitFor(() => expect(result.current.sourcePath).toBe('zapp'));

    act(() => {
      result.current.setSearch('x');
    });
    await waitFor(() => expect(result.current.sourcePath).toBe('zapp'));
    expect(getReconciliationStats().sourceFallback).toBe(1);
  });

  it('remoteJid derivado: JID direto OU UUID resolvido via conversations', () => {
    // JID direto
    renderHook(() => useInboxSource(JID));
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.remoteJid).toBe(JID);

    // UUID → lookup no contato da conversa
    mocks.realtime.conversations = [
      { contact: { id: UUID, remote_jid: JID }, messages: [] },
    ];
    renderHook(() => useInboxSource(UUID));
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.remoteJid).toBe(JID);

    // UUID sem conversa correspondente → remoteJid null (cursor desligado)
    mocks.realtime.conversations = [];
    renderHook(() => useInboxSource(UUID));
    expect(mocks.cursorOptions[mocks.cursorOptions.length - 1]?.remoteJid).toBeNull();
  });

  it('conversations/search/filtros continuam vindo de useRealtimeMessages (contrato preservado)', async () => {
    mocks.realtime.conversations = [{ contact: { id: 'c1' }, messages: [] }];
    mocks.realtime.search = 'joao';

    const { result } = renderHook(() => useInboxSource(JID));

    expect(result.current.conversations).toBe(mocks.realtime.conversations);
    expect(result.current.search).toBe('joao');
    expect(result.current.loading).toBe(false);
    expect(result.current.refetch).toBe(mocks.realtime.refetch);
    expect(result.current.loadMoreConversations).toBe(mocks.realtime.loadMoreConversations);
    act(() => result.current.setSearch('x'));
    expect(mocks.realtime.setSearch).toHaveBeenCalledWith('x');
  });
});

describe('useInboxSource — contrato de tipos (36.9): interface única compatível com consumidores', () => {
  // Compile-time: cada chave abaixo precisa continuar existindo em
  // UseInboxSourceReturn — se a interface encolher, o tsc falha aqui.
  const CONTRACT_KEYS = [
    'conversations',
    'loading',
    'error',
    'refetch',
    'search',
    'setSearch',
    'statusFilter',
    'setStatusFilter',
    'sortBy',
    'setSortBy',
    'selectedMessages',
    'selectedMessagesLoading',
    'refetchSelectedMessages',
    'loadOlderMessages',
    'cancelLoadOlderMessages',
    'loadingOlderMessages',
    'hasMoreMessages',
    'addExternalMessage',
    'selectedConversationInstance',
    'localRealtime',
    'loadMoreConversations',
    'hasMoreConversations',
    'loadingMoreConversations',
    'sourcePath',
  ] as const;
  type ContractKeys = (typeof CONTRACT_KEYS)[number];
  type _AssertSubset<T extends keyof UseInboxSourceReturn> = T;
  type _CheckSubset = _AssertSubset<ContractKeys>;

  it('retorna TODAS as chaves do contrato (runtime)', async () => {
    const { result } = renderHook(() => useInboxSource(JID));
    const keys = new Set(Object.keys(result.current));
    for (const k of CONTRACT_KEYS) {
      expect(keys.has(k), `chave ausente no retorno: ${k}`).toBe(true);
    }
  });

  it('campo observabilidade sourcePath exposto em ambos os paths', async () => {
    const evo = renderHook(() => useInboxSource(JID));
    expect(evo.result.current.sourcePath).toBe('evo');

    evo.unmount();
    vi.stubEnv('VITE_INBOX_SOURCE_MODE', 'zapp');
    const zapp = renderHook(() => useInboxSource(JID));
    expect(zapp.result.current.sourcePath).toBe('zapp');
  });
});
