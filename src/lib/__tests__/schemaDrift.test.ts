import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { createMockSupabase } from '@/test/mocks/supabase';
import { fetchDbSchema, detectSchemaDrift } from '../schemaDrift';

type MockClient = ReturnType<typeof createMockSupabase>;

const supabaseMock = vi.hoisted(() => ({ client: null as unknown as MockClient }));

vi.mock('@/integrations/supabase/client', async () => {
  const { createMockSupabase } = await vi.importActual<typeof import('@/test/mocks/supabase')>(
    '@/test/mocks/supabase'
  );
  supabaseMock.client = createMockSupabase();
  return { supabase: supabaseMock.client };
});

// Fixtures espelhando o contrato das RPCs zapp.rpc_schema_tables / rpc_schema_columns
// (por schema — o RPC já filtra; colunas trazem table_name para join em memória).
const FIXTURES: Record<
  string,
  {
    tables: Array<{ table_name: string }>;
    columns: Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: 'YES' | 'NO';
    }>;
  }
> = {
  zapp: {
    tables: [{ table_name: 'evolution_conversations' }, { table_name: 'evolution_health_logs' }],
    columns: [
      { table_name: 'evolution_conversations', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { table_name: 'evolution_conversations', column_name: 'instance_name', data_type: 'text', is_nullable: 'NO' },
      { table_name: 'evolution_health_logs', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
    ],
  },
  evo: {
    tables: [{ table_name: 'evolution_instance_credentials' }],
    columns: [
      { table_name: 'evolution_instance_credentials', column_name: 'api_key', data_type: 'text', is_nullable: 'NO' },
    ],
  },
  public: {
    tables: [{ table_name: 'profiles' }, { table_name: 'contacts' }],
    columns: [
      { table_name: 'profiles', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
      { table_name: 'contacts', column_name: 'id', data_type: 'uuid', is_nullable: 'YES' },
    ],
  },
};

function mockRpcWithFixtures() {
  supabaseMock.client.rpc.mockImplementation((fn: string, args?: { p_schema?: string }) => {
    const schema = args?.p_schema ?? '';
    if (fn === 'rpc_schema_tables') {
      return Promise.resolve({ data: FIXTURES[schema]?.tables ?? [], error: null });
    }
    if (fn === 'rpc_schema_columns') {
      return Promise.resolve({ data: FIXTURES[schema]?.columns ?? [], error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

beforeEach(() => {
  supabaseMock.client.rpc.mockReset();
  mockRpcWithFixtures();
});

describe('schemaDrift.fetchDbSchema (fix: schema drift via RPC)', () => {
  it('monta o Map <schema>.<tabela> → colunas a partir das RPCs', async () => {
    const map = await fetchDbSchema();

    expect(map.size).toBe(5);
    expect(map.has('zapp.evolution_conversations')).toBe(true);
    expect(map.has('evo.evolution_instance_credentials')).toBe(true);
    expect(map.has('public.profiles')).toBe(true);

    const conv = map.get('zapp.evolution_conversations');
    expect(conv?.table_name).toBe('evolution_conversations');
    expect(conv?.columns.map((c) => c.column_name)).toEqual(['id', 'instance_name']);
    // 'NO' → false (normalização information_schema)
    expect(conv?.columns[0].is_nullable).toBe(false);

    const creds = map.get('evo.evolution_instance_credentials');
    expect(creds?.columns[0]).toMatchObject({ column_name: 'api_key', data_type: 'text' });
    // 'YES' → true
    expect(map.get('public.contacts')?.columns[0].is_nullable).toBe(true);
  });

  it('usa rpc_schema_tables e rpc_schema_columns (nunca PostgREST information_schema)', async () => {
    await fetchDbSchema();

    expect(supabaseMock.client.rpc).toHaveBeenCalledWith(
      'rpc_schema_tables',
      expect.objectContaining({ p_schema: 'zapp' })
    );
    expect(supabaseMock.client.rpc).toHaveBeenCalledWith('rpc_schema_tables', { p_schema: 'evo' });
    expect(supabaseMock.client.rpc).toHaveBeenCalledWith('rpc_schema_tables', { p_schema: 'public' });
    expect(supabaseMock.client.rpc).toHaveBeenCalledWith(
      'rpc_schema_columns',
      expect.objectContaining({ p_schema: 'zapp' })
    );

    // Nenhuma leitura via from() (information_schema não é exposto por PostgREST)
    expect(supabaseMock.client.from).not.toHaveBeenCalled();
  });

  it('detectSchemaDrift compara o Map contra os tipos conhecidos', async () => {
    const report = await detectSchemaDrift();

    // Tabelas zapp/evo existem no DB mas não nos tipos gerados
    expect(report.missingFromTypes).toContain('evolution_conversations');
    expect(report.missingFromTypes).toContain('evolution_instance_credentials');
    // Tipos conhecidos presentes no DB (profiles/contacts) não acusam drift
    expect(report.missingFromTypes).not.toContain('profiles');
    expect(report.missingFromTypes).not.toContain('contacts');
    // Tipos conhecidos que não existem no DB fixture
    expect(report.extraInTypes).toContain('messages');
    expect(report.extraInTypes).toContain('workspaces');
  });

  it('é resiliente a erro das RPCs: Map vazio e report sem crash', async () => {
    supabaseMock.client.rpc.mockResolvedValue({ data: null, error: new Error('rpc blocked') });

    const map = await fetchDbSchema();
    expect(map.size).toBe(0);

    const report = await detectSchemaDrift();
    expect(report.missingFromTypes).toEqual([]);
    expect(report.extraInTypes.length).toBeGreaterThan(0);
    expect(report.columnMismatches).toEqual([]);
  });
});
