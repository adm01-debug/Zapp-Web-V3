/**
 * E31 — Testes TDD do orquestrador useRealtimeMessages (fanout v2).
 *
 * Comportamentos críticos cobertos (contrato do espelho zapp.realtime_message_fanout):
 *   1. Assinatura: dbChannel('messages', 'messages-realtime') com
 *      postgres_changes INSERT/UPDATE em { schema:'zapp', table:'realtime_message_fanout' }.
 *      (DELETE removido no RCA 2026-08-20: a purga do cron rt-fanout-ttl não é
 *      deleção semântica de mensagem — assinar DELETE causava 972 invalidações
 *      por ciclo e saturação da fila; ver docs/RCA_20260820_queue_saturation.md.)
 *   2. Transformação de payload: adaptEvoPayload mapeia from_me → sender
 *      ('agent'/'contact') e deleted_at → is_deleted; normalizeMessage preenche
 *      content '' quando null.
 *   3. Dedup de mensagens duplicadas: INSERT com id já presente NÃO duplica a
 *      mensagem na conversa e NÃO re-dispara a notificação (bug real: o notify
 *      rodava incondicionalmente após o commitConversations).
 *   4. Erro de canal: subscribe(status) classifica CHANNEL_ERROR/TIMED_OUT via
 *      logChannelError (padrão dos hooks irmãos: useMessagesCursor,
 *      useIncomingCallBroadcast) — o orquestrador só fazia log.debug (gap).
 *   5. DELETE do fanout NÃO é assinado (RCA 2026-08-20) — mensagens permanecem
 *      intactas quando o cron purga o espelho.
 *   6. UPDATE flui pelo useMessageUpdateBatcher (debounce 150ms) e reflete o status.
 *   7. Unmount remove o canal via dbRemoveChannel.
 *
 * RED esperado (estado atual do orquestrador):
 *   - "não re-notifica duplicata" (bug: notifyAboutIncomingMessage roda sempre)
 *   - "classifica erro de canal" (gap: sem logChannelError)
 * Os demais são guards de regressão (já GREEN).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  useRealtimeMessages,
  type RealtimeMessage,
  type ConversationContact,
} from '../useRealtimeMessages';

// ── Mocks hoisted ────────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const notifyAboutIncomingMessage = vi.fn();
  const logChannelError = vi.fn();
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  interface FakeChannel {
    name: string;
    onCalls: Array<{ event: string; filter: Record<string, unknown>; cb: (p: unknown) => void }>;
    statusCb: ((status: string) => void) | null;
    on: (event: string, filter: Record<string, unknown>, cb: (p: unknown) => void) => FakeChannel;
    subscribe: (cb?: (status: string) => void) => FakeChannel;
  }

  const channels: FakeChannel[] = [];
  const removeChannelCalls: Array<{ entity: string; channel: FakeChannel }> = [];

  let seedContacts: ConversationContact[] = [];
  let seedMessages: RealtimeMessage[] = [];

  function makeChain(rows: unknown[]) {
    const result = { data: rows, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of [
      'select',
      'order',
      'limit',
      'or',
      'in',
      'eq',
      'maybeSingle',
      'update',
      'not',
      'is',
      'filter',
    ]) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (v: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve);
    return chain;
  }

  const dbFrom = vi.fn((entity: string) =>
    entity === 'contacts' ? makeChain(seedContacts) : makeChain(seedMessages)
  );
  const dbTable = vi.fn(() => 'messages');
  const dbChannel = vi.fn((_entity: string, name: string): FakeChannel => {
    const channel: FakeChannel = {
      name,
      onCalls: [],
      statusCb: null,
      on(event, filter, cb) {
        channel.onCalls.push({
          event: (filter as { event?: string }).event ?? String(event),
          filter,
          cb,
        });
        return channel;
      },
      subscribe(cb) {
        channel.statusCb = cb ?? null;
        return channel;
      },
    };
    channels.push(channel);
    return channel;
  });
  const dbRemoveChannel = vi.fn((entity: string, channel: FakeChannel) => {
    removeChannelCalls.push({ entity, channel });
  });

  return {
    notifyAboutIncomingMessage,
    logChannelError,
    logger,
    channels,
    removeChannelCalls,
    dbFrom,
    dbTable,
    dbChannel,
    dbRemoveChannel,
    setSeed(contacts: ConversationContact[], messages: RealtimeMessage[]) {
      seedContacts = contacts;
      seedMessages = messages;
    },
    getSeed: () => ({ seedContacts, seedMessages }),
  };
});

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: h.dbFrom,
  dbTable: h.dbTable,
  dbChannel: h.dbChannel,
  dbRemoveChannel: h.dbRemoveChannel,
}));

vi.mock('@/integrations/supabase/channelErrorLogging', () => ({
  logChannelError: h.logChannelError,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => h.logger,
}));

vi.mock('@/features/inbox/hooks/realtime/useRealtimeNotifications', () => ({
  useRealtimeNotifications: () => ({
    newMessageNotification: null,
    notifyAboutIncomingMessage: h.notifyAboutIncomingMessage,
    dismissNotification: vi.fn(),
    setSelectedContact: vi.fn(),
    setSoundEnabled: vi.fn(),
  }),
}));

vi.mock('@/features/inbox/hooks/realtime/messageSender', () => ({
  sendMessageToContact: vi.fn(),
}));

vi.mock('@/features/inbox/services/touchLastSeen', () => ({
  touchLastSeen: vi.fn(),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeContact(id: string, name: string): ConversationContact {
  return {
    id,
    name,
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    tags: [],
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
    whatsapp_connection_id: null,
    contact_type: null,
    group_category: null,
    ai_sentiment: null,
    channel_type: null,
    channel_connection_id: null,
    deleted_at: null,
    instance_name: null,
    remote_jid: null,
    routing_status: null,
  };
}

function makeMessage(id: string, contactId: string, overrides: Partial<RealtimeMessage> = {}): RealtimeMessage {
  return {
    id,
    contact_id: contactId,
    agent_id: null,
    content: 'conteudo',
    sender: 'contact',
    message_type: 'text',
    media_url: null,
    is_read: false,
    status: 'sent',
    status_updated_at: null,
    created_at: '2026-08-01T10:01:00Z',
    updated_at: '2026-08-01T10:01:00Z',
    external_id: null,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: false,
    ...overrides,
  };
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 60000 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Dispara o callback registrado de um evento postgres_changes no canal do orquestrador. */
function dispatchEvent(
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  payload: RealtimePostgresChangesPayload<RealtimeMessage>
) {
  const channel = h.channels[0];
  if (!channel) throw new Error('canal não criado — o hook não assinou?');
  const reg = channel.onCalls.find((c) => c.event === event);
  if (!reg) throw new Error(`callback ${event} não registrado`);
  act(() => reg.cb(payload as unknown as RealtimePostgresChangesPayload<Record<string, unknown>>));
}

function dispatchStatus(status: string) {
  const channel = h.channels[0];
  if (!channel?.statusCb) throw new Error('subscribe callback não registrado');
  act(() => channel.statusCb!(status));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.channels.length = 0;
  h.removeChannelCalls.length = 0;
});

describe('useRealtimeMessages — assinatura postgres_changes (fanout v2)', () => {
  it('assina INSERT/UPDATE no espelho realtime_message_fanout com canal determinístico (sem DELETE — RCA 2026-08-20)', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    const { result, unmount } = renderHook(() => useRealtimeMessages(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    // Canal determinístico (F4-03): dbChannel('messages', 'messages-realtime')
    expect(h.dbChannel).toHaveBeenCalledWith('messages', 'messages-realtime');
    expect(h.channels).toHaveLength(1);

    const regs = h.channels[0].onCalls;
    // RCA 2026-08-20 (7a63f35): handler DELETE removido de propósito — a purga
    // do cron rt-fanout-ttl não é deleção semântica; assinar DELETE saturava a
    // fila (972 invalidações/ciclo). Este expect trava a regressão.
    expect(regs.map((r) => r.event).sort()).toEqual(['INSERT', 'UPDATE']);
    for (const r of regs) {
      expect(r.filter).toMatchObject({ schema: 'zapp', table: 'realtime_message_fanout' });
      expect(['INSERT', 'UPDATE']).toContain(r.filter.event);
    }
    // subscribe registrou o callback de status
    expect(h.channels[0].statusCb).toBeTypeOf('function');

    unmount();
    expect(h.dbRemoveChannel).toHaveBeenCalledWith('messages', h.channels[0]);
  });
});

describe('useRealtimeMessages — transformação de payload do espelho', () => {
  it('mapeia from_me → sender (agent/contact) e deleted_at → is_deleted', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    const { result } = renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    // from_me: true → sender 'agent'
    dispatchEvent('INSERT', {
      eventType: 'INSERT',
      new: { ...makeMessage('m2', 'c1'), from_me: true as unknown as undefined, content: 'ola do agente' },
      old: undefined,
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);

    await waitFor(() => {
      const msgs = result.current.conversations[0].messages;
      expect(msgs.some((m) => m.id === 'm2' && m.sender === 'agent')).toBe(true);
    });

    // from_me: false → sender 'contact'
    dispatchEvent('INSERT', {
      eventType: 'INSERT',
      new: { ...makeMessage('m3', 'c1'), from_me: false as unknown as undefined },
      old: undefined,
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);

    await waitFor(() => {
      const msgs = result.current.conversations[0].messages;
      expect(msgs.some((m) => m.id === 'm3' && m.sender === 'contact')).toBe(true);
    });

    // deleted_at presente → is_deleted true
    dispatchEvent('INSERT', {
      eventType: 'INSERT',
      new: {
        ...makeMessage('m4', 'c1'),
        from_me: false as unknown as undefined,
        deleted_at: '2026-08-02T00:00:00Z',
      },
      old: undefined,
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);

    await waitFor(() => {
      const msgs = result.current.conversations[0].messages;
      const m4 = msgs.find((m) => m.id === 'm4');
      expect(m4?.is_deleted).toBe(true);
      expect(m4?.sender).toBe('contact');
    });
  });

  it('normaliza content null → "" na chegada (normalizeMessage)', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    const { result } = renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    dispatchEvent('INSERT', {
      eventType: 'INSERT',
      new: { ...makeMessage('m5', 'c1'), content: null as unknown as string },
      old: undefined,
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);

    await waitFor(() => {
      const m5 = result.current.conversations[0].messages.find((m) => m.id === 'm5');
      expect(m5?.content).toBe('');
    });
  });
});

describe('useRealtimeMessages — dedup de mensagens duplicadas', () => {
  it('INSERT com id já presente não duplica a mensagem na conversa', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    const { result } = renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));

    dispatchEvent('INSERT', {
      eventType: 'INSERT',
      new: { ...makeMessage('m1', 'c1') }, // mesmo id do seed
      old: undefined,
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);

    await act(async () => {});
    const msgs = result.current.conversations[0].messages;
    expect(msgs.filter((m) => m.id === 'm1')).toHaveLength(1);
    expect(msgs).toHaveLength(1);
  });

  it('INSERT duplicado NÃO re-dispara notificação (bug: notify rodava incondicional)', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    const { result } = renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    h.notifyAboutIncomingMessage.mockClear();

    // 1ª entrega (mensagem nova)
    dispatchEvent('INSERT', {
      eventType: 'INSERT',
      new: { ...makeMessage('m2', 'c1') },
      old: undefined,
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);
    await waitFor(() =>
      expect(result.current.conversations[0].messages.some((m) => m.id === 'm2')).toBe(true)
    );
    expect(h.notifyAboutIncomingMessage).toHaveBeenCalledTimes(1);

    // 2ª entrega (duplicata — reentrega do realtime)
    dispatchEvent('INSERT', {
      eventType: 'INSERT',
      new: { ...makeMessage('m2', 'c1') },
      old: undefined,
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);
    await act(async () => {});

    expect(result.current.conversations[0].messages.filter((m) => m.id === 'm2')).toHaveLength(1);
    // A duplicata não deve re-notificar
    expect(h.notifyAboutIncomingMessage).toHaveBeenCalledTimes(1);
  });
});

describe('useRealtimeMessages — DELETE (não assinado desde o RCA 2026-08-20)', () => {
  it('NÃO registra callback DELETE — purga do fanout não remove mensagens da conversa', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    const { result } = renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.conversations[0].messages).toHaveLength(1));

    // Regressão do RCA (7a63f35): se alguém reintroduzir o handler DELETE, o
    // dispatch abaixo passa a encontrar callback e este teste falha.
    expect(() =>
      dispatchEvent('DELETE', {
        eventType: 'DELETE',
        new: undefined,
        old: { ...makeMessage('m1', 'c1') },
      } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>)
    ).toThrow('callback DELETE não registrado');

    // Mensagens e conversa permanecem intactas — a purga do espelho é invisível.
    expect(result.current.conversations[0].messages).toHaveLength(1);
    expect(result.current.conversations).toHaveLength(1);
  });
});

describe('useRealtimeMessages — UPDATE via batcher', () => {
  it('UPDATE de status flui pelo useMessageUpdateBatcher e reflete na conversa', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    const { result } = renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.conversations[0].messages).toHaveLength(1));

    dispatchEvent('UPDATE', {
      eventType: 'UPDATE',
      new: { ...makeMessage('m1', 'c1'), status: 'read', is_read: true },
      old: { ...makeMessage('m1', 'c1'), status: 'sent', is_read: false },
    } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>);

    await waitFor(
      () => {
        const m1 = result.current.conversations[0].messages.find((m) => m.id === 'm1');
        expect(m1?.status).toBe('read');
      },
      { timeout: 3000 }
    );
    // unreadCount recalcula (mensagem do contato agora lida)
    await waitFor(() => expect(result.current.conversations[0].unreadCount).toBe(0), {
      timeout: 3000,
    });
  });
});

describe('useRealtimeMessages — erro de canal', () => {
  it('CHANNEL_ERROR sem SUBSCRIBED prévio é classificado via logChannelError', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(h.channels).toHaveLength(1));

    dispatchStatus('CHANNEL_ERROR');

    expect(h.logChannelError).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('useRealtimeMessages'),
      null, // nunca conectou nesta montagem
      'CHANNEL_ERROR'
    );
  });

  it('após SUBSCRIBED, CHANNEL_ERROR carrega o timestamp da última conexão', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(h.channels).toHaveLength(1));

    dispatchStatus('SUBSCRIBED');
    dispatchStatus('CHANNEL_ERROR');

    const calls = h.logChannelError.mock.calls;
    const lastCall = calls.length > 0 ? calls[calls.length - 1] : undefined;
    expect(lastCall?.[2]).toBeTypeOf('number'); // lastConnectedAtMs preenchido
  });

  it('TIMED_OUT também é classificado', async () => {
    h.setSeed([makeContact('c1', 'Alice')], [makeMessage('m1', 'c1')]);
    renderHook(() => useRealtimeMessages(), { wrapper: createWrapper() });
    await waitFor(() => expect(h.channels).toHaveLength(1));

    dispatchStatus('TIMED_OUT');

    expect(h.logChannelError).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('useRealtimeMessages'),
      null,
      'TIMED_OUT'
    );
  });
});
