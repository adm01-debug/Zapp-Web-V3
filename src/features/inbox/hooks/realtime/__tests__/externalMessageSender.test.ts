/**
 * TDD E35 — externalMessageSender (caminho evo).
 *
 * Contrato testado (spec Etapa 35, PLANO-100-ETAPAS-ZAPP-20260816.md):
 *  - 35.2 sendExternalText feliz → invoca a Edge Function `evolution-api`
 *    com payload correto (instanceName, number, text) + Idempotency-Key e
 *    PUBLICA status no sendStatusBus ('sending' → 'sent').
 *  - 35.3 erro → SendError propagado (sem swallow); bolha otimista criada
 *    ANTES do envio (ordem de chamadas) e reconciliada depois (status 'sent').
 *  - 35.9 integração texto+áudio → 2 mensagens em sequência = 2 eventos no
 *    bus, ordem preservada, ids distintos (sem race).
 *
 * Estado RED (antes do GREEN): o sender NÃO publicava no bus (gap real —
 * nenhum emitSendStatus no fonte). Testes 1/3/4/6 falham por isso; testes
 * 2/5 (guard de JID, instanceName override) já passam — comportamento
 * pré-existente correto, coberto por regressão.
 *
 * Mocks: supabase client (functions.invoke), safeClient, dbInsert (audit),
 * sendIdempotency (chave fixa), '@/features/inbox' (parseEvolutionError
 * determinístico — o parser real é coberto por parseEvolutionError.test.ts).
 * O bus é mockado com wrapper (spy) que delega à implementação REAL, para
 * history/listeners continuarem funcionando.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { dbInsert } from '@/integrations/datasource/db';
import { buildSendIdempotencyKeyFromFingerprint } from '@/lib/sendIdempotency';
import { sendExternalText, sendExternalAudio } from '../externalMessageSender';
import { SendError } from '../externalSenderTypes';
import {
  emitSendStatus,
  getSendStatus,
  subscribeSendStatusHistory,
  __resetSendStatusForTest,
} from '../sendStatusBus';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: { from: vi.fn() },
  },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: {
    from: vi.fn().mockResolvedValue({ data: [], error: null }),
    rpc: vi.fn().mockResolvedValue({ data: 'unofficial', error: null }),
  },
}));

vi.mock('@/integrations/datasource/db', () => ({
  dbInsert: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock('@/lib/sendIdempotency', () => ({
  buildSendIdempotencyKeyFromFingerprint: vi.fn().mockResolvedValue('mfp:test:fixed-key'),
}));

vi.mock('@/features/inbox', () => ({
  parseEvolutionError: (err: unknown) => {
    const e = err as { message?: string; status?: number };
    return {
      reason: e?.message ?? 'Falha na comunicação com a Evolution API',
      detail: e?.message ?? null,
      status: e?.status,
    };
  },
}));

// Spy que delega para a implementação REAL do bus (history/listeners vivos).
vi.mock('../sendStatusBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sendStatusBus')>();
  return { ...actual, emitSendStatus: vi.fn(actual.emitSendStatus) };
});

const JID = '5511999999999@s.whatsapp.net';
const PHONE = '5511999999999';

const createObjectURLMock = vi.fn(() => 'blob:mock-url');
const revokeObjectURLMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  __resetSendStatusForTest();
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: { key: { id: 'WAM-TEXT-1' } },
    error: null,
  });
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: createObjectURLMock,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: revokeObjectURLMock,
  });
});

describe('sendExternalText — caminho feliz (35.2)', () => {
  it('invoca evolution-api com payload correto (instance, number, text) + Idempotency-Key', async () => {
    const result = await sendExternalText(JID, 'Olá, mundo!');

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    const [fnName, opts] = vi.mocked(supabase.functions.invoke).mock.calls[0] as unknown as [
      string,
      { body: Record<string, unknown>; headers?: Record<string, string> },
    ];
    expect(fnName).toBe('evolution-api');
    expect(opts.body).toMatchObject({
      action: 'send-text',
      instanceName: 'wpp2', // DEFAULT_INSTANCE
      number: PHONE,
      text: 'Olá, mundo!',
    });
    expect(opts.headers?.['Idempotency-Key']).toBe('mfp:test:fixed-key');
    expect(buildSendIdempotencyKeyFromFingerprint).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: JID, messageType: 'text', content: 'Olá, mundo!' })
    );

    // Bolha otimista reconciliada depois do envio.
    expect(result.externalId).toBe('WAM-TEXT-1');
    expect(result.optimistic.status).toBe('sent');
    expect(result.optimistic.external_id).toBe('WAM-TEXT-1');
    expect(result.optimistic.contact_id).toBe(JID);
    expect(result.optimistic.message_type).toBe('text');
    expect(result.optimistic.sender).toBe('agent');
    expect(result.optimistic.id.startsWith('optimistic:')).toBe(true);
  });

  it('publica status no bus: sending → sent, com source send-text e contactId', async () => {
    const history: { msgId: string; status: string; source: string | null | undefined }[] = [];
    const unsub = subscribeSendStatusHistory((msgId, entry) =>
      history.push({ msgId, status: entry.status, source: entry.source })
    );

    const result = await sendExternalText(JID, 'Olá, mundo!');
    unsub();

    expect(history.map((h) => h.status)).toEqual(['sending', 'sent']);
    expect(history.every((h) => h.source === 'send-text')).toBe(true);
    expect(history.every((h) => h.msgId === result.optimistic.id)).toBe(true);

    const final = getSendStatus(result.optimistic.id);
    expect(final?.status).toBe('sent');
  });
});

describe('sendExternalText — erros (35.3)', () => {
  it('falha de rede: SendError propagado com detail, bolha criada ANTES do envio e status failed no bus', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error('fetch failed ECONNREFUSED'));

    const history: { msgId: string; status: string }[] = [];
    const unsub = subscribeSendStatusHistory((msgId, entry) =>
      history.push({ msgId, status: entry.status })
    );

    const err = await sendExternalText(JID, 'oi').catch((e) => e);
    unsub();

    // SendError com tipo estável, sem throw silencioso.
    expect(err).toBeInstanceOf(SendError);
    expect(err.name).toBe('SendError');
    expect(err.detail).toContain('fetch failed ECONNREFUSED');
    expect(err.status).toBeUndefined(); // parser stub: sem status

    // Bolha otimista criada ANTES do envio (emit 'sending' precede o invoke).
    expect(vi.mocked(emitSendStatus).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(supabase.functions.invoke).mock.invocationCallOrder[0]
    );

    // Status terminal de falha no bus.
    expect(history.map((h) => h.status)).toEqual(['sending', 'failed']);
    const msgId = history[0].msgId;
    expect(getSendStatus(msgId)?.status).toBe('failed');
    expect(getSendStatus(msgId)?.errorReason).toContain('fetch failed ECONNREFUSED');

    // Auditoria de erro registrada.
    expect(dbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rpc_log_service_event' }),
      expect.objectContaining({ p_event_type: 'error', p_remote_jid: JID })
    );
  });

  it('envelope de erro da API (error:true): SendError com status preservado e audit de erro', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { error: true, message: 'Session not found', status: 404 },
      error: null,
    });

    const err = await sendExternalText(JID, 'oi').catch((e) => e);
    expect(err).toBeInstanceOf(SendError);
    expect(err.message).toContain('Session not found');
    expect(err.status).toBe(404);

    expect(dbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rpc_log_service_event' }),
      expect.objectContaining({ p_event_type: 'error', p_level: 'error' })
    );
  });

  it('JID sem telefone: erro explícito e NENHUMA chamada à edge', async () => {
    await expect(sendExternalText('@s.whatsapp.net', 'x')).rejects.toThrow(
      'Contato sem JID válido para envio.'
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(emitSendStatus).not.toHaveBeenCalled();
  });

  it('instanceName explícito sobrescreve DEFAULT_INSTANCE no payload', async () => {
    await sendExternalText(JID, 'oi', { instanceName: 'wpp_custom' });
    const [, opts] = vi.mocked(supabase.functions.invoke).mock.calls[0] as unknown as [
      string,
      { body: Record<string, unknown> },
    ];
    expect(opts.body.instanceName).toBe('wpp_custom');
  });
});

describe('integração texto+áudio no bus (35.9)', () => {
  it('2 envios em sequência → 2 eventos por mensagem, ordem preservada, ids distintos', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { key: { id: 'WAM-X' } },
      error: null,
    });

    const history: { msgId: string; status: string; source: string | null | undefined }[] = [];
    const unsub = subscribeSendStatusHistory((msgId, entry) =>
      history.push({ msgId, status: entry.status, source: entry.source })
    );

    await sendExternalText(JID, 'primeira');
    await sendExternalAudio(JID, new Blob(['audio-data'], { type: 'audio/ogg' }));
    unsub();

    const textEntries = history.filter((h) => h.source === 'send-text');
    const audioEntries = history.filter((h) => h.source === 'send-audio');

    expect(textEntries.map((h) => h.status)).toEqual(['sending', 'sent']);
    expect(audioEntries.map((h) => h.status)).toEqual(['sending', 'sent']);

    // Ordem global preservada: texto antes de áudio, sem race.
    expect(history.map((h) => h.status)).toEqual(['sending', 'sent', 'sending', 'sent']);
    expect(history.map((h) => h.source)).toEqual(['send-text', 'send-text', 'send-audio', 'send-audio']);

    // Duas mensagens distintas no bus.
    expect(new Set(history.map((h) => h.msgId)).size).toBe(2);
  });
});
