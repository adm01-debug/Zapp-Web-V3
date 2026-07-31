/**
 * Simulações do debounce global de touchLastSeen.
 *
 * Contrato verificado (comportamento corrigido):
 *   - Debounce GLOBAL de módulo (120s): pendingTimer/lastWriteAt/inflight vivem
 *     no escopo do módulo, não da chamada.
 *   - 10 chamadas em sequência → exatamente 1 write após o debounce.
 *   - Chamada durante inflight → retorna sem agendar timer extra.
 *   - Chamada após 120s → nova janela, novo write permitido.
 *   - getUser com user → update filtrado por .eq('user_id', user.id)
 *     (coluna user_id, NÃO id — verificado no banco).
 *   - getUser sem user → nenhum write.
 *   - update com { error } → log.error chamado (não silencioso).
 *   - update ok → sem log.error.
 *
 * Estado global do módulo é resetado entre testes via vi.resetModules() +
 * import dinâmico. Tempo: fake timers com base em 0 (Date.now() = 0), para o
 * primeiro delay ser exatamente DEBOUNCE_MS.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== Assinaturas reais da cadeia mockada (vi.fn<AssinaturaReal>()) =====
type UserShape = { id: string };
type GetUserResult = { data: { user: UserShape | null }; error: null };
type UpdateResult = { data: null; error: { message: string } | null };
type EqFn = (column: string, value: string) => Promise<UpdateResult>;
type UpdateFn = (payload: { last_seen: string }) => { eq: EqFn };
type FromFn = (table: string) => { update: UpdateFn };
type GetUserFn = () => Promise<GetUserResult>;

const { mockFrom, mockUpdate, mockEq, mockGetUser, mockLogError } = vi.hoisted(() => {
  const mockEq = vi.fn<EqFn>().mockResolvedValue({ data: null, error: null });
  const mockUpdate = vi.fn<UpdateFn>(() => ({ eq: mockEq }));
  const mockFrom = vi.fn<FromFn>(() => ({ update: mockUpdate }));
  const mockGetUser = vi
    .fn<GetUserFn>()
    .mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  const mockLogError = vi.fn<(message: string, ...args: unknown[]) => void>();
  return { mockFrom, mockUpdate, mockEq, mockGetUser, mockLogError };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: mockLogError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

type TouchLastSeenModule = typeof import('../touchLastSeen');
let touchLastSeen: TouchLastSeenModule['touchLastSeen'];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(0)); // base 0 → primeiro delay = DEBOUNCE_MS exato
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mockEq.mockReset().mockResolvedValue({ data: null, error: null });
  mockFrom.mockClear();
  mockUpdate.mockClear();
  mockLogError.mockClear();
  // Estado global do módulo (pendingTimer/lastWriteAt/inflight) é resetado
  // re-importando o módulo do zero.
  vi.resetModules();
  const mod = await import('../touchLastSeen');
  touchLastSeen = mod.touchLastSeen;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('touchLastSeen — debounce global de 120s', () => {
  it('1. 10 chamadas em sequência → exatamente 1 write após o debounce', async () => {
    for (let i = 0; i < 10; i++) touchLastSeen();

    expect(vi.getTimerCount()).toBe(1); // só o timer original agendado
    expect(mockUpdate).not.toHaveBeenCalled(); // nada antes do debounce

    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledTimes(1);
  });

  it('2. chamada durante inflight → sem timer extra', async () => {
    let resolveGetUser!: (value: GetUserResult) => void;
    mockGetUser.mockImplementation(
      () =>
        new Promise<GetUserResult>((resolve) => {
          resolveGetUser = resolve;
        }),
    );

    touchLastSeen();
    vi.advanceTimersByTime(120_000); // dispara o timer; fica pendente no getUser

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    touchLastSeen(); // durante inflight → deve retornar sem agendar nada
    expect(vi.getTimerCount()).toBe(0);
    expect(mockUpdate).not.toHaveBeenCalled();

    resolveGetUser({ data: { user: { id: 'user-1' } }, error: null });
    await vi.advanceTimersByTimeAsync(0);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('3. chamada após 120s → novo write permitido', async () => {
    touchLastSeen();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    touchLastSeen(); // nova janela de debounce
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('4. getUser com user → update filtrado por .eq(user_id, user.id)', async () => {
    touchLastSeen();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockGetUser).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockEq).not.toHaveBeenCalledWith('id', 'user-1'); // coluna correta é user_id
  });

  it('5. getUser sem user → nenhum write', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    touchLastSeen();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('6. update rejeitado (error) → log.error chamado, não silencioso', async () => {
    mockEq.mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy' },
    });

    touchLastSeen();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
      'touchLastSeen update rejected:',
      'new row violates row-level security policy',
    );
  });

  it('7. update ok → sem log.error', async () => {
    touchLastSeen();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('8. chamada dentro da janela de debounce → sem write extra', async () => {
    touchLastSeen();
    await vi.advanceTimersByTimeAsync(60_000); // metade do debounce

    touchLastSeen(); // ainda dentro dos 120s → ignora
    expect(vi.getTimerCount()).toBe(1); // o timer original segue pendente

    await vi.advanceTimersByTimeAsync(60_000); // completa os 120s

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
