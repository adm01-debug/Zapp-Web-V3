/**
 * useExternalContact360 — abort plumbing end-to-end (signal do queryFn → dbGet/dbRpc).
 *
 * Incidente: navegação rápida (~45 conversas/60s) enfileirou 100+ RPCs; queries
 * órfãs de conversas abandonadas continuavam na fila porque o fetch não era
 * abortável end-to-end. Estes testes provam:
 *   1. o AbortSignal que o TanStack Query injeta no queryFn (`({ signal })`)
 *      CHEGA ao builder PostgREST via dbGet/dbRpc (`builder.abortSignal(signal)`);
 *   2. abort (cancelQueries) rejeita a RPC com AbortError → TanStack cancela
 *      SILENCIOSAMENTE: sem retry, sem estado de erro (fetchStatus 'idle');
 *   3. backward compat: builder sem `abortSignal` (mock/Promise pura) resolve
 *      normalmente — nenhum caller existente quebra.
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

import { useExternalContact360 } from '@/hooks/useExternalApiManagement';

// ─── Fake PostgREST builder ────────────────────────────────────────────────
// O supabase-js real retorna um builder thenable com `abortSignal(signal)`.
// O mock replica esse contrato: captura o signal (para asserção) e simula o
// fetch — 'resolve' responde com dados; 'hold' fica pendente até o abort
// rejeitar com AbortError (exatamente o que o fetch abortado faz).
function makeBuilder(mode: 'resolve' | 'hold') {
  let signalRef: AbortSignal | undefined;
  const abortSignalSpy = vi.fn();
  const builder = {
    abortSignal: (s: AbortSignal) => {
      signalRef = s;
      abortSignalSpy(s);
      return builder;
    },
    then: (onFulfilled: (v: unknown) => unknown, onRejected: (e: unknown) => unknown) => {
      const p = new Promise((resolve, reject) => {
        const abortError = () => {
          const e = new Error('The operation was aborted.');
          e.name = 'AbortError';
          reject(e);
        };
        if (signalRef?.aborted) {
          abortError();
          return;
        }
        signalRef?.addEventListener('abort', abortError, { once: true });
        if (mode === 'resolve') {
          setTimeout(
            () => resolve({ data: crmData('5511912345678'), error: null }),
            5
          );
        }
        // mode 'hold': nunca resolve — só rejeita via abort (simula fetch em voo)
      });
      return p.then(onFulfilled, onRejected);
    },
  };
  return { builder, abortSignalSpy, getSignal: () => signalRef };
}

function crmData(phone: string) {
  return {
    found: true,
    searched_phone: phone,
    company: { nome_fantasia: 'ACME' },
    contact: { relationship_score: 70 },
    rfm: { segment_code: 'gold' },
    customer: null,
    stakeholder: null,
    contact_social: [],
    company_social: [],
    contact_phones: [],
    contact_emails: [],
    company_phones: [],
    company_emails: [],
    company_address: null,
    contact_interactions: [],
  };
}

// ─── QueryClient Wrapper ───────────────────────────────────────────────────
function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('useExternalContact360 — abort plumbing (signal → dbGet → builder)', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.clearAllMocks();
  });

  it('signal do queryFn chega em dbGet e é aplicado via builder.abortSignal', async () => {
    const { builder, abortSignalSpy } = makeBuilder('resolve');
    mockRpc.mockReturnValue(builder);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useExternalContact360('+55 (11) 91234-5678'), {
      wrapper: makeWrapper(queryClient),
    });

    // O signal do TanStack (AbortSignal interno da query) é aplicado ao builder
    await waitFor(() => expect(abortSignalSpy).toHaveBeenCalledTimes(1));
    expect(abortSignalSpy).toHaveBeenCalledWith(expect.any(AbortSignal));

    // Params continuam intactos no caminho com signal
    expect(mockRpc).toHaveBeenCalledWith(
      'get_contact_360_by_phone',
      expect.objectContaining({ p_phone: '5511912345678' })
    );

    // Resposta normal flui (telemetria recordQueryEvent intacta no caminho)
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.found).toBe(true);
  });

  it('abort da query rejeita com AbortError e o TanStack cancela silenciosamente (sem retry, sem error)', async () => {
    const { builder, abortSignalSpy, getSignal } = makeBuilder('hold');
    mockRpc.mockReturnValue(builder);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useExternalContact360('+55 (11) 91234-5678'), {
      wrapper: makeWrapper(queryClient),
    });

    // Fetch em voo: signal já plumbado no builder, RPC pendente
    await waitFor(() => expect(abortSignalSpy).toHaveBeenCalledTimes(1));
    const captured = getSignal();
    expect(captured).toBeInstanceOf(AbortSignal);
    expect(captured?.aborted).toBe(false);

    // Cancelamento da query (equivalente a unmount + GC / cancelQueries):
    // o TanStack aborta o signal → o fetch rejeita AbortError
    queryClient.cancelQueries();
    await waitFor(() => expect(captured?.aborted).toBe(true));

    // Cancelamento silencioso: sem estado de erro e SEM retry (1 chamada só)
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(result.current.error).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('backward compat: builder sem abortSignal (mock/Promise pura) resolve normalmente', async () => {
    // Mesmo padrão dos testes antigos: rpc retorna Promise pura {data, error}
    mockRpc.mockResolvedValue({ data: crmData('5511912345678'), error: null });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useExternalContact360('+55 (11) 91234-5678'), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.found).toBe(true);
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
