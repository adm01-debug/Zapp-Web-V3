/**
 * TESTES REAIS — useLatestAnalysis (GAP-6 / Etapa 64, plano/fase-07.md)
 * ====================================================================
 * Estado da fonte no momento da escrita: STUB — queryFn retorna `null` sempre,
 * nenhuma RPC é chamada, retorno é { analysis, loading } (sem `error`).
 *
 * CONTRATO FUTURO codificado aqui (implementador: fazer o hook satisfazer estes
 * testes, NÃO editar este arquivo):
 *
 *   useLatestAnalysis(contactId: string | null | undefined)
 *     → { analysis: ContactAnalysis | null, loading: boolean, error: Error | null }
 *
 *   1. contactId presente → query ativa; chama UMA RPC de análise via
 *      supabase.rpc (nome contendo 'analysis', ex.: rpc_latest_conversation_analysis
 *      conforme plano 64.1) com o contact id nos argumentos; normaliza o payload
 *      em ContactAnalysis (sentiment/urgency/summary/department) e expõe em `analysis`.
 *   2. RPC falha ({ data: null, error }) → NUNCA null silencioso: `error` exposto
 *      com a mensagem (Error.message), `analysis` null.
 *   3. RPC sem dados ({ data: null, error: null }) → empty honesto:
 *      { analysis: null, error: null } — vazio é distinto de erro.
 *   4. contactId null/undefined → nenhum fetch (rpc NÃO chamada).
 *
 * ESTADO RED ESPERADO (até o executor concluir a Etapa 64): testes 1–3 falham —
 * o stub não chama RPC e não expõe `error`. Erros de TIPO (TS2339: 'error' não
 * existe no retorno do stub) são sinais válidos de RED, não bugs — somem junto
 * com a implementação. Teste 4 é guard de contrato (já GREEN no stub).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const rpcMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
  },
}));

vi.mock('@/lib/logger');

import { useLatestAnalysis } from '@/hooks/useLatestAnalysis';

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const CONTACT_UUID = '00000000-0000-4000-8000-000000000001';

/** Payload realista de análise mais recente (shape de conversation_analyses + contrato 64.1). */
const ANALYSIS_PAYLOAD = {
  id: 'a1',
  conversation_id: CONTACT_UUID,
  contact_id: CONTACT_UUID,
  summary: 'Cliente pediu reembolso após atraso na entrega',
  sentiment: 'negativo',
  urgency: 'alta',
  department: 'Suporte',
  confidence: 0.92,
  created_at: '2024-01-02T10:00:00Z',
};

describe('useLatestAnalysis (contrato real GAP-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    fromMock.mockResolvedValue({ data: [], error: null });
    rpcMock.mockResolvedValue({ data: null, error: null });
  });

  it('1. expõe a análise quando a RPC retorna dados', async () => {
    rpcMock.mockResolvedValue({ data: ANALYSIS_PAYLOAD, error: null });

    const { result } = renderHook(() => useLatestAnalysis(CONTACT_UUID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // A query chama uma RPC de análise (não é mais stub sem fetch).
    expect(rpcMock).toHaveBeenCalled();
    const rpcName = String(rpcMock.mock.calls[0]?.[0] ?? '');
    expect(rpcName).toMatch(/analysis/i);
    // O contact id chega nos argumentos da RPC (nome do parâmetro é livre).
    expect(JSON.stringify(rpcMock.mock.calls[0]?.[1] ?? {})).toContain(CONTACT_UUID);

    // Payload normalizado e exposto para a UI.
    const analysis = result.current.analysis;
    expect(analysis).not.toBeNull();
    expect(analysis?.sentiment).toBe('negativo');
    expect(analysis?.urgency).toBe('alta');
    expect(analysis?.summary).toBe('Cliente pediu reembolso após atraso na entrega');
    expect(analysis?.department).toBe('Suporte');
    expect(result.current.error).toBeNull();
  });

  it('2. expõe erro com mensagem quando a RPC falha (nunca null silencioso)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'RPC não permitida: permissão negada (42501)', code: '42501' },
    });

    const { result } = renderHook(() => useLatestAnalysis(CONTACT_UUID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Erro visível com mensagem — o hook NÃO pode engolir a falha como null mudo.
    expect(result.current.error).toBeTruthy();
    expect(result.current.error?.message ?? String(result.current.error)).toContain(
      'não permitida',
    );
    expect(result.current.analysis).toBeNull();
  });

  it('3. estado vazio honesto quando a RPC retorna sem dados (vazio ≠ erro)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useLatestAnalysis(CONTACT_UUID), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(rpcMock).toHaveBeenCalled();
    expect(result.current.analysis).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('4. guard: não dispara fetch sem contactId', async () => {
    const { result } = renderHook(() => useLatestAnalysis(null), {
      wrapper: makeWrapper(),
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.analysis).toBeNull();
  });
});
