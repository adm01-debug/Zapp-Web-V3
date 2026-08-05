/**
 * useExternalContact360Batch — regressão do BUG #9.
 *
 * A RPC get_companies_by_phones_batch devolve um ARRAY de linhas
 * ({phone, company, full_name, lead_status}) em produção. O código antigo
 * fazia Object.entries(data) sobre o array → chaves '0','1',... → lookup()
 * nunca acertava e o company_name do CRM nunca enriquecia a lista.
 *
 * Estes testes garantem o parse defensivo:
 *   (a) array  → chaveia por row.phone ?? row.phone_number ?? row.telefone
 *   (b) objeto → Object.entries (compatibilidade legada)
 *   (c) outro  → Map vazio + log.warn, sem throw
 * e que chaves de telefone null/vazias são ignoradas (não viram map.set('0')).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Mocks ─────────────────────────────────────────────────────────────────
const mockRpc = vi.hoisted(() => vi.fn());

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/lib/logger', () => ({
  log: mockLogger,
  logger: mockLogger,
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  generateRequestTag: vi.fn(() => 'req-test'),
  generateCorrelationId: vi.fn(() => 'corr-test'),
  getSessionId: vi.fn(() => 'session-test'),
  logPerformance: vi.fn(),
  logAsyncPerformance: vi.fn(),
  Logger: class LoggerMock {},
}));

import { useExternalContact360Batch } from '@/hooks/useExternalApiManagement';
import { log } from '@/lib/logger';

// ─── QueryClient Wrapper ───────────────────────────────────────────────────
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function crmRow(overrides: Record<string, unknown>) {
  return {
    company_name: 'ACME',
    logo_url: null,
    vendedor_nome: 'Vendedor Teste',
    cliente_ativado: true,
    total_pedidos: 3,
    valor_total_compras: 1500,
    rfm_segment: 'gold',
    rfm_score: 88,
    ...overrides,
  };
}

async function renderBatch(phones: string[]) {
  const utils = renderHook(() => useExternalContact360Batch(phones), {
    wrapper: createWrapper(),
  });
  await waitFor(() => expect(utils.result.current.isLoading).toBe(false));
  return utils.result.current;
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('useExternalContact360Batch — parse defensivo do Map (BUG #9)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.clearAllMocks();
  });

  it('chaveia linhas do ARRAY da RPC por telefone e NORMALIZA company→company_name (shape real de produção)', async () => {
    // Shape REAL de produção (pg_get_functiondef 2026-08-05):
    // RETURNS TABLE(phone text, company text, full_name text, lead_status text)
    // — NÃO existe company_name na resposta; o hook deve normalizar.
    mockRpc.mockResolvedValue({
      data: [
        {
          phone: '+5511912345678',
          company: 'ACME',
          full_name: 'João Silva',
          lead_status: 'lead',
        },
        {
          phone: '11987654321',
          company: 'OUTRA',
          full_name: 'Maria',
          lead_status: 'customer',
        },
      ],
      error: null,
    });

    const { batchData, lookup } = await renderBatch(['5511912345678', '11987654321']);

    // +5511912345678 → raw '+5511912345678' + clean '5511912345678' (2 chaves)
    // 11987654321    → raw '11987654321' + '55' + '11987654321' (2 chaves)
    expect(batchData.size).toBe(4);

    // Normalização: company da RPC vira company_name no contrato do consumidor
    expect(lookup('5511912345678')?.company_name).toBe('ACME');
    expect(lookup('+5511912345678')?.company_name).toBe('ACME');
    expect(lookup('5511987654321')?.company_name).toBe('OUTRA');
    expect(lookup('11987654321')?.company_name).toBe('OUTRA');
    // nunca chaveia por índice numérico do array
    expect(batchData.has('0')).toBe(false);
    expect(batchData.has('1')).toBe(false);
  });

  it('aceita variações de chave de telefone da linha (phone_number / telefone)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { phone_number: '+5511912345678', company_name: 'VIA_PHONE_NUMBER' },
        { telefone: '11912340000', company_name: 'VIA_TELEFONE' },
      ],
      error: null,
    });

    const { batchData, lookup } = await renderBatch(['5511912345678', '11912340000']);

    expect(lookup('5511912345678')?.company_name).toBe('VIA_PHONE_NUMBER');
    expect(lookup('11912340000')?.company_name).toBe('VIA_TELEFONE');
    expect(batchData.size).toBe(4);
  });

  it('aceita objeto plano {phone: row} (compatibilidade legada via Object.entries)', async () => {
    mockRpc.mockResolvedValue({
      data: {
        '5511912345678': crmRow({ company_name: 'ACME' }),
        '11999998888': crmRow({ company_name: 'OUTRA' }),
      },
      error: null,
    });

    const { batchData, lookup } = await renderBatch(['5511912345678', '11999998888']);

    expect(lookup('5511912345678')?.company_name).toBe('ACME');
    // chave sem DDI no objeto também recebe o prefixo 55
    expect(lookup('5511999998888')?.company_name).toBe('OUTRA');
    expect(batchData.size).toBe(3);
  });

  it('retorna Map vazio sem throw quando a RPC devolve null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { batchData, lookup } = await renderBatch(['5511912345678']);

    expect(batchData.size).toBe(0);
    expect(lookup('5511912345678')).toBeUndefined();
  });

  it('loga warn e retorna Map vazio para shapes inesperados (ex.: string)', async () => {
    mockRpc.mockResolvedValue({ data: 'resposta-inesperada', error: null });

    const { batchData } = await renderBatch(['5511912345678']);

    expect(batchData.size).toBe(0);
    expect(log.warn).toHaveBeenCalled();
  });

  it('ignora linhas com telefone null/vazio/whitespace (não cria chave "0" nem "")', async () => {
    mockRpc.mockResolvedValue({
      data: [
        null,
        { phone: '', company_name: 'VAZIO' },
        { phone: null, company_name: 'NULO' },
        { phone: undefined, company_name: 'UNDEFINED' },
        { phone_number: '   ', company_name: 'ESPACO' },
        { telefone: '11912340000', company_name: 'OK' },
      ],
      error: null,
    });

    const { batchData, lookup } = await renderBatch(['11912340000']);

    expect(batchData.size).toBe(2); // '11912340000' + '5511912340000'
    expect(batchData.has('')).toBe(false);
    expect(batchData.has('0')).toBe(false);
    expect(lookup('11912340000')?.company_name).toBe('OK');
  });

  it('ignora chaves vazias no branch de objeto plano', async () => {
    mockRpc.mockResolvedValue({
      data: {
        '': crmRow({ company_name: 'VAZIO' }),
        '5511912345678': crmRow({ company_name: 'ACME' }),
      },
      error: null,
    });

    const { batchData, lookup } = await renderBatch(['5511912345678']);

    expect(batchData.size).toBe(1);
    expect(batchData.has('')).toBe(false);
    expect(lookup('5511912345678')?.company_name).toBe('ACME');
  });
});
