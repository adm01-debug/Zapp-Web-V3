/**
 * SIMULAÇÕES EXAUSTIVAS — useCRMManagement (consolidado, ETAPA 43).
 *
 * Cobre os 5 hooks do módulo com foco no CONTRATO com o banco:
 *   - useContactIntelligenceManagement (contact_intelligence)
 *   - useContactNotesManagement (contact_notes)
 *   - useContactEnrichedDataManagement (enrich_contact RPC)
 *   - useContactAssignmentManagement (contact_assignments)
 *   - useContactCustomFieldsManagement (contact_custom_fields)
 *
 * Padrão de mock: builder fluente (como useContactIntelligence.simulacao) que
 * captura a cadeia .from().select().eq().maybeSingle()/insert()/upsert().
 * NUNCA `as any` cru — mocks tipados.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// ── Builder fluente (hoisted) ────────────────────────────────────────────────
type QueryResult = { data: unknown; error: unknown; count?: number | null };

interface MockChain {
  select: (fields?: string) => MockChain;
  eq: (column: string, value: unknown) => MockChain;
  or: (filter: string) => MockChain;
  order: (column: string, options?: { ascending?: boolean }) => MockChain;
  insert: (row: Record<string, unknown>) => Promise<QueryResult>;
  upsert: (row: Record<string, unknown>) => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  then: <T>(onFulfilled: (v: QueryResult) => T) => Promise<T>;
}

const sb = vi.hoisted(() => {
  const calls = {
    from: [] as string[],
    select: [] as Array<[string | undefined]>,
    eq: [] as Array<[string, unknown]>,
    insert: [] as Array<[Record<string, unknown>]>,
    upsert: [] as Array<[Record<string, unknown>]>,
    rpc: [] as Array<[string, Record<string, unknown>]>,
  };
  const results = new Map<string, QueryResult>();
  const defaultResult: QueryResult = { data: null, error: null };

  function setResult(table: string, r: QueryResult): void {
    results.set(table, r);
  }
  function getResult(table: string): QueryResult {
    return results.get(table) ?? defaultResult;
  }

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
      or: (_filter: string) => chain,
      order: (_column: string, _options?: { ascending?: boolean }) => chain,
      insert: (row: Record<string, unknown>) => {
        calls.insert.push([row]);
        return Promise.resolve(getResult(table));
      },
      upsert: (row: Record<string, unknown>) => {
        calls.upsert.push([row]);
        return Promise.resolve(getResult(table));
      },
      maybeSingle: () => Promise.resolve(getResult(table)),
      // `await query` no hook (cadeia sem maybeSingle em alguns caminhos)
      then: (onFulfilled: (v: QueryResult) => unknown) =>
        Promise.resolve(getResult(table)).then(onFulfilled),
    };
    return chain;
  }

  return { calls, setResult, getResult, makeChain };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => sb.makeChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      sb.calls.rpc.push([fn, args]);
      return Promise.resolve(sb.getResult(fn));
    },
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: 'uid-3242312e' } }, error: null }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  useContactIntelligenceManagement,
  useContactNotesManagement,
  useContactEnrichedDataManagement,
  useContactAssignmentManagement,
  useContactCustomFieldsManagement,
} from '@/hooks/useCRMManagement';

const UUID = '76879475-0590-41be-8941-56807f63b2f1';

const wrapper = ({ children }: { children: React.ReactNode }) => <>{children}</>;

beforeEach(() => {
  sb.calls.from.length = 0;
  sb.calls.select.length = 0;
  sb.calls.eq.length = 0;
  sb.calls.insert.length = 0;
  sb.calls.upsert.length = 0;
  sb.calls.rpc.length = 0;
});

describe('useContactIntelligenceManagement (contact_intelligence)', () => {
  it('consulta com select+eq contact_id + maybeSingle (contrato do banco)', async () => {
    sb.setResult('contact_intelligence', { data: null, error: null });
    const { result } = renderHook(() => useContactIntelligenceManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(sb.calls.from).toContain('contact_intelligence');
    expect(sb.calls.eq).toContainEqual(['contact_id', UUID]);
  });

  it('sem contactId: nao consulta e loading=false', async () => {
    const { result } = renderHook(() => useContactIntelligenceManagement(undefined), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.from).not.toContain('contact_intelligence');
  });

  it('JID (nao-UUID): nao consulta (guard isValidUUID)', async () => {
    const { result } = renderHook(
      () => useContactIntelligenceManagement('551199384518134@s.whatsapp.net'),
      { wrapper }
    );
    // O hook retorna cedo sem setLoading(false) para JID (comportamento real);
    // o contrato essencial e NAO tocar o banco.
    expect(sb.calls.from).not.toContain('contact_intelligence');
    expect(result.current.intelligence).toBeNull();
  });

  it('PGRST116 (sem linha): nao lanca, intelligence null', async () => {
    sb.setResult('contact_intelligence', {
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    });
    const { result } = renderHook(() => useContactIntelligenceManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.intelligence).toBeNull();
  });

  it('erro real (nao-PGRST116): intelligence null (sem crash)', async () => {
    sb.setResult('contact_intelligence', {
      data: null,
      error: { code: '500', message: 'boom' },
    });
    const { result } = renderHook(() => useContactIntelligenceManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.intelligence).toBeNull();
  });

  it('dados completos: expoe campos reais do ContactIntelligenceRow', async () => {
    sb.setResult('contact_intelligence', {
      data: {
        contact_id: UUID,
        sentiment: 'positive',
        engagement_score: 66.3,
        predicted_value: 1200,
        risk_level: 'high',
      },
      error: null,
    });
    const { result } = renderHook(() => useContactIntelligenceManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.intelligence?.sentiment).toBe('positive');
    expect(result.current.intelligence?.engagement_score).toBe(66.3);
    expect(result.current.intelligence?.risk_level).toBe('high');
  });
});

describe('useContactNotesManagement (contact_notes)', () => {
  it('listar notas: select + eq contact_id', async () => {
    sb.setResult('contact_notes', {
      data: [
        { id: 'n1', contact_id: UUID, content: 'nota', author_id: 'a1', created_at: '2026-07-31T00:00:00Z' },
      ],
      error: null,
    });
    const { result } = renderHook(() => useContactNotesManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.from).toContain('contact_notes');
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].content).toBe('nota');
  });

  it('adicionar nota: getUser -> profiles -> insert com author_id=profile.id (contrato FK)', async () => {
    sb.setResult('contact_notes', { data: [], error: null });
    sb.setResult('profiles', {
      data: { id: '04649406-c308-47a3-b5b3-cb381979da21' }, // profiles.id (nao user_id)
      error: null,
    });
    const { result } = renderHook(() => useContactNotesManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.addNote('nova nota');
    expect(sb.calls.from).toContain('profiles');
    expect(sb.calls.insert).toContainEqual([
      {
        contact_id: UUID,
        content: 'nova nota',
        author_id: '04649406-c308-47a3-b5b3-cb381979da21',
      },
    ]);
  });

  it('sem contactId: nao consulta', async () => {
    const { result } = renderHook(() => useContactNotesManagement(undefined), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.from).not.toContain('contact_notes');
  });
});

describe('useContactEnrichedDataManagement (enrich_contact RPC)', () => {
  it('chama rpc enrich_contact com contact_id (contrato jsonb)', async () => {
    sb.setResult('enrich_contact', {
      data: { contact_id: UUID, enriched: false, source: 'stub', data: { id: UUID } },
      error: null,
    });
    const { result } = renderHook(() => useContactEnrichedDataManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.rpc).toContainEqual(['enrich_contact', { contact_id: UUID }]);
    expect(result.current.enrichedData?.source).toBe('stub');
    expect(result.current.enrichedData?.enriched).toBe(false);
  });

  it('erro do RPC: enrichedData null', async () => {
    sb.setResult('enrich_contact', { data: null, error: { message: 'rpc fail' } });
    const { result } = renderHook(() => useContactEnrichedDataManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.enrichedData).toBeNull();
  });

  it('sem contactId: nao chama RPC', async () => {
    const { result } = renderHook(() => useContactEnrichedDataManagement(undefined), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.rpc).toHaveLength(0);
  });

  it('JID: nao chama RPC (guard UUID)', async () => {
    const { result } = renderHook(() => useContactEnrichedDataManagement('55@s.whatsapp.net'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.rpc).toHaveLength(0);
  });
});

describe('useContactAssignmentManagement (contact_assignments)', () => {
  it('consulta assignment com select+eq + maybeSingle', async () => {
    sb.setResult('contact_assignments', {
      data: {
        id: 'ass1',
        contact_id: UUID,
        assigned_to_user_id: '3242312e-710b-4e3a-80e5-ead70f210fc7',
        assigned_at: '2026-07-31T00:00:00Z',
        created_at: '2026-07-31T00:00:00Z',
        updated_at: '2026-07-31T00:00:00Z',
      },
      error: null,
    });
    const { result } = renderHook(() => useContactAssignmentManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.from).toContain('contact_assignments');
    expect(result.current.assignment?.assigned_to_user_id).toBe('3242312e-710b-4e3a-80e5-ead70f210fc7');
  });

  it('assignToUser: upsert com contact_id + assigned_to_user_id e refetch', async () => {
    sb.setResult('contact_assignments', { data: null, error: null });
    const { result } = renderHook(() => useContactAssignmentManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.assignToUser('3242312e-710b-4e3a-80e5-ead70f210fc7');
    expect(sb.calls.upsert).toContainEqual([
      { contact_id: UUID, assigned_to_user_id: '3242312e-710b-4e3a-80e5-ead70f210fc7' },
    ]);
    // refetch apos upsert: >=2 consultas a contact_assignments
    const n = sb.calls.from.filter((t) => t === 'contact_assignments').length;
    expect(n).toBeGreaterThanOrEqual(2);
  });

  it('sem contactId: nao consulta', async () => {
    const { result } = renderHook(() => useContactAssignmentManagement(undefined), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.from).not.toContain('contact_assignments');
  });
});

describe('useContactCustomFieldsManagement (contact_custom_fields)', () => {
  it('consulta fields com select+eq contact_id', async () => {
    sb.setResult('contact_custom_fields', {
      data: [{ id: 'f1', contact_id: UUID, field_name: 'cidade', field_value: 'SP' }],
      error: null,
    });
    const { result } = renderHook(() => useContactCustomFieldsManagement(UUID), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.from).toContain('contact_custom_fields');
    expect(result.current.fields).toHaveLength(1);
    expect(result.current.fields[0].field_name).toBe('cidade');
  });

  it('sem contactId: nao consulta', async () => {
    const { result } = renderHook(() => useContactCustomFieldsManagement(undefined), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sb.calls.from).not.toContain('contact_custom_fields');
  });
});
