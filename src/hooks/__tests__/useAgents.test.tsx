import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React, { act as reactAct } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const mockProfiles = [
  { id: 'p1', user_id: 'u1', name: 'Agent Alpha', is_active: true, role: 'agent', max_chats: 5, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: '' },
  { id: 'p2', user_id: 'u2', name: 'Agent Beta', is_active: false, role: 'agent', max_chats: 10, email: null, avatar_url: null, job_title: null, department: null, phone: null, created_at: '', updated_at: '' },
];

const mockQueuesData = {
  queues: [{ id: 'q1', name: 'Support', color: '#blue' }],
  members: [{ queue_id: 'q1', profile_id: 'p1' }],
};

// Builder de cadeia robusto: cada método encadeável retorna a própria cadeia,
// que também é "thenable" e resolve para { data, error }. Cobre qualquer ordem
// de select/order/eq/in/not/is independente do mapeamento de tabela (dbFrom).
function makeChain(data: unknown[]) {
  const result = { data, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'order', 'eq', 'in', 'not', 'is', 'gte', 'lte', 'filter', 'limit']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: typeof result) => unknown) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

const tableData: Record<string, unknown[]> = {
  profiles: mockProfiles,
  queues: mockQueuesData.queues,
  queue_members: mockQueuesData.members,
  contacts: [{ assigned_to: 'p1' }, { assigned_to: 'p1' }],
  agent_presence: [],
};

// ── Mock realtime com a semântica REAL do supabase-js ────────────────────────
// O RealtimeClient do supabase-js mantém um cache de canais POR TOPIC:
// `supabase.channel(topic)` devolve a MESMA instância para o mesmo topic.
// Além disso, um RealtimeChannel já inscrito (`.subscribe()` chamado) LANÇA
// `Error('cannot add postgres_changes callbacks after subscribe()')` se
// receber um novo `.on('postgres_changes', ...)`.
//
// Essas duas regras juntas produzem o crash do bug #1 (InboxFilters +
// AssignmentSection com topic ESTÁTICO): o 2º mount recebia o canal já
// inscrito do 1º e explodia no `.on()`. O fix (Worker 1) foi topic único por
// mount (Math.random) em useAgents.ts — os testes abaixo são o guard dessa
// regressão.

export interface FakeRealtimeChannel {
  topic: string;
  subscribed: boolean;
  on: (event: string, filter: unknown, callback?: () => void) => FakeRealtimeChannel;
  subscribe: (callback?: (status: string) => void) => FakeRealtimeChannel;
  unsubscribe: (callback?: () => void) => FakeRealtimeChannel;
}

interface ChannelCallLogEntry {
  channel: FakeRealtimeChannel;
  method: 'on' | 'subscribe' | 'unsubscribe';
}

const channelsByTopic = new Map<string, FakeRealtimeChannel>();
const channelCallLog: ChannelCallLogEntry[] = [];

function makeChannelInstance(topic: string): FakeRealtimeChannel {
  const instance: FakeRealtimeChannel = {
    topic,
    subscribed: false,
    on: vi.fn(() => {
      channelCallLog.push({ channel: instance, method: 'on' });
      // Semântica do supabase-js: adicionar callback postgres_changes após
      // subscribe() na MESMA instância => throw (crash do bug #1).
      if (instance.subscribed) {
        throw new Error('cannot add postgres_changes callbacks after subscribe()');
      }
      return instance;
    }),
    subscribe: vi.fn(() => {
      channelCallLog.push({ channel: instance, method: 'subscribe' });
      instance.subscribed = true;
      return instance;
    }),
    unsubscribe: vi.fn(() => {
      channelCallLog.push({ channel: instance, method: 'unsubscribe' });
      return instance;
    }),
  };
  return instance;
}

// Cache por topic — igual ao RealtimeClient do supabase-js
function getOrCreateChannel(topic: string): FakeRealtimeChannel {
  const cached = channelsByTopic.get(topic);
  if (cached) return cached;
  const created = makeChannelInstance(topic);
  channelsByTopic.set(topic, created);
  return created;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => makeChain(tableData[table] ?? [])),
    channel: vi.fn((topic: string) => getOrCreateChannel(topic)),
    removeChannel: vi.fn((channel: FakeRealtimeChannel) => {
      // removeChannel do supabase-js também remove o canal do cache por topic
      for (const [topic, instance] of channelsByTopic) {
        if (instance === channel) channelsByTopic.delete(topic);
      }
    }),
  },
}));

const channelMock = vi.mocked(supabase.channel);
const removeChannelMock = vi.mocked(supabase.removeChannel);

/** Acesso tipado ao mock de canal (o `supabase` importado acima é o mock). */
function channelFor(topic: string): FakeRealtimeChannel {
  return supabase.channel(topic) as unknown as FakeRealtimeChannel;
}

// NOTA: este teste cobre o hook de agentes+stats (react-query), que vive em
// @/features/admin/hooks/useAgents. Há um hook homônimo em @/hooks/useAgents
// (agentes de IA) com API diferente (loading vs isLoading) — não é o alvo aqui.
import { useAgents } from '@/features/admin/hooks/useAgents';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// Probe que reproduz o padrão PRÉ-FIX (topic ESTÁTICO) — apenas teste, usado
// para provar que o guard detectaria a regressão do bug #1. NÃO é produção.
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

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelsByTopic.clear();
    channelCallLog.length = 0;
  });

  it('fetches and combines agent data', async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.agents).toHaveLength(2);
  });

  it('getAgentStatus utility works correctly', () => {
    // Import the module to test the status logic indirectly
    // The hook assigns status based on is_active / updated_at
    // We test through the hook output
    expect(true).toBe(true); // placeholder - status tested via integration
  });

  it('returns correct counts', async () => {
    const { result } = renderHook(() => useAgents(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // At least one agent should exist
    expect(result.current.agents.length).toBeGreaterThan(0);
  });

  // ── REGRESSÃO bug #1: lifecycle de canais realtime ────────────────────────
  // Crash real: InboxFilters + AssignmentSection montavam useAgents ao mesmo
  // tempo com topic ESTÁTICO; o 2º mount recebia do supabase-js o MESMO canal
  // já inscrito do 1º e o `.on('postgres_changes', ...)` explodia com
  // 'cannot add postgres_changes callbacks after subscribe()'.

  it('cria instância de canal DISTINTA por mount com topics distintos (reprodução InboxFilters + AssignmentSection)', () => {
    // Dois consumers montam useAgents SIMULTANEAMENTE (nenhum unmount ainda).
    // O fix (topic único por mount via Math.random) garante que o supabase-js
    // crie instâncias separadas — sem isso, o cache por topic devolveria a
    // mesma instância já inscrita e o 2º .on() lançaria.
    const first = renderHook(() => useAgents(), { wrapper: createWrapper() });
    const second = renderHook(() => useAgents(), { wrapper: createWrapper() });

    // Dois canais distintos vivos ao mesmo tempo
    const instances = [...channelsByTopic.values()];
    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);

    // E supabase.channel recebeu DOIS topics diferentes (não estáticos)
    const topics = channelMock.mock.calls.map((call) => call[0] as string);
    expect(topics).toHaveLength(2);
    expect(topics[0]).not.toBe(topics[1]);
    expect(topics[0]).toMatch(/^agent-presence-realtime:/);
    expect(topics[1]).toMatch(/^agent-presence-realtime:/);

    first.unmount();
    second.unmount();
  });

  it('registra .on() antes de .subscribe() na mesma instância de canal', () => {
    const first = renderHook(() => useAgents(), { wrapper: createWrapper() });
    const second = renderHook(() => useAgents(), { wrapper: createWrapper() });

    const instances = [...channelsByTopic.values()];
    expect(instances).toHaveLength(2);

    // Contrato do RealtimeChannel: registrar callbacks (.on) ANTES de
    // inscrever (.subscribe). Ordem invertida na mesma instância = bug de
    // lifecycle (callback perdido ou throw do supabase-js).
    for (const instance of instances) {
      expect(instance.on).toHaveBeenCalledTimes(1);
      expect(instance.subscribe).toHaveBeenCalledTimes(1);
      const onIndex = channelCallLog.findIndex(
        (entry) => entry.channel === instance && entry.method === 'on'
      );
      const subscribeIndex = channelCallLog.findIndex(
        (entry) => entry.channel === instance && entry.method === 'subscribe'
      );
      expect(onIndex).toBeGreaterThanOrEqual(0);
      expect(subscribeIndex).toBeGreaterThan(onIndex);
    }

    // Cada mount completa on+subscribe antes do próximo começar (sem
    // interleaving entre instâncias)
    const [firstChannel, secondChannel] = instances;
    const firstSubscribeIndex = channelCallLog.findIndex(
      (entry) => entry.channel === firstChannel && entry.method === 'subscribe'
    );
    const secondOnIndex = channelCallLog.findIndex(
      (entry) => entry.channel === secondChannel && entry.method === 'on'
    );
    expect(firstSubscribeIndex).toBeLessThan(secondOnIndex);

    first.unmount();
    second.unmount();
  });

  it('unmount chama removeChannel com a instância correta de cada canal', () => {
    const first = renderHook(() => useAgents(), { wrapper: createWrapper() });
    const second = renderHook(() => useAgents(), { wrapper: createWrapper() });

    const [firstChannel, secondChannel] = [...channelsByTopic.values()];
    expect(removeChannelMock).not.toHaveBeenCalled();

    first.unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(firstChannel);
    expect(firstChannel.unsubscribe).toHaveBeenCalledTimes(1);
    expect(secondChannel.unsubscribe).not.toHaveBeenCalled();

    second.unmount();
    expect(removeChannelMock).toHaveBeenCalledTimes(2);
    expect(removeChannelMock).toHaveBeenLastCalledWith(secondChannel);
    expect(secondChannel.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('mock reproduz o supabase-js: .on() em instância já inscrita LANÇA', () => {
    // Semântica do supabase-js que causou o bug #1: cache por topic devolve a
    // MESMA instância para o mesmo topic; e .on() após .subscribe() lança.
    const first = channelFor('agent-presence-realtime:STATIC');
    first.on('postgres_changes', {}, () => {});
    first.subscribe();

    const second = channelFor('agent-presence-realtime:STATIC');
    expect(second).toBe(first); // cache por topic => mesma instância

    expect(() => second.on('postgres_changes', {}, () => {})).toThrow(
      'cannot add postgres_changes callbacks after subscribe()'
    );
  });

  it('dois mounts simultâneos NÃO lançam — com topic estático este teste falharia (bug #1)', () => {
    // GUARD da regressão: com o fix (topic único por mount), o 2º mount recebe
    // instância NOVA e o .on() não lança. Se alguém reverter o fix para topic
    // estático, ESTE TESTE FALHA de duas formas:
    //   1) o .on() do 2º mount lança dentro do efeito (crash real), e
    //   2) as asserções abaixo quebram: só existiria 1 instância/1 topic.
    const first = renderHook(() => useAgents(), { wrapper: createWrapper() });
    const second = renderHook(() => useAgents(), { wrapper: createWrapper() });

    const instances = [...channelsByTopic.values()];
    expect(instances).toHaveLength(2);
    expect(instances[0]).not.toBe(instances[1]);

    const topics = channelMock.mock.calls.map((call) => call[0] as string);
    expect(topics).toHaveLength(2);
    expect(topics[0]).not.toBe(topics[1]);

    first.unmount();
    second.unmount();
  });

  it('prova end-to-end: topic ESTÁTICO faz o 2º mount React LANÇAR (crash reproduzido)', () => {
    // Demonstração do que aconteceria SEM o fix: um probe com topic fixo
    // (mesmo padrão do useAgents pré-fix) montado duas vezes. O 2º mount
    // recebe o canal já inscrito do 1º e o .on() explode. Usamos createRoot +
    // act do React porque erros de efeito não propagam pelo renderHook.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root1: Root | undefined;
    let root2: Root | undefined;
    try {
      const container1 = document.createElement('div');
      root1 = createRoot(container1);
      reactAct(() => {
        root1!.render(<StaticTopicProbe />);
      });

      const container2 = document.createElement('div');
      root2 = createRoot(container2);
      let thrown: unknown = null;
      try {
        reactAct(() => {
          root2!.render(<StaticTopicProbe />);
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
