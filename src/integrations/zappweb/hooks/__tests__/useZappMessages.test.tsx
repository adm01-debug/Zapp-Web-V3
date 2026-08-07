import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { createMockSupabase } from '@/test/mocks/supabase';
import { useZappMessages } from '../useZappMessages';

type MockClient = ReturnType<typeof createMockSupabase>;

// Holder populado pela factory do vi.mock (roda antes dos imports do módulo).
// `table` é passado POR REFERÊNCIA para o createMockSupabase: o mockFrom lê
// `overrides.tables[table].data/.error` em tempo de chamada, então mutar aqui
// dentro dos testes controla o erro resolvido pela query.
const supabaseMock = vi.hoisted(() => ({
  client: null as unknown as MockClient,
  table: { data: [] as unknown[], error: null as unknown },
}));

// Mock do client principal (re-exportado como zappSupabase pelo supabaseClient).
vi.mock('@/integrations/supabase/client', async () => {
  const { createMockSupabase } =
    await vi.importActual<typeof import('@/test/mocks/supabase')>('@/test/mocks/supabase');
  supabaseMock.client = createMockSupabase({
    tables: { evolution_messages_wpp2: supabaseMock.table },
  });
  return { supabase: supabaseMock.client };
});

// log é usado no catch do fetchAll — no-op para o teste focar no estado do hook.
vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Envelope 422 canônico do contract-kit (docs/CONTRACT_TESTING.md).
const CONTRACT_ENVELOPE = {
  error: true,
  code: 'contract_violation',
  message: 'Payload não satisfaz o contrato evolution-messages@v1.',
  contract: 'evolution-messages@v1',
  requestId: 'req_abc123',
  details: [{ path: 'instance', message: 'instância inválida' }],
};

// Envelope de DOMÍNIO (securityErrorResponse): details é OBJETO de metadados —
// o guard DEVE retornar false (docs/CONTRACT_TESTING.md seção "Envelopes de domínio").
const DOMAIN_ENVELOPE = {
  error: true,
  code: 'MALWARE_DETECTED',
  message: 'Arquivo bloqueado pelo scanner.',
  verdict: 'malicious',
  scanId: 'scan_abc123',
  details: { verdict: 'malicious', threat: 'trojan' },
};

const REMOTE_JID = '5511999990001@s.whatsapp.net';

beforeEach(() => {
  supabaseMock.table.error = null;
  supabaseMock.client.from.mockClear();
  supabaseMock.client.channel.mockClear();
  supabaseMock.client.removeChannel.mockClear();
});

describe('useZappMessages — isContractErrorResponse no fetch de mensagens', () => {
  it('erro de contrato (envelope 422 canônico) → mensagem amigável do backend, sem String(e)', async () => {
    supabaseMock.table.error = CONTRACT_ENVELOPE;

    const { result } = renderHook(() =>
      useZappMessages({ remoteJid: REMOTE_JID })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(CONTRACT_ENVELOPE.message);
    expect(result.current.messages).toEqual([]);
  });

  it('erro genérico (Error) → fluxo inalterado (mensagem do erro)', async () => {
    supabaseMock.table.error = new Error('falha de rede na query');

    const { result } = renderHook(() =>
      useZappMessages({ remoteJid: REMOTE_JID })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('falha de rede na query');
  });

  it('envelope de domínio (details como objeto) → NÃO é contrato → comportamento legado intacto', async () => {
    supabaseMock.table.error = DOMAIN_ENVELOPE;

    const { result } = renderHook(() =>
      useZappMessages({ remoteJid: REMOTE_JID })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Mesmo resultado de antes da mudança: objeto não-Error cai no String(e).
    expect(result.current.error).toBe('[object Object]');
  });
});
