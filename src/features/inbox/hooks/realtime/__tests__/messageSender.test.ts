/**
 * TDD E34 — messageSender.ts · sendMessageToContact (caminho crítico de envio)
 *
 * Contratos (spec fase-04, etapa 34 — PLANO-100-ETAPAS, fases-para-repo/fase-04):
 *   34.2  envio feliz → retorna id e publica status 'sent' no sendStatusBus
 *   34.3  in-flight dedup: 2 chamadas simultâneas da MESMA mensagem lógica
 *         executam UM insert no DB (zapp.messages) e UM fetch à Evolution
 *         (spy); ambas resolvem com o MESMO resultado
 *   34.4  o dedup é uma promise compartilhada POR CHAVE — sem dupla inserção
 *   34.5  PROFILE_CACHE_TTL = 5min: perfil resolvido não é re-buscado em
 *         <5min; após o TTL há nova busca (fake timers)
 *   34.7  auth (401/403) → status failed_auth + error_code + error_reason
 *   34.9  falha → status de falha persistido (failed/failed_retries) e a
 *         promise REJEITA → o caller (fila/useMessageQueue) pode reenfileirar
 *         (retry possível); reenvio posterior não é engolido pelo dedup
 *   legado: o insert continua indo para a tabela 'messages' (zapp.messages)
 *         com payload do caminho legado (sender 'agent', status 'pending')
 *
 * O RED esperado (estado atual, sem dedup in-flight do envio):
 *   - "dedup in-flight" falha: 2 inserts + 2 calls à Evolution (dedup ausente)
 *   Os demais casos (feliz/legado, falha, TTL, auth) devem nascer verdes —
 *   o RED documenta exclusivamente o GAP de dedup do envio.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMessageToContact } from '../messageSender';
import {
  subscribeAllSendStatus,
  __resetSendStatusForTest,
  type SendStatusDetail,
} from '../sendStatusBus';

// ── Mocks (vi.hoisted — factories de vi.mock rodam antes dos imports) ───────
const {
  supabaseMock,
  safeClientMock,
  dbFromMock,
  invokeMock,
  evoInstanceNameMock,
  connByIdMock,
  firstConnMock,
  idemFingerprintMock,
  idemRowMock,
  toastMock,
  loggerMock,
  resetAll,
  insertPayloads,
  updatePayloads,
  messagesInsertCount,
  profilesSelectCount,
  evolutionCalls,
} = vi.hoisted(() => {
  const loggerMock = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
  const toastMock = vi.fn();
  const invokeMock = vi.fn();
  const evoInstanceNameMock = vi.fn();
  const connByIdMock = vi.fn();
  const firstConnMock = vi.fn();
  const idemFingerprintMock = vi.fn();
  const idemRowMock = vi.fn();
  const safeFromMock = vi.fn();

  // ── Query-builder chainable (espelha PostgREST) ───────────────────────────
  const makeChain = (resolve?: () => { data: unknown; error: unknown }) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.neq = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.abortSignal = vi.fn(() => builder);
    builder.single = vi.fn(() => Promise.resolve(resolve ? resolve() : { data: null, error: null }));
    builder.maybeSingle = vi.fn(() =>
      Promise.resolve(resolve ? resolve() : { data: null, error: null })
    );
    builder.then = vi.fn(
      (onOk: (r: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(resolve ? resolve() : { data: null, error: null }).then(onOk, onErr)
    );
    return builder;
  };

  // Tabela 'messages' (legado zapp.messages): insert gera row com id novo;
  // update acumula payload; maybeSingle devolve a última row inserida.
  let msgCounter = 0;
  let lastRow: Record<string, unknown> | null = null;
  const messagesBuilder = makeChain(() => ({ data: lastRow, error: null }));
  messagesBuilder.insert = vi.fn((payload: Record<string, unknown>) => {
    msgCounter += 1;
    lastRow = { ...payload, id: `msg-${msgCounter}` };
    return messagesBuilder;
  });
  messagesBuilder.update = vi.fn((payload: Record<string, unknown>) => {
    if (lastRow) lastRow = { ...lastRow, ...payload };
    return messagesBuilder;
  });
  messagesBuilder.eq = vi.fn(() => messagesBuilder);

  const contactsBuilder = makeChain(() => ({
    data: { phone: '5511999887766', whatsapp_connection_id: 'conn-1' },
    error: null,
  }));
  const profilesBuilder = makeChain(() => ({ data: { id: 'profile-1' }, error: null }));
  const genericBuilder = makeChain();

  const supabaseFromMock = vi.fn((table: string) =>
    table === 'profiles' ? profilesBuilder : genericBuilder
  );
  const supabaseAuthGetSessionMock = vi.fn();
  const dbFromMock = vi.fn((entity: string) =>
    entity === 'messages' ? messagesBuilder : entity === 'contacts' ? contactsBuilder : genericBuilder
  );

  const resetAll = () => {
    toastMock.mockReset();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ data: { key: { id: 'WAM-123' } }, error: null });
    evoInstanceNameMock.mockReset();
    evoInstanceNameMock.mockReturnValue('instance-name');
    connByIdMock.mockReset();
    connByIdMock.mockResolvedValue({
      id: 'conn-1',
      instance_id: 'inst-1',
      instance_name: 'instance-name',
      status: 'connected',
    });
    firstConnMock.mockReset();
    firstConnMock.mockResolvedValue(null);
    idemFingerprintMock.mockReset();
    idemFingerprintMock.mockResolvedValue('mfp:s256:test');
    idemRowMock.mockReset();
    idemRowMock.mockReturnValue('msg:test');
    safeFromMock.mockReset();
    safeFromMock.mockResolvedValue({ data: null, error: null });
    supabaseFromMock.mockClear();
    supabaseAuthGetSessionMock.mockReset();
    supabaseAuthGetSessionMock.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    dbFromMock.mockClear();
    (messagesBuilder.insert as ReturnType<typeof vi.fn>).mockClear();
    (messagesBuilder.update as ReturnType<typeof vi.fn>).mockClear();
    (messagesBuilder.eq as ReturnType<typeof vi.fn>).mockClear();
    msgCounter = 0;
    lastRow = null;
  };

  return {
    supabaseMock: {
      auth: {
        getSession: supabaseAuthGetSessionMock,
        getUser: vi.fn(),
        onAuthStateChange: vi.fn(),
      },
      from: supabaseFromMock,
      rpc: vi.fn(),
      channel: vi.fn(),
      functions: { invoke: vi.fn() },
    },
    safeClientMock: { from: safeFromMock },
    dbFromMock,
    invokeMock,
    evoInstanceNameMock,
    connByIdMock,
    firstConnMock,
    idemFingerprintMock,
    idemRowMock,
    toastMock,
    loggerMock,
    resetAll,
    insertPayloads: () =>
      (messagesBuilder.insert as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]),
    updatePayloads: () =>
      (messagesBuilder.update as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]),
    messagesInsertCount: () =>
      (messagesBuilder.insert as ReturnType<typeof vi.fn>).mock.calls.length,
    profilesSelectCount: () =>
      supabaseFromMock.mock.calls.filter((c) => c[0] === 'profiles').length,
    evolutionCalls: () => invokeMock.mock.calls,
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/integrations/supabase/safeClient', () => ({ safeClient: safeClientMock }));
vi.mock('@/integrations/datasource/db', () => ({ dbFrom: dbFromMock }));
vi.mock('@/lib/evolutionSendRetry', () => ({ invokeEvolutionWithRetry: invokeMock }));
vi.mock('@/lib/sendIdempotency', () => ({
  buildSendIdempotencyKeyFromFingerprint: idemFingerprintMock,
  buildSendIdempotencyKey: idemRowMock,
}));
vi.mock('@/lib/evolutionInstance', () => ({ evolutionInstanceName: evoInstanceNameMock }));
vi.mock('@/lib/whatsappConnectionsCache', () => ({
  getWhatsappConnectionById: connByIdMock,
  getFirstConnectedWhatsapp: firstConnMock,
}));
vi.mock('@/lib/logger', () => ({ getLogger: () => loggerMock }));
vi.mock('@/hooks/use-toast', () => ({ toast: toastMock }));

type StatusRecord = { id: string; status: string };

function collectStatuses(): { records: StatusRecord[]; unsubscribe: () => void } {
  const records: StatusRecord[] = [];
  const unsubscribe = subscribeAllSendStatus((id, detail: SendStatusDetail) => {
    records.push({ id, status: detail.status });
  });
  return { records, unsubscribe };
}

beforeEach(() => {
  resetAll();
  __resetSendStatusForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('messageSender.sendMessageToContact', () => {
  it('envio feliz: insert no caminho legado zapp.messages, update para sent + external_id, emite sent no bus', async () => {
    const { records, unsubscribe } = collectStatuses();
    const result = await sendMessageToContact('contact-1', 'olá', 'text', undefined, undefined, {
      conversationId: 'conv-1',
    });
    unsubscribe();

    // ── Caminho legado: insert em 'messages' (zapp.messages) ──
    expect(messagesInsertCount()).toBe(1);
    const ins = insertPayloads()[0] as Record<string, unknown>;
    expect(ins.contact_id).toBe('contact-1');
    expect(ins.content).toBe('olá');
    expect(ins.sender).toBe('agent');
    expect(ins.status).toBe('pending'); // DB normaliza p/ zapp.messages
    expect(ins.is_read).toBe(true);
    expect(ins.message_type).toBe('text');
    expect(ins.agent_id).toBe('profile-1');
    expect(ins.media_url).toBeNull();

    // ── Update final: sent + external_id ──
    const ups = updatePayloads();
    expect(ups[ups.length - 1]).toMatchObject({ status: 'sent', external_id: 'WAM-123' });

    // ── Bus: sending → sent ──
    expect(records[0].status).toBe('sending');
    expect(records.some((r) => r.status === 'sent')).toBe(true);

    // ── Evolution chamada 1x com Idempotency-Key ──
    const calls = evolutionCalls();
    expect(calls).toHaveLength(1);
    expect((calls[0][1] as { headers?: Record<string, string> }).headers?.['Idempotency-Key']).toBe(
      'mfp:s256:test'
    );

    expect(result.id).toBe('msg-1');
  });

  it('RED → in-flight dedup: 2 envios simultâneos da MESMA mensagem → 1 insert + 1 fetch Evolution; ambos resolvem com o MESMO id', async () => {
    const [r1, r2] = await Promise.all([
      sendMessageToContact('contact-1', 'msg dedup', 'text'),
      sendMessageToContact('contact-1', 'msg dedup', 'text'),
    ]);

    expect(messagesInsertCount()).toBe(1); // ← RED hoje: 2 inserts
    expect(evolutionCalls()).toHaveLength(1); // ← RED hoje: 2 fetches
    expect(r1.id).toBe(r2.id);
    expect(r1.id).toBe('msg-1');
  });

  it('dedup é APENAS in-flight: envio sequencial posterior da MESMA mensagem gera novo insert (retry/reenvio manual não é engolido)', async () => {
    await sendMessageToContact('contact-1', 'msg seq', 'text');
    await sendMessageToContact('contact-1', 'msg seq', 'text');

    expect(messagesInsertCount()).toBe(2);
    expect(evolutionCalls()).toHaveLength(2);
  });

  it('dedup NÃO colapsa conteúdos diferentes no mesmo contato', async () => {
    const [r1, r2] = await Promise.all([
      sendMessageToContact('contact-1', 'texto A', 'text'),
      sendMessageToContact('contact-1', 'texto B', 'text'),
    ]);

    expect(messagesInsertCount()).toBe(2);
    expect(evolutionCalls()).toHaveLength(2);
    expect(r1.id).not.toBe(r2.id);
  });

  it('erro 401 da Evolution → status failed_auth + error_code + error_reason; rejeita (sem duplicata no banco)', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { status: 401, message: 'unauthorized' } });
    const { records, unsubscribe } = collectStatuses();

    await expect(sendMessageToContact('contact-1', 'auth test', 'text')).rejects.toThrow(
      'unauthorized'
    );
    unsubscribe();

    expect(messagesInsertCount()).toBe(1); // sem dupla inserção no caminho de erro
    expect(updatePayloads()[updatePayloads().length - 1]).toMatchObject({
      status: 'failed_auth',
      error_code: '401',
      error_reason: 'unauthorized',
    });
    expect(records.some((r) => r.status === 'failed_auth')).toBe(true);
  });

  it('erro 500 da Evolution → status failed + error_reason persistidos; rejeita (retry possível pelo caller)', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: { status: 500, message: 'Internal Server Error' },
    });

    await expect(sendMessageToContact('contact-1', '500 test', 'text')).rejects.toThrow(
      'Internal Server Error'
    );

    expect(updatePayloads()[updatePayloads().length - 1]).toMatchObject({
      status: 'failed',
      error_reason: 'Internal Server Error',
    });
    expect(messagesInsertCount()).toBe(1);
  });

  it('erro de rede (retries exaustos) → failed_retries + error_reason; rejeita e o REENVIO posterior funciona', async () => {
    invokeMock.mockRejectedValue(new Error('fetch failed'));
    const { records, unsubscribe } = collectStatuses();

    await expect(sendMessageToContact('contact-1', 'net test', 'text')).rejects.toThrow(
      'fetch failed'
    );
    unsubscribe();

    expect(updatePayloads()[updatePayloads().length - 1]).toMatchObject({
      status: 'failed_retries',
      error_reason: 'fetch failed',
      retry_attempt: 3,
      retry_total: 3,
    });
    expect(records.some((r) => r.status === 'failed_retries')).toBe(true);

    // ── retry possível: chamada nova após o erro funciona (nova row, novo envio) ──
    invokeMock.mockResolvedValue({ data: { key: { id: 'WAM-2' } }, error: null });
    const retry = await sendMessageToContact('contact-1', 'net test', 'text');
    expect(retry.id).toBe('msg-2');
    expect(messagesInsertCount()).toBe(2);
    expect(updatePayloads()[updatePayloads().length - 1]).toMatchObject({ status: 'sent', external_id: 'WAM-2' });
  });

  it('PROFILE_CACHE_TTL=5min: perfil não é re-buscado em <5min; após TTL há nova busca (fake timers)', async () => {
    vi.useFakeTimers();
    try {
      await sendMessageToContact('contact-1', 'ttl 1', 'text');
      const afterFirst = profilesSelectCount();

      await sendMessageToContact('contact-1', 'ttl 2', 'text'); // mesmo user, dentro do TTL
      expect(profilesSelectCount()).toBe(afterFirst);

      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1);
      await sendMessageToContact('contact-1', 'ttl 3', 'text'); // TTL expirado
      expect(profilesSelectCount()).toBe(afterFirst + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
