/**
 * useExternalContact360 (single) — gate de phone e cache.
 *
 * Regressão da rajada de queries 429: o hook single pode ser chamado com
 * phone vazio/invisível e remontado sem cache → queries extras por contato.
 * Estes testes garantem:
 *   1. phone vazio/undefined        → 0 fetches (enabled: false)
 *   2. phone com < 8 dígitos        → 0 fetches (mesma validação do batch)
 *   3. phone válido remontado dentro do staleTime (10min) → 1 fetch total
 *      (cache hit no remount — mesmo QueryClient, sem refetch)
 *   4. troca de phone → placeholderData mantém os dados anteriores enquanto
 *      o novo phone carrega (sem flicker de skeleton)
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

// ─── QueryClient Wrapper ───────────────────────────────────────────────────
// gcTime NÃO é 0 aqui de propósito: o teste de remount depende do cache
// sobreviver ao unmount. Cada teste cria seu próprio QueryClient, então não
// há vazamento de cache entre testes.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
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

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('useExternalContact360 (single) — gate de phone e cache', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.clearAllMocks();
  });

  it('phone vazio/undefined → 0 fetches e nunca entra em loading', async () => {
    const { result } = renderHook(() => useExternalContact360(undefined), {
      wrapper: createWrapper(),
    });

    // dá tempo de qualquer fetch espúrio disparar
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    // enabled: false → queryFn nunca roda → data permanece undefined (não null)
    expect(result.current.data).toBeUndefined();
  });

  it('phone com menos de 8 dígitos → 0 fetches (mesma validação do batch)', async () => {
    const { result } = renderHook(() => useExternalContact360('12345'), {
      wrapper: createWrapper(),
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });

  it('phone válido remontado dentro do staleTime → 1 fetch total (cache hit)', async () => {
    mockRpc.mockResolvedValue({ data: crmData('5511912345678'), error: null });
    const wrapper = createWrapper();

    // 1ª montagem: fetch único com phone limpo (digits) + instance
    const first = renderHook(() => useExternalContact360('+55 (11) 91234-5678'), { wrapper });
    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));
    expect(mockRpc).toHaveBeenCalledWith(
      'get_contact_360_by_phone',
      expect.objectContaining({ p_phone: '5511912345678' })
    );
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(first.result.current.data?.found).toBe(true);
    first.unmount();

    // 2ª montagem (mesmo QueryClient, dentro do staleTime de 10min):
    // cache hit imediato — NENHUM fetch novo.
    const second = renderHook(() => useExternalContact360('+55 (11) 91234-5678'), { wrapper });
    await waitFor(() => expect(second.result.current.data?.found).toBe(true));
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(second.result.current.isLoading).toBe(false);
  });

  it('troca de phone → placeholderData mantém dados anteriores enquanto o novo carrega (sem flicker)', async () => {
    mockRpc.mockResolvedValueOnce({ data: crmData('5511912345678'), error: null });
    let resolveB!: (v: unknown) => void;
    const pendingB = new Promise((res) => {
      resolveB = res;
    });
    mockRpc.mockImplementationOnce(() => pendingB);

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ phone }: { phone: string | undefined }) => useExternalContact360(phone),
      { initialProps: { phone: '5511912345678' }, wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.searched_phone).toBe('5511912345678');

    // Novo phone: fetch pendente → placeholderData segura os dados anteriores
    rerender({ phone: '5511987654321' });
    expect(result.current.data?.searched_phone).toBe('5511912345678');
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.isLoading).toBe(false);

    // Resolve o fetch do novo phone → placeholder é substituído pelos dados reais
    resolveB({ data: crmData('5511987654321'), error: null });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.searched_phone).toBe('5511987654321');
  });
});
