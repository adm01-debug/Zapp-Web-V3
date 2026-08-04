import { vi } from 'vitest';

type QueryResult = { data: unknown; error: unknown };
type QueryBuilder = Record<string, ReturnType<typeof vi.fn>>;

// Chainable query builder mock
function createQueryBuilder(resolvedData: unknown = [], resolvedError: unknown = null) {
  const result: QueryResult = { data: resolvedData, error: resolvedError };

  const builder: QueryBuilder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: vi
      .fn()
      .mockImplementation((resolve: (r: QueryResult) => unknown) =>
        Promise.resolve(result).then(resolve)
      ),
  };

  return builder;
}

type TableOverride = { data?: unknown; error?: unknown };
type Overrides = { auth?: Record<string, unknown>; tables?: Record<string, TableOverride> };

/** supabase utilities and exports. */
export function createMockSupabase(overrides: Overrides = {}) {
  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    onAuthStateChange: vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides.auth,
  };

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (overrides.tables && overrides.tables[table]) {
      return createQueryBuilder(overrides.tables[table].data, overrides.tables[table].error);
    }
    return createQueryBuilder();
  });

  const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

  const mockChannel = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  });

  // `.schema(...)` é um anti-pattern pós-consolidação (PGRST_DB_SCHEMAS não
  // expõe `evo`/`vault`). O spy existe para os testes ASSERTAREM que nunca é
  // chamado. Se algum código chamar, a chain devolve um builder vazio (o
  // teste que o permite precisa mockar explicitamente).
  const mockSchema = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(createQueryBuilder()) });

  return {
    auth: mockAuth,
    from: mockFrom,
    rpc: mockRpc,
    channel: mockChannel,
    removeChannel: vi.fn(),
    schema: mockSchema,
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
}

/** mock Supabase constant. */
export const mockSupabase = createMockSupabase();
