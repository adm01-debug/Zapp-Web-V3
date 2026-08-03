import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryFetch } from './client';

/**
 * F9-04 — Política de retry do cliente supabase-js.
 *
 * Aceite do achado: "teste vitest com `fetch` mockado falhando 2x e sucedendo
 * na 3ª retorna dados sem erro ao chamador".
 *
 * O wrapper `retryFetch` é o `global.fetch` injetado no createClient. Ele só
 * lê `response.status` das respostas, então usamos fakes de objeto simples.
 *
 * Nota de implementação do mock: o rastreador de chamadas (`tracker`) delega
 * para `fetchImpl` — assim `mockRejectedValueOnce`/`mockResolvedValue*`
 * aplicados em `fetchImpl` NÃO apagam o registro de chamadas.
 */
const fakeResponse = (status: number) =>
  ({ status, ok: status >= 200 && status < 300 }) as Response;

const networkError = (): TypeError => new TypeError('Failed to fetch');

const REST_URL = 'https://supabase.test/rest/v1/contacts';
const AUTH_URL = 'https://supabase.test/auth/v1/token?grant_type=refresh_token';

describe('retryFetch — retry policy (F9-04)', () => {
  const calls: string[] = [];
  let fetchImpl: ReturnType<
    typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>
  >;

  beforeEach(() => {
    calls.length = 0;
    fetchImpl = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(() => Promise.reject(networkError()));
    const tracker = vi.fn((input: RequestInfo | URL) => {
      calls.push(String(input));
      return fetchImpl(input);
    });
    vi.stubGlobal('fetch', tracker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('falha de rede 2x e sucede na 3ª tentativa → dados retornam sem erro', async () => {
    vi.useFakeTimers();
    fetchImpl
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValueOnce(fakeResponse(200));

    const promise = retryFetch(REST_URL, { method: 'GET' });
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await promise;

    expect(response.status).toBe(200);
    // 3 tentativas no total (1 inicial + 2 retentativas) contra o mesmo alvo.
    expect(calls.filter((u) => u.includes('/rest/v1/contacts'))).toHaveLength(3);
  });

  it('HTTP 503 é retentado 2x e lança RetryableHttpError ao esgotar', async () => {
    vi.useFakeTimers();
    fetchImpl.mockResolvedValue(fakeResponse(503));

    const promise = retryFetch(REST_URL, { method: 'GET' });
    // Handler anexado ANTES de avançar os timers — evita unhandled rejection
    // enquanto o loop de retry conclui durante advanceTimersByTimeAsync.
    const assertion = expect(promise).rejects.toMatchObject({
      name: 'RetryableHttpError',
      status: 503,
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
    expect(calls.filter((u) => u.includes('/rest/v1/contacts'))).toHaveLength(3);
  });

  it('HTTP 429 é retentado (rate-limit é transitório)', async () => {
    vi.useFakeTimers();
    fetchImpl.mockResolvedValue(fakeResponse(429));

    const promise = retryFetch(REST_URL, { method: 'GET' });
    const assertion = expect(promise).rejects.toMatchObject({ name: 'RetryableHttpError' });
    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
    expect(calls.filter((u) => u.includes('/rest/v1/contacts'))).toHaveLength(3);
  });

  it('4xx de negócio (HTTP 400) NÃO é retentado — resposta retorna direto', async () => {
    fetchImpl.mockResolvedValue(fakeResponse(400));

    const response = await retryFetch(REST_URL, { method: 'GET' });

    expect(response.status).toBe(400);
    expect(calls.filter((u) => u.includes('/rest/v1/contacts'))).toHaveLength(1);
  });

  it('chamadas de auth (/auth/v1/) NÃO passam pelo retry — 1 tentativa apenas', async () => {
    await expect(retryFetch(AUTH_URL, { method: 'POST' })).rejects.toBeInstanceOf(TypeError);
    expect(calls.filter((u) => u.includes('/auth/v1/token'))).toHaveLength(1);
    // Deixa o report ao connectivityMonitor (fire-and-forget) assentar antes
    // do teardown, para não sobrar task pendente no happy-dom.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('abort do caller NÃO é retentado', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchImpl.mockImplementation(() => Promise.reject(abortError));
    controller.abort();

    const promise = retryFetch(REST_URL, {
      method: 'GET',
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(10_000);

    await assertion;
    expect(calls.filter((u) => u.includes('/rest/v1/contacts'))).toHaveLength(1);
  });
});
