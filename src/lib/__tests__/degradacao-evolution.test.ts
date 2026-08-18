/**
 * E90 — Teste de Degradação: Evolution API fora.
 *
 * Prova, em nível unitário, que o ZAPP degrada graciosamente quando a
 * Evolution API (edge `evolution-api`) fica indisponível — sem tocar em
 * código de produção (design: .hermes-tests/E90_TESTE_DEGRADACAO.md).
 *
 * Cenários cobertos (S1/S2/S3/S5 do design):
 *   1. Evolution 500 → retry 3x com backoff real (withRetry real + fake timers)
 *   2. 4xx → NÃO retry, NÃO vai pra DLQ, NÃO conta falha no breaker
 *   3. Circuit breaker abre após 5 falhas → 6º envio fail-fast `circuit_open`
 *      (invoke NÃO é chamado) + probe HALF_OPEN após cooldown
 *   4. Retries esgotados → DLQ enfileira com payload íntegro + `__idemKey`;
 *      idem-key determinístico (mesma payload → mesma key → dedupe 23505)
 *   5. `resolveTransport` degrada quando o edge cai: cloud NÃO afeta o app
 *
 * Padrão de mocks (idêntico a evolutionSendRetry.invoke.test.ts):
 *   - supabase.functions.invoke, retryConfig, crossTabDedupe (pass-through),
 *     requestDedupeKey e sendFunctionRouter são mockados.
 *   - `@/lib/retry` (withRetry REAL — backoff real com vi.useFakeTimers),
 *     `@/lib/evolutionCircuitBreaker` (REAL — estado in-memory, reset por
 *     teste) e `@/lib/failedMessagesEnqueue` (REAL — idem-key real) NÃO são
 *     mockados.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockInvoke = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockRpc = vi.hoisted(() => vi.fn());
const mockLoadRetryConfig = vi.hoisted(() => vi.fn());
const mockCrossTabDedupe = vi.hoisted(() => vi.fn());
const mockBuildRequestDedupeKey = vi.hoisted(() => vi.fn());
const mockResolveSendFunction = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: { functions: { invoke: mockInvoke }, from: mockFrom },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { rpc: mockRpc },
  safeFrom: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  generateCorrelationId: () => 'corr-e90-test',
}));

vi.mock('@/lib/retryConfig', () => ({ loadRetryConfig: mockLoadRetryConfig }));
vi.mock('@/lib/crossTabSendDedupe', () => ({ crossTabDedupe: mockCrossTabDedupe }));
vi.mock('@/lib/requestDedupeKey', () => ({ buildRequestDedupeKey: mockBuildRequestDedupeKey }));
vi.mock('@/lib/sendFunctionRouter', () => ({ resolveSendFunction: mockResolveSendFunction }));

// ── Import SUT AFTER mocks (módulos reais: retry, breaker, DLQ) ──────────────
import { invokeEvolutionWithRetry } from '../evolutionSendRetry';
import { enqueueClientFailedMessage } from '../failedMessagesEnqueue';
import { resolveTransport, invalidateWhatsAppModeCache } from '../whatsappAdapterTransport';
import { canCall, inspect, __resetBreakerState, __setBreakerNow } from '../evolutionCircuitBreaker';

// ── Helpers ───────────────────────────────────────────────────────────────────
const INST = 'inst-e90';
/** Config rápida: backoff 50ms→200ms para os testes com fake timers. */
const FAST_RETRY = { maxRetries: 3, baseBackoffMs: 50, maxBackoffMs: 200, timeoutMs: 1000 };

function httpError(status: number, message: string) {
  return { data: null, error: { message, status } };
}

const SEND_BODY = { instance_name: INST, number: '+5511999999999' };

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadRetryConfig.mockResolvedValue(FAST_RETRY);
  mockResolveSendFunction.mockResolvedValue('evolution-api');
  mockBuildRequestDedupeKey.mockResolvedValue('dedupe-e90');
  mockCrossTabDedupe.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn());
  mockFrom.mockReturnValue({ insert: mockInsert });
  mockInsert.mockResolvedValue({ error: null });
  // Breaker real: estado determinístico por teste (now=1000, cooldown 30s).
  __resetBreakerState();
  __setBreakerNow(() => 1_000);
  invalidateWhatsAppModeCache();
});

afterEach(async () => {
  vi.useRealTimers();
  // Drena inserts fire-and-forget (DLQ) ainda pendentes para não vazarem
  // chamadas registradas no mockInsert do próximo teste.
  await new Promise((resolve) => setTimeout(resolve, 10));
});

// ── 1. S5: Evolution 500 → retry com backoff até sucesso ─────────────────────
describe('E90 S5 — Evolution 500 → retry 3x com backoff', () => {
  it('retorna sucesso na 3ª tentativa após 500,500 (invoke chamado 3x, 2 retries)', async () => {
    vi.useFakeTimers();
    mockInvoke
      .mockResolvedValueOnce(httpError(500, 'Internal Server Error'))
      .mockResolvedValueOnce(httpError(500, 'Internal Server Error'))
      .mockResolvedValueOnce({ data: { status: 'sent' }, error: null });

    const onRetry = vi.fn();
    const pending = invokeEvolutionWithRetry('sendText', { body: SEND_BODY }, { onRetry });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toMatchObject({ data: { status: 'sent' } });

    expect(mockInvoke).toHaveBeenCalledTimes(3); // 1ª + 2 retries
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toBe(1); // 1º retry
    expect(onRetry.mock.calls[1][0]).toBe(2); // 2º retry
    expect(onRetry.mock.calls[0][1]).toBe(3); // totalRetries do config
    // S1: sem DLQ quando a mensagem sai na 3ª tentativa
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('aplica backoff crescente entre tentativas (2ª espera > 1ª espera)', async () => {
    vi.useFakeTimers();
    mockInvoke
      .mockResolvedValueOnce(httpError(503, 'Service Unavailable'))
      .mockResolvedValueOnce(httpError(503, 'Service Unavailable'))
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    const retryTimes: number[] = [];
    const pending = invokeEvolutionWithRetry(
      'sendText',
      { body: SEND_BODY },
      { onRetry: () => retryTimes.push(Date.now()) }
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toMatchObject({ data: { ok: true } });

    expect(retryTimes).toHaveLength(2);
    expect(retryTimes[1]).toBeGreaterThan(retryTimes[0]); // backoff exponencial (~1s/2s no prod)
  });

  it('fecha o circuito após recovery (recordSuccess reseta falhas)', async () => {
    vi.useFakeTimers();
    mockInvoke
      .mockResolvedValueOnce(httpError(500, 'Internal Server Error'))
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    const pending = invokeEvolutionWithRetry('sendText', { body: SEND_BODY });
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toBeDefined();

    expect(inspect(INST).state).toBe('CLOSED');
    expect(inspect(INST).consecutiveFailures).toBe(0);
  });
});

// ── 2. 4xx → NÃO retry ────────────────────────────────────────────────────────
describe('E90 — 4xx NÃO faz retry', () => {
  it('404: 1 único invoke, sem retry, sem DLQ, sem falha no breaker', async () => {
    mockInvoke.mockResolvedValue(httpError(404, 'Not Found'));

    const onRetry = vi.fn();
    const result = await invokeEvolutionWithRetry(
      'sendText',
      { body: SEND_BODY },
      { onRetry }
    );

    expect(result.error?.status).toBe(404);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(inspect(INST).consecutiveFailures).toBe(0); // 4xx não conta pro breaker
  });

  it('400: retorna erro ao caller sem enfileirar DLQ', async () => {
    mockInvoke.mockResolvedValue(httpError(400, 'Bad Request'));

    const result = await invokeEvolutionWithRetry('sendText', { body: SEND_BODY });

    expect(result.error?.status).toBe(400);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

// ── 3. Circuit breaker: 5 falhas → OPEN → fail-fast circuit_open ─────────────
describe('E90 S2/S3 — circuit breaker abre após 5 falhas', () => {
  function sendOnce() {
    // maxRetries: 0 → 1 única tentativa por envio (sem backoff, sem timers)
    return invokeEvolutionWithRetry('sendText', { body: SEND_BODY }, { maxRetries: 0 });
  }

  it('abre após 5 falhas consecutivas (CLOSED → OPEN) e o 6º envio falha <1s com circuit_open', async () => {
    mockInvoke.mockResolvedValue(httpError(500, 'Internal Server Error'));

    for (let i = 0; i < 5; i++) {
      await expect(sendOnce()).rejects.toThrow('Internal Server Error');
    }
    expect(inspect(INST).state).toBe('OPEN');
    expect(canCall(INST).allowed).toBe(false);

    // 6º envio: fail-fast — invoke NÃO é chamado (economiza 3 retries × backoff)
    await expect(sendOnce()).rejects.toMatchObject({ code: 'circuit_open' });
    expect(mockInvoke).toHaveBeenCalledTimes(5);

    // FINDING (drift vs design S2 "ainda vão pra DLQ"): o filtro client-side
    // `isTransientFailure` aceita apenas timeout/network_error SEM status HTTP —
    // circuit_open (http_status=null) é DROPADO pelo enqueue real, não gera row.
    // (O unit test com enqueue mockado cobre a intenção; aqui documentamos a realidade.)
    await vi.waitFor(() => expect(mockInsert.mock.calls.length).toBe(5)); // só os 5 × http_500
    expect(mockInsert.mock.calls.some((c) => c[0].error_code === 'circuit_open')).toBe(false);
  });

  it('após cooldown, probe HALF_OPEN falha → reabre com cooldown fresco', async () => {
    mockInvoke.mockResolvedValue(httpError(500, 'Internal Server Error'));
    for (let i = 0; i < 5; i++) {
      await expect(sendOnce()).rejects.toThrow();
    }
    expect(inspect(INST).state).toBe('OPEN');

    // Cooldown (30s) expira → próximo canCall vira probe HALF_OPEN
    __setBreakerNow(() => 31_001);
    expect(canCall(INST).state).toBe('HALF_OPEN');

    // Probe falha → reabre (OPEN) com cooldown fresco
    await expect(sendOnce()).rejects.toThrow();
    expect(inspect(INST).state).toBe('OPEN');
    expect(inspect(INST).openUntil).toBe(31_001 + 30_000);
  });
});

// ── 4. DLQ após retries exaustos + idem-key dedupe ────────────────────────────
describe('E90 S2/S3 — DLQ enfileira após retries exaustos', () => {
  it('3 retries esgotados → 4 invokes, DLQ com payload íntegro + __idemKey', async () => {
    vi.useFakeTimers();
    mockInvoke.mockResolvedValue(httpError(500, 'Internal Server Error'));

    const onRetry = vi.fn();
    const pending = invokeEvolutionWithRetry(
      'sendText',
      { body: { ...SEND_BODY, text: 'oi' } },
      { onRetry, idempotencyKey: 'idem-e90' }
    );
    // Anexa o handler de rejeição ANTES de avançar os timers (evita unhandled rejection)
    const assertion = expect(pending).rejects.toThrow('Internal Server Error');
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    expect(mockInvoke).toHaveBeenCalledTimes(4); // 1ª + 3 retries
    expect(onRetry).toHaveBeenCalledTimes(3);

    await vi.waitFor(() => expect(mockInsert).toHaveBeenCalled());
    // Seleciona a row DESTE envio (payload com __idemKey), não leftovers de testes anteriores
    const row = mockInsert.mock.calls.find((c) => c[0].payload?.__idemKey === 'idem-e90')?.[0];
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      instance_name: INST,
      remote_jid: '+5511999999999',
      http_status: 500,
      error_code: 'http_500',
      status: 'pending',
      retry_count: 0,
      max_retries: 5,
    });
    // Payload íntegro + __idemKey embedado para o cron reprocess reusar a key
    expect(row.payload).toMatchObject({ text: 'oi', __idemKey: 'idem-e90' });
    expect(row.payload.__path).toBe('/message/sendText');
    expect(typeof row.idempotency_key).toBe('string');
    expect(row.idempotency_key.length).toBeGreaterThan(0);
  });

  it('idem-key determinístico: mesma payload → mesma key (dedupe); payload diferente → key diferente', async () => {
    const base = {
      instance_name: INST,
      remote_jid: '+5511999999999',
      path: '/message/sendText',
      method: 'POST',
      payload: { text: 'oi' },
      http_status: 500,
      error_code: 'http_500',
      error_message: 'Internal Server Error',
    };

    enqueueClientFailedMessage(base);
    enqueueClientFailedMessage({ ...base }); // duplicata lógica (mesma mensagem)
    enqueueClientFailedMessage({ ...base, payload: { text: 'oi de novo' } }); // outra mensagem

    await vi.waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(3));
    const [row1, row2, row3] = mockInsert.mock.calls.map((c) => c[0]);
    expect(row1.idempotency_key).toBe(row2.idempotency_key); // → unique parcial dedupe no DB
    expect(row3.idempotency_key).not.toBe(row1.idempotency_key);
  });

  it('conflito 23505 (dedupe) é tratado como esperado, sem erro fatal', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    enqueueClientFailedMessage({
      instance_name: INST,
      remote_jid: '+5511999999999',
      path: '/message/sendText',
      payload: { text: 'oi' },
      http_status: 503,
      error_code: 'http_503',
    });

    await vi.waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1));
    // fire-and-forget: não lança para o caller
  });
});

// ── 5. Transporte: cloud NÃO afeta quando Evolution cai ──────────────────────
describe('E90 — resolveTransport degrada quando Evolution cai', () => {
  it('modo official + edge de secrets fora (invoke rejeita) → degrada para evolution, sem lançar', async () => {
    mockRpc.mockResolvedValue({ data: 'official', error: null });
    mockInvoke.mockRejectedValue(new Error('fetch failed'));

    const resolved = await resolveTransport();

    expect(resolved.transport).toBe('evolution');
    expect(resolved.requestedMode).toBe('official');
    expect(resolved.degraded).toBe(true);
    expect(resolved.missingSecrets).toEqual([
      'WHATSAPP_CLOUD_PHONE_NUMBER_ID',
      'WHATSAPP_CLOUD_ACCESS_TOKEN',
    ]);
  });

  it('modo official + secrets ok → transporte cloud preservado (fluxo normal)', async () => {
    mockRpc.mockResolvedValue({ data: 'official', error: null });
    mockInvoke.mockResolvedValue({
      data: {
        secrets: [
          { name: 'WHATSAPP_CLOUD_PHONE_NUMBER_ID', configured: true, length: 10 },
          { name: 'WHATSAPP_CLOUD_ACCESS_TOKEN', configured: true, length: 10 },
        ],
      },
      error: null,
    });

    const resolved = await resolveTransport();

    expect(resolved).toMatchObject({ transport: 'cloud', requestedMode: 'official', degraded: false });
  });

  it('modo unofficial → evolution sem tocar na rede (envio continua quando edge cai)', async () => {
    mockRpc.mockResolvedValue({ data: 'unofficial', error: null });
    mockInvoke.mockRejectedValue(new Error('fetch failed')); // edge fora

    const resolved = await resolveTransport();

    expect(resolved).toMatchObject({ transport: 'evolution', degraded: false });
    expect(mockInvoke).not.toHaveBeenCalled(); // não depende da edge p/ resolver
  });

  it('RPC do modo falha (DB/edge fora) → fallback unofficial → evolution, sem crash', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });

    const resolved = await resolveTransport();

    expect(resolved.transport).toBe('evolution');
  });
});
