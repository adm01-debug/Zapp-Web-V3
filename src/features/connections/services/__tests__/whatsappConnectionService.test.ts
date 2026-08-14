/**
 * Tests for whatsappConnectionService — F6-26 / Etapa 2.
 *
 * O serviço fica entre a UI e a Evolution API. A Evolution API é mockada no
 * nível do whatsappAdapter (F3/F5 — connectInstance/createInstance/
 * requestPairingCode), que é a fronteira real do serviço: resolve com o body
 * (array/objeto) e LANÇA em erro (invokeEvolution faz throw).
 *
 * Coberto:
 *   generateInstanceName / detectQrTtlMs (aritmética pura)
 *   requestQrCode / createInstance / requestPairingCode (mocks do adapter)
 *   logQrAttempt (repositório + auth)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { connectInstanceMock, createInstanceMock, requestPairingCodeMock, logQrAttemptMock, getUserMock, supabaseFromMock } = vi.hoisted(() => ({
  connectInstanceMock: vi.fn(),
  createInstanceMock: vi.fn(),
  requestPairingCodeMock: vi.fn(),
  logQrAttemptMock: vi.fn(),
  getUserMock: vi.fn(),
  supabaseFromMock: vi.fn(),
}));

vi.mock('@/lib/whatsappAdapter', () => ({
  connectInstance: connectInstanceMock,
  createInstance: createInstanceMock,
  requestPairingCode: requestPairingCodeMock,
}));

vi.mock('@/features/connections/data-access/whatsappConnectionRepository', () => ({
  whatsappConnectionRepository: { logQrAttempt: logQrAttemptMock },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: getUserMock }, from: supabaseFromMock },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { whatsappConnectionService } from '../whatsappConnectionService';

beforeEach(() => {
  vi.clearAllMocks();
  connectInstanceMock.mockResolvedValue({ base64: 'iVBORw0' });
  createInstanceMock.mockResolvedValue({ instance: { instanceName: 'Vendas', status: 'created' } });
  requestPairingCodeMock.mockResolvedValue({ code: '1234-5678' });
  getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── generateInstanceName ──────────────────────────────────────────────────────
describe('whatsappConnectionService.generateInstanceName', () => {
  it('minúsculas e não-alfanuméricos viram _', () => {
    expect(whatsappConnectionService.generateInstanceName('Vendas Online')).toMatch(/^vendas_online_\d{6}$/);
  });
  it('_ repetidos colapsam', () => {
    expect(whatsappConnectionService.generateInstanceName('a__b')).toMatch(/^a_b_\d{6}$/);
  });
  it('trunca em 30 chars antes do sufixo', () => {
    const n = whatsappConnectionService.generateInstanceName('x'.repeat(60));
    expect(n.length).toBeLessThanOrEqual(37);
  });
  it('dois nomes em instantes diferentes não colidem (sufixo time)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const a = whatsappConnectionService.generateInstanceName('s');
    vi.setSystemTime(new Date('2026-01-01T00:00:01Z'));
    const b = whatsappConnectionService.generateInstanceName('s');
    vi.useRealTimers();
    expect(a).not.toBe(b);
  });
});

// ── detectQrTtlMs ─────────────────────────────────────────────────────────────
describe('whatsappConnectionService.detectQrTtlMs', () => {
  it('null/undefined/string → default 60s', () => {
    expect(whatsappConnectionService.detectQrTtlMs(null)).toEqual({ ttlMs: 60000, source: 'default' });
    expect(whatsappConnectionService.detectQrTtlMs(undefined)).toEqual({ ttlMs: 60000, source: 'default' });
    expect(whatsappConnectionService.detectQrTtlMs('x')).toEqual({ ttlMs: 60000, source: 'default' });
  });
  it('count em segundos → detected', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 30 })).toEqual({ ttlMs: 30000, source: 'detected' });
  });
  it('qrcode.count string numérica → detected', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ qrcode: { count: '45' } })).toEqual({ ttlMs: 45000, source: 'detected' });
  });
  it('ttl e qrcode.ttl → detected', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ ttl: 60 })).toEqual({ ttlMs: 60000, source: 'detected' });
    expect(whatsappConnectionService.detectQrTtlMs({ qrcode: { ttl: 60 } })).toEqual({ ttlMs: 60000, source: 'detected' });
  });
  it('expires_in → detected', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ expires_in: 90 })).toEqual({ ttlMs: 90000, source: 'detected' });
  });
  it('abaixo do mínimo clamp para 15s', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 5 })).toEqual({ ttlMs: 15000, source: 'clamped' });
  });
  it('acima do máximo clamp para 300s', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 9999 })).toEqual({ ttlMs: 300000, source: 'clamped' });
  });
  it('0/negativo/não-numérico → default', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 0 })).toEqual({ ttlMs: 60000, source: 'default' });
    expect(whatsappConnectionService.detectQrTtlMs({ count: -5 })).toEqual({ ttlMs: 60000, source: 'default' });
    expect(whatsappConnectionService.detectQrTtlMs({ count: 'abc' })).toEqual({ ttlMs: 60000, source: 'default' });
  });
  it('precedência: count ganha de ttl/expires_in', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 30, ttl: 120, expires_in: 180 })).toEqual({ ttlMs: 30000, source: 'detected' });
  });
});

// ── requestQrCode ─────────────────────────────────────────────────────────────
describe('whatsappConnectionService.requestQrCode', () => {
  it('instanceId vazio lança antes de qualquer chamada', async () => {
    await expect(whatsappConnectionService.requestQrCode('')).rejects.toThrow('ID da instância é obrigatório');
    expect(connectInstanceMock).not.toHaveBeenCalled();
  });

  it('chama connectInstance com o instanceName', async () => {
    await whatsappConnectionService.requestQrCode('suporte_123456');
    expect(connectInstanceMock).toHaveBeenCalledWith({ instanceName: 'suporte_123456' });
  });

  it('erro do transporte vira Error com a mensagem da API', async () => {
    connectInstanceMock.mockRejectedValue(new Error('connection refused'));
    await expect(whatsappConnectionService.requestQrCode('x')).rejects.toThrow('connection refused');
  });

  it('erro do transporte sem message usa mensagem padrão', async () => {
    connectInstanceMock.mockRejectedValue(new Error());
    await expect(whatsappConnectionService.requestQrCode('x')).rejects.toThrow('Erro ao gerar QR Code na API');
  });

  it('data.error === true lança com a mensagem do corpo', async () => {
    connectInstanceMock.mockResolvedValue({ error: true, message: 'EVOLUTION_AUTH_ERROR' });
    await expect(whatsappConnectionService.requestQrCode('x')).rejects.toThrow('EVOLUTION_AUTH_ERROR');
  });

  it('sucesso devolve o payload cru', async () => {
    connectInstanceMock.mockResolvedValue({ base64: 'iVBORw0' });
    await expect(whatsappConnectionService.requestQrCode('x')).resolves.toEqual({ base64: 'iVBORw0' });
  });
});

// ── createInstance (F6-02) ────────────────────────────────────────────────────
describe('whatsappConnectionService.createInstance', () => {
  it('instanceName vazio lança antes de qualquer chamada', async () => {
    await expect(whatsappConnectionService.createInstance('')).rejects.toThrow('Nome da instância é obrigatório');
    expect(createInstanceMock).not.toHaveBeenCalled();
  });

  it('repassa options ao adapter (defaults Baileys/qrcode são do adapter)', async () => {
    createInstanceMock.mockResolvedValue({ instance: { instanceName: 'Vendas', status: 'created' } });
    await whatsappConnectionService.createInstance('Vendas');
    expect(createInstanceMock).toHaveBeenCalledWith({
      instanceName: 'Vendas',
      integration: undefined,
      qrcode: undefined,
    });
  });

  it('aceita integration/qrcode customizados', async () => {
    createInstanceMock.mockResolvedValue({ instance: {} });
    await whatsappConnectionService.createInstance('Meta', {
      integration: 'WHATSAPP-BUSINESS-CLOUD',
      qrcode: false,
    });
    expect(createInstanceMock).toHaveBeenCalledWith({
      instanceName: 'Meta',
      integration: 'WHATSAPP-BUSINESS-CLOUD',
      qrcode: false,
    });
  });

  it('erro do transporte vira Error com a mensagem da API', async () => {
    createInstanceMock.mockRejectedValue(new Error('instance already exists'));
    await expect(whatsappConnectionService.createInstance('Vendas')).rejects.toThrow('instance already exists');
  });

  it('erro do transporte sem message usa mensagem padrão', async () => {
    createInstanceMock.mockRejectedValue(new Error());
    await expect(whatsappConnectionService.createInstance('Vendas')).rejects.toThrow('Erro ao criar instância na API Evolution');
  });

  it('data.error === true lança mesmo com HTTP 200', async () => {
    createInstanceMock.mockResolvedValue({ error: true, message: 'integration not allowed' });
    await expect(whatsappConnectionService.createInstance('Vendas')).rejects.toThrow('integration not allowed');
  });

  it('sucesso devolve o payload cru (instance.instanceId p/ o INSERT)', async () => {
    createInstanceMock.mockResolvedValue({
      instance: {
        instanceName: 'Vendas',
        instanceId: '22222222-2222-4222-8222-222222222222',
        status: 'created',
      },
    });
    await expect(whatsappConnectionService.createInstance('Vendas')).resolves.toEqual({
      instance: {
        instanceName: 'Vendas',
        instanceId: '22222222-2222-4222-8222-222222222222',
        status: 'created',
      },
    });
  });
});

// ── requestPairingCode (F6-01) ────────────────────────────────────────────────
describe('whatsappConnectionService.requestPairingCode', () => {
  it('instanceName vazio lança antes de qualquer chamada', async () => {
    await expect(whatsappConnectionService.requestPairingCode('', '5511999999999')).rejects.toThrow('Nome da instância é obrigatório');
    expect(requestPairingCodeMock).not.toHaveBeenCalled();
  });

  it('número vazio lança antes de qualquer chamada', async () => {
    await expect(whatsappConnectionService.requestPairingCode('Vendas', '')).rejects.toThrow('Número do WhatsApp é obrigatório');
    expect(requestPairingCodeMock).not.toHaveBeenCalled();
  });

  it('chama requestPairingCode com instanceName + number', async () => {
    requestPairingCodeMock.mockResolvedValue({ code: '1234-5678' });
    await whatsappConnectionService.requestPairingCode('Vendas', '5511999999999');
    expect(requestPairingCodeMock).toHaveBeenCalledWith({ instanceName: 'Vendas', number: '5511999999999' });
  });

  it('erro do transporte vira Error com a mensagem da API', async () => {
    requestPairingCodeMock.mockRejectedValue(new Error('pairing failed'));
    await expect(whatsappConnectionService.requestPairingCode('Vendas', '5511999999999')).rejects.toThrow('pairing failed');
  });

  it('erro do transporte sem message usa mensagem padrão', async () => {
    requestPairingCodeMock.mockRejectedValue(new Error());
    await expect(whatsappConnectionService.requestPairingCode('Vendas', '5511999999999')).rejects.toThrow('Erro ao gerar código de emparelhamento na API');
  });

  it('data.error === true lança com a mensagem do corpo', async () => {
    requestPairingCodeMock.mockResolvedValue({ error: true, message: 'invalid number' });
    await expect(whatsappConnectionService.requestPairingCode('Vendas', '5511999999999')).rejects.toThrow('invalid number');
  });

  it('sucesso devolve o payload cru (code)', async () => {
    requestPairingCodeMock.mockResolvedValue({ code: '1234-5678' });
    await expect(whatsappConnectionService.requestPairingCode('Vendas', '5511999999999')).resolves.toEqual({ code: '1234-5678' });
  });
});

// ── logQrAttempt ──────────────────────────────────────────────────────────────
describe('whatsappConnectionService.logQrAttempt', () => {
  it('propaga o id do usuário autenticado em requested_by', async () => {
    logQrAttemptMock.mockResolvedValue({ data: null, error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: 'u42' } }, error: null });
    await whatsappConnectionService.logQrAttempt('c1', 'i1', 'nome');
    expect(logQrAttemptMock).toHaveBeenCalledWith({
      connection_id: 'c1',
      instance_id: 'i1',
      connection_name: 'nome',
      status: 'pending',
      requested_by: 'u42',
    });
  });

  it('grava requested_by null quando não há sessão', async () => {
    logQrAttemptMock.mockResolvedValue({ data: null, error: null });
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await whatsappConnectionService.logQrAttempt('c1', 'i1', 'nome');
    expect(logQrAttemptMock).toHaveBeenCalledWith(expect.objectContaining({ requested_by: null }));
  });

  it('status default é pending e aceita status customizado', async () => {
    logQrAttemptMock.mockResolvedValue({ data: null, error: null });
    await whatsappConnectionService.logQrAttempt('c1', 'i1', 'nome', 'success');
    expect(logQrAttemptMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('erro retornado pelo repositório não lança (retorna o result)', async () => {
    logQrAttemptMock.mockResolvedValue({ data: null, error: { message: 'db down' } });
    await expect(whatsappConnectionService.logQrAttempt('c1', 'i1', 'nome')).resolves.toEqual({
      data: null,
      error: { message: 'db down' },
    });
  });

  it('exceção do repositório é re-lançada', async () => {
    logQrAttemptMock.mockRejectedValue(new Error('boom'));
    await expect(whatsappConnectionService.logQrAttempt('c1', 'i1', 'nome')).rejects.toThrow('boom');
  });
});

// ── listBasicConnections ──────────────────────────────────────────────────────
describe('whatsappConnectionService.listBasicConnections', () => {
  it('retorna data quando a query funciona', async () => {
    supabaseFromMock.mockReturnValue({
      select: () => ({ order: () => Promise.resolve({ data: [{ id: '1', name: 'a', api_type: 'unofficial' }], error: null }) }),
    });
    const rows = await whatsappConnectionService.listBasicConnections();
    expect(rows).toHaveLength(1);
  });
});
