/**
 * Tests for whatsappConnectionService — F6-26 / Etapa 2.
 *
 * O serviço fica entre a UI e a Evolution API. Antes deste arquivo tinha zero
 * cobertura — inclusive `detectQrTtlMs`, que é pura aritmética de clamp e a
 * causa mais provável de QR expirando cedo/tarde demais na tela.
 *
 * A Evolution API é mockada no nível do repositório
 * (`whatsappConnectionRepository.callEvolutionApi`), não do fetch: é a fronteira
 * real do serviço e mantém o teste estável a refactors de transporte.
 *
 * Coberto:
 *   generateInstanceName
 *     - minúsculas, não-alfanuméricos viram `_`, `_` repetidos colapsam
 *     - trunca o slug em 30 chars antes do sufixo
 *     - sufixo numérico de 6 dígitos derivado de Date.now()
 *     - dois nomes iguais em instantes diferentes não colidem
 *   detectQrTtlMs
 *     - null / undefined / string → default 60s, source 'default'
 *     - `count` em segundos → 'detected'
 *     - `qrcode.count` (string numérica) → 'detected'
 *     - `ttl` e `qrcode.ttl` → 'detected'
 *     - `expires_in` → 'detected'
 *     - abaixo do mínimo (15s) → clamp para 15s, source 'clamped'
 *     - acima do máximo (300s) → clamp para 300s, source 'clamped'
 *     - valor 0, negativo ou não-numérico é ignorado → cai no default
 *     - precedência: `count` ganha de `ttl` e de `expires_in`
 *   requestQrCode
 *     - instanceId vazio lança antes de qualquer chamada de rede
 *     - erro do transporte vira Error com a mensagem da API
 *     - erro do transporte sem message usa mensagem padrão
 *     - `data.error === true` (erro no corpo, HTTP 200) lança
 *     - sucesso devolve o payload cru
 *   logQrAttempt
 *     - propaga o id do usuário autenticado em requested_by
 *     - grava requested_by null quando não há sessão
 *     - status default é 'pending'
 *     - erro retornado pelo repositório não lança (retorna o result)
 *     - exceção do repositório é re-lançada
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { callEvolutionApiMock, logQrAttemptMock, getUserMock } = vi.hoisted(() => ({
  callEvolutionApiMock: vi.fn(),
  logQrAttemptMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/features/connections/data-access/whatsappConnectionRepository', () => ({
  whatsappConnectionRepository: {
    callEvolutionApi: callEvolutionApiMock,
    logQrAttempt: logQrAttemptMock,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: getUserMock } },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { whatsappConnectionService } from '../whatsappConnectionService';

const DEFAULT_TTL = 60_000;
const MIN_TTL = 15_000;
const MAX_TTL = 300_000;

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-abc' } } });
  logQrAttemptMock.mockResolvedValue({ data: { id: 'qr-1' }, error: null });
  callEvolutionApiMock.mockResolvedValue({ data: { base64: 'iVBORw0' }, error: null });
});

// ── generateInstanceName ──────────────────────────────────────────────────────
describe('whatsappConnectionService.generateInstanceName', () => {
  it('normaliza para minúsculas e troca não-alfanuméricos por underscore', () => {
    const out = whatsappConnectionService.generateInstanceName('Suporte Nível 1');
    expect(out).toMatch(/^suporte_n_vel_1_\d{6}$/);
  });

  it('colapsa underscores repetidos', () => {
    const out = whatsappConnectionService.generateInstanceName('A   ---   B');
    expect(out.startsWith('a_b_')).toBe(true);
    expect(out).not.toMatch(/__/);
  });

  it('trunca o slug em 30 caracteres antes do sufixo', () => {
    const out = whatsappConnectionService.generateInstanceName('x'.repeat(60));
    const [slug] = out.split(/_(\d{6})$/);
    expect(slug).toHaveLength(30);
  });

  it('acrescenta sufixo numérico de 6 dígitos', () => {
    const out = whatsappConnectionService.generateInstanceName('vendas');
    expect(out).toMatch(/_\d{6}$/);
  });

  it('nomes iguais em instantes diferentes não colidem', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const a = whatsappConnectionService.generateInstanceName('vendas');
    vi.setSystemTime(new Date('2026-01-01T00:00:05.000Z'));
    const b = whatsappConnectionService.generateInstanceName('vendas');
    vi.useRealTimers();
    expect(a).not.toBe(b);
  });
});

// ── detectQrTtlMs ─────────────────────────────────────────────────────────────
describe('whatsappConnectionService.detectQrTtlMs — fallback para o default', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'nada disso'],
    ['número', 42],
    ['objeto vazio', {}],
    ['count zero', { count: 0 }],
    ['count negativo', { count: -30 }],
    ['count não-numérico', { count: 'abc' }],
  ])('%s → 60s com source "default"', (_label, input) => {
    expect(whatsappConnectionService.detectQrTtlMs(input)).toEqual({
      ttlMs: DEFAULT_TTL,
      source: 'default',
    });
  });
});

describe('whatsappConnectionService.detectQrTtlMs — valores detectados', () => {
  it('lê count em segundos', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 45 })).toEqual({
      ttlMs: 45_000,
      source: 'detected',
    });
  });

  it('lê qrcode.count como string numérica', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ qrcode: { count: '30' } })).toEqual({
      ttlMs: 30_000,
      source: 'detected',
    });
  });

  it('lê ttl na raiz', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ ttl: 90 })).toEqual({
      ttlMs: 90_000,
      source: 'detected',
    });
  });

  it('lê qrcode.ttl', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ qrcode: { ttl: 120 } })).toEqual({
      ttlMs: 120_000,
      source: 'detected',
    });
  });

  it('lê expires_in', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ expires_in: 20 })).toEqual({
      ttlMs: 20_000,
      source: 'detected',
    });
  });

  it('count tem precedência sobre ttl e expires_in', () => {
    const out = whatsappConnectionService.detectQrTtlMs({
      count: 45,
      ttl: 90,
      expires_in: 120,
    });
    expect(out.ttlMs).toBe(45_000);
  });
});

describe('whatsappConnectionService.detectQrTtlMs — clamp', () => {
  it('abaixo do mínimo sobe para 15s e marca clamped', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 5 })).toEqual({
      ttlMs: MIN_TTL,
      source: 'clamped',
    });
  });

  it('acima do máximo desce para 300s e marca clamped', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 900 })).toEqual({
      ttlMs: MAX_TTL,
      source: 'clamped',
    });
  });

  it('exatamente no limite inferior conta como detected', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 15 })).toEqual({
      ttlMs: MIN_TTL,
      source: 'detected',
    });
  });

  it('exatamente no limite superior conta como detected', () => {
    expect(whatsappConnectionService.detectQrTtlMs({ count: 300 })).toEqual({
      ttlMs: MAX_TTL,
      source: 'detected',
    });
  });
});

// ── requestQrCode ─────────────────────────────────────────────────────────────
describe('whatsappConnectionService.requestQrCode', () => {
  it('instanceId vazio lança antes de qualquer chamada', async () => {
    await expect(whatsappConnectionService.requestQrCode('')).rejects.toThrow(
      'ID da instância é obrigatório'
    );
    expect(callEvolutionApiMock).not.toHaveBeenCalled();
  });

  it('chama a Evolution com action connect e o nome da instância', async () => {
    await whatsappConnectionService.requestQrCode('suporte_123456');
    expect(callEvolutionApiMock).toHaveBeenCalledWith({
      action: 'connect',
      instanceName: 'suporte_123456',
    });
  });

  it('erro do transporte vira Error com a mensagem da API', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: null,
      error: { message: 'instance not found' },
    });
    await expect(whatsappConnectionService.requestQrCode('x')).rejects.toThrow(
      'instance not found'
    );
  });

  it('erro do transporte sem message usa mensagem padrão', async () => {
    callEvolutionApiMock.mockResolvedValue({ data: null, error: {} });
    await expect(whatsappConnectionService.requestQrCode('x')).rejects.toThrow(
      'Erro ao gerar QR Code na API'
    );
  });

  it('erro no corpo (data.error === true) lança mesmo com HTTP 200', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: { error: true, message: 'instância já conectada' },
      error: null,
    });
    await expect(whatsappConnectionService.requestQrCode('x')).rejects.toThrow(
      'instância já conectada'
    );
  });

  it('sucesso devolve o payload cru da Evolution', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: { base64: 'iVBORw0', count: 45 },
      error: null,
    });
    await expect(whatsappConnectionService.requestQrCode('x')).resolves.toEqual({
      base64: 'iVBORw0',
      count: 45,
    });
  });
});

// ── createInstance (F6-02) ────────────────────────────────────────────────────
describe('whatsappConnectionService.createInstance', () => {
  it('instanceName vazio lança antes de qualquer chamada', async () => {
    await expect(whatsappConnectionService.createInstance('')).rejects.toThrow(
      'Nome da instância é obrigatório'
    );
    expect(callEvolutionApiMock).not.toHaveBeenCalled();
  });

  it('chama a Evolution com action create-instance e defaults Baileys/qrcode', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: { instance: { instanceName: 'Vendas', status: 'created' } },
      error: null,
    });
    await whatsappConnectionService.createInstance('Vendas');
    expect(callEvolutionApiMock).toHaveBeenCalledWith({
      action: 'create-instance',
      instanceName: 'Vendas',
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    });
  });

  it('aceita integration/qrcode customizados', async () => {
    callEvolutionApiMock.mockResolvedValue({ data: { instance: {} }, error: null });
    await whatsappConnectionService.createInstance('Meta', {
      integration: 'WHATSAPP-BUSINESS-CLOUD',
      qrcode: false,
    });
    expect(callEvolutionApiMock).toHaveBeenCalledWith({
      action: 'create-instance',
      instanceName: 'Meta',
      integration: 'WHATSAPP-BUSINESS-CLOUD',
      qrcode: false,
    });
  });

  it('erro do transporte vira Error com a mensagem da API', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: null,
      error: { message: 'instance already exists' },
    });
    await expect(whatsappConnectionService.createInstance('Vendas')).rejects.toThrow(
      'instance already exists'
    );
  });

  it('erro do transporte sem message usa mensagem padrão', async () => {
    callEvolutionApiMock.mockResolvedValue({ data: null, error: {} });
    await expect(whatsappConnectionService.createInstance('Vendas')).rejects.toThrow(
      'Erro ao criar instância na API Evolution'
    );
  });

  it('erro no corpo (data.error === true) lança mesmo com HTTP 200', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: { error: true, message: 'integration not allowed' },
      error: null,
    });
    await expect(whatsappConnectionService.createInstance('Vendas')).rejects.toThrow(
      'integration not allowed'
    );
  });

  it('sucesso devolve o payload cru (com instance.instanceId p/ o INSERT)', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: {
        instance: {
          instanceName: 'Vendas',
          instanceId: '22222222-2222-4222-8222-222222222222',
          status: 'created',
        },
      },
      error: null,
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
    await expect(whatsappConnectionService.requestPairingCode('', '5511999999999')).rejects.toThrow(
      'Nome da instância é obrigatório'
    );
    expect(callEvolutionApiMock).not.toHaveBeenCalled();
  });

  it('número vazio lança antes de qualquer chamada', async () => {
    await expect(whatsappConnectionService.requestPairingCode('Vendas', '')).rejects.toThrow(
      'Número do WhatsApp é obrigatório'
    );
    expect(callEvolutionApiMock).not.toHaveBeenCalled();
  });

  it('chama a Evolution com action pairing-code, instanceName e number', async () => {
    callEvolutionApiMock.mockResolvedValue({ data: { code: 'ABCD-EFGH' }, error: null });
    await whatsappConnectionService.requestPairingCode('Vendas', '5511999999999');
    expect(callEvolutionApiMock).toHaveBeenCalledWith({
      action: 'pairing-code',
      instanceName: 'Vendas',
      number: '5511999999999',
    });
  });

  it('erro do transporte vira Error com a mensagem da API', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: null,
      error: { message: 'number not linked' },
    });
    await expect(
      whatsappConnectionService.requestPairingCode('Vendas', '5511999999999')
    ).rejects.toThrow('number not linked');
  });

  it('erro no corpo (data.error === true) lança', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: { error: true, message: 'instance already connected' },
      error: null,
    });
    await expect(
      whatsappConnectionService.requestPairingCode('Vendas', '5511999999999')
    ).rejects.toThrow('instance already connected');
  });

  it('sucesso devolve o payload cru com o pairing code', async () => {
    callEvolutionApiMock.mockResolvedValue({
      data: { code: 'ABCD-EFGH-IJKL', pairingCode: 'ABCD-EFGH-IJKL' },
      error: null,
    });
    await expect(
      whatsappConnectionService.requestPairingCode('Vendas', '5511999999999')
    ).resolves.toEqual({ code: 'ABCD-EFGH-IJKL', pairingCode: 'ABCD-EFGH-IJKL' });
  });
});

// ── logQrAttempt ──────────────────────────────────────────────────────────────
describe('whatsappConnectionService.logQrAttempt', () => {
  it('propaga o id do usuário autenticado em requested_by', async () => {
    await whatsappConnectionService.logQrAttempt('conn-1', 'inst-1', 'Suporte');
    expect(logQrAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connection_id: 'conn-1',
        instance_id: 'inst-1',
        connection_name: 'Suporte',
        requested_by: 'user-abc',
      })
    );
  });

  it('grava requested_by null quando não há sessão', async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await whatsappConnectionService.logQrAttempt('conn-1', 'inst-1', 'Suporte');
    expect(logQrAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ requested_by: null })
    );
  });

  it('status default é pending', async () => {
    await whatsappConnectionService.logQrAttempt('conn-1', 'inst-1', 'Suporte');
    expect(logQrAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
  });

  it('aceita status explícito', async () => {
    await whatsappConnectionService.logQrAttempt('conn-1', 'inst-1', 'Suporte', 'expired');
    expect(logQrAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'expired' })
    );
  });

  it('erro retornado pelo repositório não lança — devolve o result', async () => {
    logQrAttemptMock.mockResolvedValue({ data: null, error: { message: 'rls denied' } });
    await expect(
      whatsappConnectionService.logQrAttempt('conn-1', 'inst-1', 'Suporte')
    ).resolves.toEqual({ data: null, error: { message: 'rls denied' } });
  });

  it('exceção do repositório é re-lançada', async () => {
    logQrAttemptMock.mockRejectedValue(new Error('network down'));
    await expect(
      whatsappConnectionService.logQrAttempt('conn-1', 'inst-1', 'Suporte')
    ).rejects.toThrow('network down');
  });
});

afterEach(() => {
  vi.useRealTimers();
});
