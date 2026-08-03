import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryFetch } from '../client';

/**
 * Testes de simulação do concurrency gate do Supabase client
 * (src/integrations/supabase/client.ts).
 *
 * O gate limita a MAX_CONCURRENT=6 requests não-auth em voo; o excedente
 * espera em fila com dreno serial de 80ms por item (CONCURRENT_DRAIN_DELAY_MS).
 * Requests de auth (/auth/v1/) NUNCA passam pelo gate.
 *
 * `_acquireSlot`/`_releaseSlot`/`boundedFetch` não são exportados — o teste
 * exercita o comportamento observável do gate através do `retryFetch`
 * (o global.fetch injetado no createClient), com um mock de fetch que
 * controla quando cada request resolve e rastreia o número de requests em voo.
 *
 * Estratégia de timers: `vi.useFakeTimers()` — o dreno de 80ms e o timeout
 * de 12s do boundedFetch são fake; microtasks não são faked, então usamos
 * `flush()` para assentar promessas sem avançar o relógio.
 */
const REST_URL = (id: number) => `https://supabase.test/rest/v1/table?select=*&id=${id}`;
const AUTH_URL = 'https://supabase.test/auth/v1/token?grant_type=refresh_token';

const fakeResponse = (status = 200) =>
  ({ status, ok: status >= 200 && status < 300 }) as Response;

/** Assenta a fila de microtasks sem avançar timers fake. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

interface PendingFetch {
  url: string;
  resolve: (res: Response) => void;
}

interface FetchSimState {
  active: number;
  maxActive: number;
  started: number;
  resolved: number;
  urls: string[];
  pending: PendingFetch[];
  releaseNext(): string | undefined;
  releaseAll(): number;
  releaseByUrl(url: string): boolean;
}

interface FetchSim {
  impl: ReturnType<typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>>;
  state: FetchSimState;
}

/**
 * Mock de fetch controlável: cada chamada fica pendente até o teste
 * resolvê-la (release*). Rastreia quantos requests estão em voo (active),
 * o pico (maxActive), ordem de início (urls) e quantos terminaram (resolved).
 */
function createFetchSim(): FetchSim {
  const state: FetchSimState = {
    active: 0,
    maxActive: 0,
    started: 0,
    resolved: 0,
    urls: [],
    pending: [],
    releaseNext(): string | undefined {
      const p = state.pending.shift();
      if (!p) return undefined;
      state.active--;
      state.resolved++;
      p.resolve(fakeResponse(200));
      return p.url;
    },
    releaseAll(): number {
      let n = 0;
      while (state.pending.length > 0) {
        state.releaseNext();
        n++;
      }
      return n;
    },
    releaseByUrl(url: string): boolean {
      const idx = state.pending.findIndex((p) => p.url === url);
      if (idx === -1) return false;
      const [p] = state.pending.splice(idx, 1);
      state.active--;
      state.resolved++;
      p.resolve(fakeResponse(200));
      return true;
    },
  };

  const impl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    (input: RequestInfo | URL) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      state.active++;
      state.started++;
      state.maxActive = Math.max(state.maxActive, state.active);
      state.urls.push(url);
      return new Promise<Response>((resolve) => {
        state.pending.push({ url, resolve });
      });
    }
  );

  return { impl, state };
}

describe('Supabase client — concurrency gate (MAX_CONCURRENT=6, drain=80ms)', () => {
  let sim: FetchSim;

  beforeEach(() => {
    vi.useFakeTimers();
    sim = createFetchSim();
    vi.stubGlobal('fetch', sim.impl);
  });

  afterEach(async () => {
    // Varredura de segurança: drena o gate do módulo (in-flight + fila) para
    // não vazar estado entre testes. Cada rodada libera os slots ocupados e
    // avança 80ms para drenar até 6 itens da fila; 12 rodadas cobrem o
    // cenário de stress (50 requests).
    for (let i = 0; i < 12; i++) {
      sim.state.releaseAll();
      await vi.advanceTimersByTimeAsync(80);
    }
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('1) _acquireSlot/_releaseSlot: 7 simultâneas → 6 resolvem imediatamente, 7ª espera na fila', async () => {
    const results: number[] = [];
    const promises = Array.from({ length: 7 }, (_, i) =>
      retryFetch(REST_URL(i), { method: 'GET' }).then(() => {
        results.push(i);
      })
    );

    // Rajada disparada no mesmo microtask: apenas 6 requests começam.
    await flush();
    expect(sim.state.started).toBe(6);
    expect(sim.state.maxActive).toBe(6);
    expect(sim.state.pending).toHaveLength(6);

    // As 6 primeiras resolvem IMEDIATAMENTE (sem avançar os 80ms do dreno).
    sim.state.releaseAll();
    await flush();
    expect(sim.state.resolved).toBe(6);
    expect(sim.state.started).toBe(6); // a 7ª continua esperando na fila

    // A 7ª só entra em voo após o dreno de 80ms.
    await vi.advanceTimersByTimeAsync(79);
    expect(sim.state.started).toBe(6); // 79ms: ainda enfileirada
    await vi.advanceTimersByTimeAsync(1);
    expect(sim.state.started).toBe(7); // 80ms: drenada

    sim.state.releaseAll();
    await flush();
    await expect(Promise.all(promises)).resolves.toHaveLength(7);
    expect(sim.state.resolved).toBe(7);
    expect(results).toHaveLength(7);
  });

  it('2) _releaseSlot: drena a fila serialmente — 1 item a cada 80ms', async () => {
    const promises = Array.from({ length: 9 }, (_, i) => retryFetch(REST_URL(i), { method: 'GET' }));
    await flush();
    expect(sim.state.started).toBe(6); // 3 na fila

    // Libera 1 slot → próximo item só inicia após exatos 80ms.
    sim.state.releaseNext();
    await vi.advanceTimersByTimeAsync(0);
    expect(sim.state.resolved).toBe(1);
    expect(sim.state.started).toBe(6);

    await vi.advanceTimersByTimeAsync(79);
    expect(sim.state.started).toBe(6); // 79ms: ainda não drenou
    await vi.advanceTimersByTimeAsync(1);
    expect(sim.state.started).toBe(7); // 80ms: exatamente 1 item drenado

    sim.state.releaseNext();
    await vi.advanceTimersByTimeAsync(80);
    expect(sim.state.started).toBe(8); // 2º dreno: +80ms, 1 item

    sim.state.releaseNext();
    await vi.advanceTimersByTimeAsync(80);
    expect(sim.state.started).toBe(9); // 3º dreno: +80ms, 1 item

    sim.state.releaseAll();
    await flush();
    await expect(Promise.all(promises)).resolves.toBeDefined();
    expect(sim.state.resolved).toBe(9);
    expect(sim.state.maxActive).toBe(6); // nunca estourou o teto
  });

  it('3) boundedFetch: 10 fetchs simultâneos → apenas 6 em voo, nenhum perdido', async () => {
    const resolvedIds: number[] = [];
    const promises = Array.from({ length: 10 }, (_, i) =>
      retryFetch(REST_URL(i), { method: 'GET' }).then((r) => {
        resolvedIds.push(i);
        return r;
      })
    );

    await flush();
    expect(sim.state.started).toBe(6);
    expect(sim.state.maxActive).toBe(6);
    expect(sim.state.pending).toHaveLength(6); // 4 enfileirados

    // Libera os 6 em voo → os 4 da fila entram em voo após o dreno de 80ms.
    sim.state.releaseAll();
    await vi.advanceTimersByTimeAsync(80);
    expect(sim.state.started).toBe(10);
    expect(sim.state.maxActive).toBe(6); // teto respeitado em todo o ciclo

    sim.state.releaseAll();
    await flush();
    const responses = await Promise.all(promises);
    expect(responses).toHaveLength(10);
    expect(sim.state.resolved).toBe(10);
    expect(resolvedIds.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('4) requests de auth (/auth/v1/) NUNCA passam pelo gate', async () => {
    // Ocupa os 6 slots com requests lentos não-auth.
    const slow = Array.from({ length: 6 }, (_, i) => retryFetch(REST_URL(i), { method: 'GET' }));
    await flush();
    expect(sim.state.started).toBe(6);

    // Auth request dispara IMEDIATAMENTE com os 6 slots ocupados.
    const authPromise = retryFetch(AUTH_URL, { method: 'POST' });
    await flush();
    expect(sim.state.started).toBe(7);
    expect(sim.state.urls).toContain(AUTH_URL);

    // Auth resolve sem esperar slot algum (sem passar pelo dreno de 80ms).
    expect(sim.state.releaseByUrl(AUTH_URL)).toBe(true);
    await flush();
    await expect(authPromise).resolves.toMatchObject({ status: 200 });
    expect(sim.state.resolved).toBe(1);

    // Liberar auth NÃO libera slot: novo request não-auth continua na fila.
    const extra = retryFetch(REST_URL(99), { method: 'GET' });
    await flush();
    expect(sim.state.started).toBe(7); // não começou
    await vi.advanceTimersByTimeAsync(80);
    expect(sim.state.started).toBe(7); // continua enfileirado (nenhum slot real liberado)

    // Só um slot real liberado faz o enfileirado entrar em voo.
    sim.state.releaseNext(); // libera 1 dos 6 não-auth
    await vi.advanceTimersByTimeAsync(80);
    expect(sim.state.started).toBe(8); // extra entrou em voo
    expect(sim.state.urls).toContain(REST_URL(99));

    sim.state.releaseAll();
    await flush();
    await expect(Promise.all([...slow, extra])).resolves.toBeDefined();
    expect(sim.state.resolved).toBe(8);
  });

  it('5) stress: 50 requests em rajada — gate serializa sem perder nenhum', async () => {
    const results: string[] = [];
    const promises = Array.from({ length: 50 }, (_, i) =>
      retryFetch(REST_URL(i), { method: 'GET' }).then(() => {
        results.push(String(i));
      })
    );

    await flush();
    expect(sim.state.started).toBe(6);
    expect(sim.state.maxActive).toBe(6);
    expect(sim.state.pending).toHaveLength(6);

    // Drena em ondas: cada onda libera 6 slots; itens enfileirados entram
    // em voo 80ms depois. 44 enfileirados / 6 por onda = 8 ondas.
    let waves = 0;
    while (sim.state.started < 50) {
      sim.state.releaseAll();
      await vi.advanceTimersByTimeAsync(80);
      waves++;
    }
    expect(sim.state.started).toBe(50);
    expect(waves).toBe(8);
    expect(sim.state.maxActive).toBe(6); // teto respeitado na rajada inteira

    sim.state.releaseAll();
    await flush();
    await expect(Promise.all(promises)).resolves.toHaveLength(50);
    expect(sim.state.resolved).toBe(50);
    // Nenhum request perdido nem duplicado.
    expect(sim.state.urls).toHaveLength(50);
    expect(new Set(sim.state.urls).size).toBe(50);
    expect(results).toHaveLength(50);

    // Gate totalmente drenado (fila vazia, counter zerado): um novo request
    // começa imediatamente, sem esperar dreno residual.
    const probe = retryFetch(REST_URL(999), { method: 'GET' });
    await flush();
    expect(sim.state.started).toBe(51);
    expect(sim.state.active).toBe(1);
    sim.state.releaseAll();
    await flush();
    await expect(probe).resolves.toMatchObject({ status: 200 });
    expect(sim.state.resolved).toBe(51);
  });
});
