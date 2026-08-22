/**
 * TESTES DE DEDUPE + LAZY — useContactAssignmentManagement (contact_assignments).
 *
 * Cobre o fix do bug de produção (HTTP 429 / fila do semáforo de 8 slots):
 *   - single-flight: 2 mounts do MESMO contactId no mesmo tick → 1 fetch só
 *     (react-query deduplica por queryKey; chave estável derivada de contactId);
 *   - lazy/enabled: contactId ausente ou JID (não-UUID) → zero fetches;
 *   - select mínimo: nunca select('*') — colunas explícitas (shape preservado);
 *   - staleTime: 2 mounts sequenciais (mesmo QueryClient) → 1 fetch (cache);
 *   - assignToUser: upsert + refetch explícito (2 fetches no total).
 *
 * Padrão de mock: builder fluente hoisted (mesmo do
 * useCRMManagement.simulacao.test.tsx) + promessa "gate" deferida para provar
 * dedupe in-flight sem depender de timing de resolução.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type QueryResult = { data: unknown; error: unknown; count?: number | null };

interface MockChain {
  select: (fields?: string) => MockChain;
  eq: (column: string, value: unknown) => MockChain;
  order: (column: string, options?: { ascending?: boolean }) => MockChain;
  abortSignal: (signal: AbortSignal | undefined) => MockChain;
  maybeSingle: () => Promise<QueryResult>;
  upsert: (row: Record<string, unknown>) => Promise<QueryResult>;
}

const sb = vi.hoisted(() => {
  const calls = {
    from: [] as string[],
    select: [] as Array<[string | undefined]>,
    eq: [] as Array<[string, unknown]>,
    upsert: [] as Array<[Record<string, unknown>]>,
    maybeSingle: [] as Array<[]>,
  };
  const results = new Map<string, QueryResult>();
  // Gate deferido: quando instalado, maybeSingle() devolve ESTA promise
  // (não-resolvida) — permite provar dedupe in-flight.
  let pendingSingle: Promise<QueryResult> | null = null;

  function makeChain(table: string): MockChain {
    calls.from.push(table);
    const chain: MockChain = {
      select: (fields?: string) => {
        calls.select.push([fields]);
        return chain;
      },
      eq: (column: string, value: unknown) => {
        calls.eq.push([column, value]);
        return chain;
      },
      order: () => chain,
      // Espelha o postgrest-js real: .abortSignal() muta e retorna a MESMA
      // instância (não cria um novo builder) — ver RCA 2026-08-22.
      abortSignal: () => chain,
      maybeSingle: () => {
        calls.maybeSingle.push([]);
        return (
          pendingSingle ?? Promise.resolve(results.get(table) ?? { data: null, error: null })
        );
      },
      upsert: (row: Record<string, unknown>) => {
        calls.upsert.push([row]);
        return Promise.resolve(results.get(table) ?? { data: null, error: null });
      },
    };
    return chain;
  }

  return {
    calls,
    setResult: (table: string, r: QueryResult) => results.set(table, r),
    installPendingSingle: (p: Promise<QueryResult>) => {
      pendingSingle = p;
    },
    clearPendingSingle: () => {
      pendingSingle = null;
    },
    makeChain,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => sb.makeChain(table),
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'uid-3242312e' } }, error: null }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { useContactAssignmentManagement } from '@/hooks/useCRMManagement';

const UUID = '76879475-0590-41be-8941-56807f63b2f1';
const ASSIGNEE = '3242312e-710b-4e3a-80e5-ead70f210fc7';

/** Row completa de zapp.contact_assignments (6 colunas reais). */
const ROW = {
  id: 'ass1',
  contact_id: UUID,
  assigned_to_user_id: ASSIGNEE,
  assigned_at: '2026-07-31T00:00:00Z',
  created_at: '2026-07-31T00:00:00Z',
  updated_at: '2026-07-31T00:00:00Z',
};

const MINIMAL_SELECT = 'id, contact_id, assigned_to_user_id, assigned_at, created_at, updated_at';

/** QueryClient SEM gcTime:0 — preserva o cache entre mounts (como no app). */
function createClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function assignmentFetches(): number {
  return sb.calls.from.filter((t) => t === 'contact_assignments').length;
}

beforeEach(() => {
  sb.calls.from.length = 0;
  sb.calls.select.length = 0;
  sb.calls.eq.length = 0;
  sb.calls.upsert.length = 0;
  sb.calls.maybeSingle.length = 0;
  sb.clearPendingSingle();
});

describe('useContactAssignmentManagement — dedupe + lazy (contact_assignments)', () => {
  it('2 mounts do mesmo contactId no mesmo tick → exatamente 1 fetch (single-flight por queryKey)', async () => {
    let resolveFetch!: (r: QueryResult) => void;
    const gate = new Promise<QueryResult>((res) => {
      resolveFetch = res;
    });
    sb.installPendingSingle(gate);

    // MESMO QueryClient (como no AppProviders do app): cache compartilhado.
    const client = createClient();
    const wrapper = makeWrapper(client);

    const first = renderHook(() => useContactAssignmentManagement(UUID), { wrapper });
    const second = renderHook(() => useContactAssignmentManagement(UUID), { wrapper });

    // Mesmo tick, fetch ainda em voo (gate pendente): apenas 1 consulta.
    await Promise.resolve();
    await Promise.resolve();
    expect(assignmentFetches()).toBe(1);

    // Libera o fetch: ambos os observers recebem o MESMO resultado.
    resolveFetch({ data: ROW, error: null });

    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(assignmentFetches()).toBe(1);
    expect(first.result.current.assignment?.assigned_to_user_id).toBe(ASSIGNEE);
    expect(second.result.current.assignment).toEqual(first.result.current.assignment);
  });

  it('2 mounts sequenciais (mesmo QueryClient, cache fresco) → 1 fetch (staleTime >= 30s)', async () => {
    sb.setResult('contact_assignments', { data: ROW, error: null });

    const client = createClient();
    const wrapper = makeWrapper(client);

    const first = renderHook(() => useContactAssignmentManagement(UUID), { wrapper });
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    first.unmount();

    // Remonta com o mesmo contactId: dentro do staleTime → cache hit, sem fetch.
    const second = renderHook(() => useContactAssignmentManagement(UUID), { wrapper });
    await waitFor(() => expect(second.result.current.loading).toBe(false));

    expect(assignmentFetches()).toBe(1);
    expect(second.result.current.assignment?.assigned_to_user_id).toBe(ASSIGNEE);
  });

  it('select mínimo explícito — nunca select("*"); shape público preservado', async () => {
    sb.setResult('contact_assignments', { data: ROW, error: null });

    const { result } = renderHook(() => useContactAssignmentManagement(UUID), {
      wrapper: makeWrapper(createClient()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(sb.calls.select).toContainEqual([MINIMAL_SELECT]);
    expect(sb.calls.select.some(([fields]) => fields === '*')).toBe(false);
    expect(sb.calls.eq).toContainEqual(['contact_id', UUID]);
    // Shape público intacto: objeto completo com as 6 colunas reais.
    expect(result.current.assignment).toEqual(ROW);
  });

  it('enabled/lazy: contactId ausente ou JID (não-UUID) → zero fetches e loading=false', async () => {
    const client = createClient();
    const wrapper = makeWrapper(client);

    const noId = renderHook(() => useContactAssignmentManagement(undefined), { wrapper });
    await waitFor(() => expect(noId.result.current.loading).toBe(false));
    expect(noId.result.current.assignment).toBeNull();
    noId.unmount();

    const jid = renderHook(() => useContactAssignmentManagement('551199384518134@s.whatsapp.net'), {
      wrapper,
    });
    await waitFor(() => expect(jid.result.current.loading).toBe(false));
    expect(jid.result.current.assignment).toBeNull();
    jid.unmount();

    expect(sb.calls.from).not.toContain('contact_assignments');
  });

  it('PGRST116 (sem linha): não lança, assignment null, loading=false', async () => {
    sb.setResult('contact_assignments', {
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });

    const { result } = renderHook(() => useContactAssignmentManagement(UUID), {
      wrapper: makeWrapper(createClient()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(assignmentFetches()).toBe(1);
    expect(result.current.assignment).toBeNull();
  });

  it('assignToUser: upsert com contact_id + assigned_to_user_id e refetch explícito', async () => {
    sb.setResult('contact_assignments', { data: ROW, error: null });

    const { result } = renderHook(() => useContactAssignmentManagement(UUID), {
      wrapper: makeWrapper(createClient()),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.assignToUser(ASSIGNEE);
    expect(sb.calls.upsert).toContainEqual([
      { contact_id: UUID, assigned_to_user_id: ASSIGNEE },
    ]);
    // SELECTs (maybeSingle) — o upsert NÃO seleciona: 1 mount + 1 refetch
    // pós-upsert = exatamente 2. (from() conta 3: mount + upsert + refetch.)
    expect(sb.calls.maybeSingle).toHaveLength(2);
    expect(assignmentFetches()).toBe(3);
  });
});
