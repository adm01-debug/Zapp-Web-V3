/**
 * Teste-guarda genérico do lifecycle de canais Realtime — regressão do bug #1.
 *
 * Contexto: o RealtimeClient do supabase-js mantém um cache de canais POR
 * TOPIC — `supabase.channel(topic)` devolve a MESMA instância para o mesmo
 * topic — e um RealtimeChannel já inscrito (`.subscribe()` chamado) LANÇA
 * `Error('cannot add postgres_changes callbacks after subscribe()')` se
 * receber um novo `.on('postgres_changes', ...)`.
 *
 * Bug #1 (crash real em produção): InboxFilters + AssignmentSection montavam
 * `useAgents` simultaneamente com topic ESTÁTICO; o 2º mount recebia o canal
 * já inscrito do 1º e o `.on()` explodia. Fix aplicado (Worker 1): topic único
 * por mount (`Math.random`) em useAgents.ts.
 *
 * Este arquivo é um GUARD genérico e reutilizável: `createFakeRealtimeClient`
 * + `mountChannelLifecycle` reproduzem a semântica do supabase-js sem rede nem
 * React, e servem para qualquer hook que siga o padrão
 * `channel(topic).on(...).subscribe()` com cleanup
 * `unsubscribe()` + `removeChannel(channel)`.
 *
 * Regras verificadas:
 *   R1. cache por topic: mesmo topic => mesma instância de canal;
 *   R2. `.on()` após `.subscribe()` na mesma instância => throw;
 *   R3. `.on()` antes de `.subscribe()` na mesma instância (ordem correta);
 *   R4. unmount => `unsubscribe()` + `removeChannel(instância correta)`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React, { act as reactAct } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export interface FakeRealtimeChannel {
  topic: string;
  subscribed: boolean;
  on: (event: string, filter: unknown, callback?: () => void) => FakeRealtimeChannel;
  subscribe: (callback?: (status: string) => void) => FakeRealtimeChannel;
  unsubscribe: (callback?: () => void) => FakeRealtimeChannel;
}

export interface ChannelCallLogEntry {
  channel: FakeRealtimeChannel;
  method: 'on' | 'subscribe' | 'unsubscribe';
}

export interface FakeRealtimeClient {
  channel: (topic: string) => FakeRealtimeChannel;
  removeChannel: (channel: FakeRealtimeChannel) => void;
  from: (table: string) => unknown;
  channelsByTopic: Map<string, FakeRealtimeChannel>;
  createdChannels: FakeRealtimeChannel[];
  callLog: ChannelCallLogEntry[];
}

// Fábrica definida via vi.hoisted para poder ser usada tanto pelo vi.mock
// (que roda antes do corpo do módulo) quanto pelos testes.
const fakeSupabase = vi.hoisted(() => {
  function makeSelectChain() {
    const result = { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'in', 'not', 'is', 'gte', 'lte', 'filter', 'limit']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.then = (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve);
    return chain;
  }

  function createFakeRealtimeClient(): FakeRealtimeClient {
    const channelsByTopic = new Map<string, FakeRealtimeChannel>();
    const createdChannels: FakeRealtimeChannel[] = [];
    const callLog: ChannelCallLogEntry[] = [];

    // R1: cache por topic — mesmo topic devolve a MESMA instância.
    const channel = vi.fn((topic: string): FakeRealtimeChannel => {
      const cached = channelsByTopic.get(topic);
      if (cached) return cached;

      const instance: FakeRealtimeChannel = {
        topic,
        subscribed: false,
        // R2: .on() após .subscribe() na mesma instância => throw (supabase-js)
        on: vi.fn(() => {
          callLog.push({ channel: instance, method: 'on' });
          if (instance.subscribed) {
            throw new Error('cannot add postgres_changes callbacks after subscribe()');
          }
          return instance;
        }),
        subscribe: vi.fn(() => {
          callLog.push({ channel: instance, method: 'subscribe' });
          instance.subscribed = true;
          return instance;
        }),
        unsubscribe: vi.fn(() => {
          callLog.push({ channel: instance, method: 'unsubscribe' });
          return instance;
        }),
      };

      channelsByTopic.set(topic, instance);
      createdChannels.push(instance);
      return instance;
    });

    // removeChannel também limpa o cache por topic (como no supabase-js)
    const removeChannel = vi.fn((target: FakeRealtimeChannel) => {
      for (const [topic, instance] of channelsByTopic) {
        if (instance === target) channelsByTopic.delete(topic);
      }
    });

    return {
      channel,
      removeChannel,
      from: vi.fn(() => makeSelectChain()),
      channelsByTopic,
      createdChannels,
      callLog,
    };
  }

  const holder: { client?: FakeRealtimeClient } = {};
  return { createFakeRealtimeClient, holder };
});

vi.mock('@/integrations/supabase/client', () => {
  const client = fakeSupabase.createFakeRealtimeClient();
  fakeSupabase.holder.client = client;
  return { supabase: client };
});

// NOTA: o hook de agentes+stats (react-query) vive em
// @/features/admin/hooks/useAgents — é o caso conhecido-bom pós-fix (topic
// único por mount). Há um hook homônimo em @/hooks/useAgents (agentes de IA)
// com API diferente — não é o alvo aqui.
import { useAgents } from '@/features/admin';
import { supabase } from '@/integrations/supabase/client';

function getClient(): FakeRealtimeClient {
  const client = fakeSupabase.holder.client;
  if (!client) throw new Error('fake supabase client não inicializado pelo vi.mock');
  return client;
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // Sem JSX: o arquivo é .ts (JSX exige .tsx no plugin react-swc)
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

export interface MountedChannelLifecycle {
  channel: FakeRealtimeChannel;
  unmount: () => void;
}

/**
 * Monta o ciclo de vida de um canal exatamente como useAgents (e o padrão dos
 * hooks realtime): `channel(topic).on(...).subscribe()` e, no teardown,
 * `unsubscribe()` + `removeChannel(channel)`.
 */
export function mountChannelLifecycle(
  client: FakeRealtimeClient,
  topic: string
): MountedChannelLifecycle {
  const channel = client.channel(topic);
  channel.on('postgres_changes', { event: '*', schema: 'zapp', table: 'agent_presence' }, () => {});
  channel.subscribe();
  return {
    channel,
    unmount() {
      channel.unsubscribe();
      client.removeChannel(channel);
    },
  };
}

/** R3: na mesma instância, o índice de .on() no callLog é anterior ao de .subscribe(). */
function assertOnBeforeSubscribe(client: FakeRealtimeClient, channel: FakeRealtimeChannel) {
  const onIndex = client.callLog.findIndex(
    (entry) => entry.channel === channel && entry.method === 'on'
  );
  const subscribeIndex = client.callLog.findIndex(
    (entry) => entry.channel === channel && entry.method === 'subscribe'
  );
  expect(onIndex).toBeGreaterThanOrEqual(0);
  expect(subscribeIndex).toBeGreaterThan(onIndex);
}

// Probe com topic ESTÁTICO (padrão PRÉ-FIX) — apenas teste, NÃO é produção.
// Usado para provar end-to-end que 2 mounts com o mesmo topic falham.
function StaticTopicProbe() {
  React.useEffect(() => {
    const channel = supabase
      .channel('agent-presence-realtime:STATIC-PROBE')
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'agent_presence' }, () => {})
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);
  return null;
}

beforeEach(() => {
  const client = fakeSupabase.holder.client;
  if (!client) return;
  vi.clearAllMocks();
  client.channelsByTopic.clear();
  client.createdChannels.length = 0;
  client.callLog.length = 0;
});

describe('guarda genérico — fábrica de canal fake (semântica do supabase-js)', () => {
  it('R1+R2: 2 mounts com o MESMO topic falham — .on() do 2º lança', () => {
    const client = getClient();
    const first = mountChannelLifecycle(client, 'agent-presence-realtime:STATIC');

    // Cache por topic: o 2º mount recebe a MESMA instância já inscrita e o
    // .on() lança — exatamente o crash do bug #1.
    expect(() =>
      mountChannelLifecycle(client, 'agent-presence-realtime:STATIC')
    ).toThrow('cannot add postgres_changes callbacks after subscribe()');

    // O teardown do 1º mount não é afetado pelo crash do 2º
    first.unmount();
    expect(client.removeChannel).toHaveBeenCalledWith(first.channel);
  });

  it('R1+R2: 2 mounts com topics DISTINTOS passam — instâncias independentes', () => {
    const client = getClient();
    const first = mountChannelLifecycle(client, 'agent-presence-realtime:AAAA');
    const second = mountChannelLifecycle(client, 'agent-presence-realtime:BBBB');

    expect(client.createdChannels).toHaveLength(2);
    expect(client.channelsByTopic.size).toBe(2);
    expect(first.channel).not.toBe(second.channel);
    expect(first.channel.topic).not.toBe(second.channel.topic);

    first.unmount();
    second.unmount();
  });

  it('R3: .on() antes de .subscribe() na mesma instância', () => {
    const client = getClient();
    const first = mountChannelLifecycle(client, 'agent-presence-realtime:ORDER-A');
    const second = mountChannelLifecycle(client, 'agent-presence-realtime:ORDER-B');

    for (const channel of client.createdChannels) {
      assertOnBeforeSubscribe(client, channel);
    }

    first.unmount();
    second.unmount();
  });

  it('R4: unmount chama unsubscribe + removeChannel com a instância correta', () => {
    const client = getClient();
    const first = mountChannelLifecycle(client, 'agent-presence-realtime:CLEAN-A');
    const second = mountChannelLifecycle(client, 'agent-presence-realtime:CLEAN-B');

    expect(client.removeChannel).not.toHaveBeenCalled();

    first.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).toHaveBeenCalledWith(first.channel);
    expect(first.channel.unsubscribe).toHaveBeenCalledTimes(1);
    expect(second.channel.unsubscribe).not.toHaveBeenCalled();

    second.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(2);
    expect(client.removeChannel).toHaveBeenLastCalledWith(second.channel);
    expect(second.channel.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('useAgents (caso conhecido-bom pós-fix) contra o cliente fake', () => {
  it('2 mounts simultâneos usam topics distintos e NÃO lançam', () => {
    const client = getClient();
    const first = renderHook(() => useAgents(), { wrapper: createWrapper() });
    const second = renderHook(() => useAgents(), { wrapper: createWrapper() });

    expect(client.channel).toHaveBeenCalledTimes(2);
    expect(client.createdChannels).toHaveLength(2);

    const [channelA, channelB] = client.createdChannels;
    expect(channelA).not.toBe(channelB);
    expect(channelA.topic).not.toBe(channelB.topic);
    expect(channelA.topic).toMatch(/^agent-presence-realtime:/);
    expect(channelB.topic).toMatch(/^agent-presence-realtime:/);

    for (const channel of client.createdChannels) {
      assertOnBeforeSubscribe(client, channel);
    }

    first.unmount();
    second.unmount();
  });

  it('unmount de useAgents remove o canal correto', () => {
    const client = getClient();
    const first = renderHook(() => useAgents(), { wrapper: createWrapper() });
    const second = renderHook(() => useAgents(), { wrapper: createWrapper() });

    const [channelA, channelB] = client.createdChannels;
    expect(client.removeChannel).not.toHaveBeenCalled();

    first.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).toHaveBeenCalledWith(channelA);
    expect(channelA.unsubscribe).toHaveBeenCalledTimes(1);
    expect(channelB.unsubscribe).not.toHaveBeenCalled();

    second.unmount();
    expect(client.removeChannel).toHaveBeenCalledTimes(2);
    expect(client.removeChannel).toHaveBeenLastCalledWith(channelB);
    expect(channelB.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('prova end-to-end do crash (bug #1) com topic estático', () => {
  it('2 mounts React com o MESMO topic: o 2º LANÇA no .on()', () => {
    // Erros de efeito não propagam pelo renderHook (React 18 só loga), então
    // usamos createRoot + act do React para capturar o throw real.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root1: Root | undefined;
    let root2: Root | undefined;
    try {
      const container1 = document.createElement('div');
      root1 = createRoot(container1);
      reactAct(() => {
        root1!.render(React.createElement(StaticTopicProbe));
      });

      const container2 = document.createElement('div');
      root2 = createRoot(container2);
      let thrown: unknown = null;
      try {
        reactAct(() => {
          root2!.render(React.createElement(StaticTopicProbe));
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe(
        'cannot add postgres_changes callbacks after subscribe()'
      );
    } finally {
      const root1Cleanup = root1;
      const root2Cleanup = root2;
      try {
        if (root1Cleanup) reactAct(() => root1Cleanup.unmount());
      } catch {
        // cleanup defensivo
      }
      try {
        if (root2Cleanup) reactAct(() => root2Cleanup.unmount());
      } catch {
        // root2 falhou no mount — unmount pode não ser seguro
      }
      errorSpy.mockRestore();
    }
  });
});
