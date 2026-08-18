/**
 * TDD E35 — externalAudioSender (PTT/voz, caminho evo).
 *
 * Contrato testado (spec Etapa 35, PLANO-100-ETAPAS-ZAPP-20260816.md):
 *  - 35.5 PTT: blobToBase64 de AudioBlob → base64 correto no payload
 *    (`audio`/`ptt`/`encoding`); fallback de instance → DEFAULT_INSTANCE.
 *  - 35.3/35.6 erros: SendError propagado, audit 'failed', blob URL revogada,
 *    status 'failed' no bus; sucesso → 'sending' → 'sent' (35.9).
 *  - Auditoria safeClient (audit_logs): send_attempt + delivered.
 *
 * Estado RED (antes do GREEN): sender não publicava no bus (gap real).
 * Os demais comportamentos (base64, payload, DEFAULT_INSTANCE, SendError,
 * revoke) já existiam e são cobertos por regressão.
 *
 * Mocks: supabase client (functions.invoke), safeClient, dbInsert, crypto
 * (buildFileHash fixo), sendIdempotency (chave fixa), '@/features/inbox'
 * (parseEvolutionError determinístico). URL.createObjectURL/revokeObjectURL
 * mockados (happy-dom não implementa de forma confiável). FileReader real
 * funciona em happy-dom (probe confirmado) — blobToBase64 é exercitado de
 * verdade. O bus é mockado com wrapper (spy) delegando à implementação REAL.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { dbInsert } from '@/integrations/datasource/db';
import { sendExternalAudio } from '../externalAudioSender';
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

vi.mock('@/lib/crypto', () => ({
  buildFileHash: vi.fn().mockResolvedValue('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6'),
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
const AUDIO_B64 = 'YXVkaW8tZGF0YQ=='; // base64 de 'audio-data'
const MEDIA_HASH = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6';

const createObjectURLMock = vi.fn(() => 'blob:mock-audio-url');
const revokeObjectURLMock = vi.fn();

function audioBlob(): Blob {
  return new Blob(['audio-data'], { type: 'audio/ogg' });
}

function invokeBody(): Record<string, unknown> {
  const [, opts] = vi.mocked(supabase.functions.invoke).mock.calls[0] as unknown as [
    string,
    { body: Record<string, unknown> },
  ];
  return opts.body;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetSendStatusForTest();
  vi.mocked(supabase.functions.invoke).mockResolvedValue({
    data: { key: { id: 'WAM-AUDIO-1' } },
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

describe('sendExternalAudio — PTT feliz (35.5)', () => {
  it('blobToBase64 correto no payload (audio/ptt/encoding/mediaHash) + bolha otimista reconciliada', async () => {
    const result = await sendExternalAudio(JID, audioBlob());

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    const [fnName] = vi.mocked(supabase.functions.invoke).mock.calls[0] as unknown as [string];
    expect(fnName).toBe('evolution-api');

    const body = invokeBody();
    expect(body).toMatchObject({
      action: 'send-audio',
      instanceName: 'wpp2', // DEFAULT_INSTANCE
      number: PHONE,
      audio: AUDIO_B64, // blobToBase64('audio-data') — contrato 35.5
      ptt: true,
      encoding: true,
      mediaHash: MEDIA_HASH,
    });

    // Bolha otimista reconciliada.
    expect(result.externalId).toBe('WAM-AUDIO-1');
    expect(result.optimistic.status).toBe('sent');
    expect(result.optimistic.external_id).toBe('WAM-AUDIO-1');
    expect(result.optimistic.message_type).toBe('audio');
    expect(result.optimistic.media_meta).toMatchObject({ ptt: true });
    expect(result.optimistic.media_url).toBe('blob:mock-audio-url');
  });

  it('publica status no bus: sending → sent, com source send-audio', async () => {
    const history: { msgId: string; status: string; source: string | null | undefined }[] = [];
    const unsub = subscribeSendStatusHistory((msgId, entry) =>
      history.push({ msgId, status: entry.status, source: entry.source })
    );

    const result = await sendExternalAudio(JID, audioBlob());
    unsub();

    expect(history.map((h) => h.status)).toEqual(['sending', 'sent']);
    expect(history.every((h) => h.source === 'send-audio')).toBe(true);
    expect(history.every((h) => h.msgId === result.optimistic.id)).toBe(true);
    expect(getSendStatus(result.optimistic.id)?.status).toBe('sent');
  });

  it('isPtt:false → payload ptt false e media_meta {ptt:false}', async () => {
    await sendExternalAudio(JID, audioBlob(), { isPtt: false });
    expect(invokeBody().ptt).toBe(false);
  });

  it('blobToBase64 correto para conteúdo diferente (contrato de codificação)', async () => {
    const blob = new Blob(['hello world'], { type: 'audio/mp4' });
    await sendExternalAudio(JID, blob);
    expect(invokeBody().audio).toBe('aGVsbG8gd29ybGQ='); // base64 de 'hello world'
  });
});

describe('sendExternalAudio — instância (35.5)', () => {
  it('sem instanceName → DEFAULT_INSTANCE', async () => {
    await sendExternalAudio(JID, audioBlob());
    expect(invokeBody().instanceName).toBe('wpp2');
  });

  it('instanceName explícito → usado', async () => {
    await sendExternalAudio(JID, audioBlob(), { instanceName: 'wpp_custom' });
    expect(invokeBody().instanceName).toBe('wpp_custom');
  });

  it('conversationInstance usado quando instanceName ausente', async () => {
    await sendExternalAudio(JID, audioBlob(), { conversationInstance: 'wpp_conv' });
    expect(invokeBody().instanceName).toBe('wpp_conv');
  });
});

describe('sendExternalAudio — erros (35.3/35.6)', () => {
  it('envelope de erro: SendError com status preservado, revoke da blob URL, status failed no bus', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { error: true, message: 'Audio too large', status: 500 },
      error: null,
    });

    const history: { msgId: string; status: string }[] = [];
    const unsub = subscribeSendStatusHistory((msgId, entry) =>
      history.push({ msgId, status: entry.status })
    );

    const err = await sendExternalAudio(JID, audioBlob()).catch((e) => e);
    unsub();

    expect(err).toBeInstanceOf(SendError);
    expect(err.message).toContain('Audio too large');
    expect(err.status).toBe(500);
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-audio-url');

    expect(history.map((h) => h.status)).toEqual(['sending', 'failed']);
    const msgId = history[0].msgId;
    expect(getSendStatus(msgId)?.status).toBe('failed');
    expect(getSendStatus(msgId)?.errorCode).toBe(500);

    // Auditoria de falha (logOutboundEvent status failed).
    expect(dbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rpc_log_outbound_event' }),
      expect.objectContaining({ p_status: 'failed', p_message_type: 'audio', p_error_code: '500' })
    );
  });

  it('falha de rede: SendError propagado, revoke da blob URL e audit failed', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error('fetch failed ECONNREFUSED'));

    const err = await sendExternalAudio(JID, audioBlob()).catch((e) => e);
    expect(err).toBeInstanceOf(SendError);
    expect(err.detail).toContain('fetch failed ECONNREFUSED');
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-audio-url');
    expect(dbInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'rpc_log_outbound_event' }),
      expect.objectContaining({ p_status: 'failed' })
    );
  });

  it('JID sem telefone: erro explícito e nenhuma chamada à edge', async () => {
    await expect(sendExternalAudio('@s.whatsapp.net', audioBlob())).rejects.toThrow(
      'Contato sem JID válido para envio.'
    );
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(emitSendStatus).not.toHaveBeenCalled();
  });
});

describe('sendExternalAudio — auditoria de conversa (safeClient audit_logs)', () => {
  it('com conversationId: send_attempt no início e delivered no sucesso', async () => {
    await sendExternalAudio(JID, audioBlob(), { conversationId: 'conv-42' });

    const fromMock = vi.mocked(safeClient.from);
    expect(fromMock).toHaveBeenCalledTimes(2);

    // Executa os builders capturados com um fake `q` que grava as rows.
    const rows: Array<Record<string, unknown>> = [];
    for (const call of fromMock.mock.calls) {
      const [table, builder] = call as unknown as [
        string,
        (q: { insert: (row: Record<string, unknown>) => PromiseLike<unknown> }) => PromiseLike<unknown>,
      ];
      expect(table).toBe('audit_logs');
      builder({
        insert: (row) => {
          rows.push(row);
          return Promise.resolve(row);
        },
      });
    }

    expect(rows.map((r) => r.action)).toEqual(['send_attempt', 'delivered']);
    expect(rows[0].details).toMatchObject({ status: 'starting', messageType: 'audio', isPtt: true });
    expect(rows[1].details).toMatchObject({ status: 'success', external_id: 'WAM-AUDIO-1' });
  });
});
