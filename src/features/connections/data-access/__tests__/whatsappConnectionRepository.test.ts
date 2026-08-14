/**
 * Tests for whatsappConnectionRepository — F6-26 / Etapa 2.
 *
 * O repositório carrega três regras do repo que não podem regredir em silêncio:
 *   1. a leitura ampla passa pelo cache de 30s (`getWhatsappConnections`);
 *   2. toda mutação **invalida** esse cache — esquecer isso deixa a UI velha;
 *   3. o shape canônico vem de `columnMap` + `normalizeConnection`, e o INSERT
 *      só normaliza depois de checar `error`/`data` (fix registrado no código).
 *
 * Coberto:
 *   fetchConnections
 *     - devolve as linhas do cache com error null
 *     - exceção do cache vira { data: null, error }
 *   fetchConnectionByIdCanonical
 *     - filtra por id e usa maybeSingle
 *     - erro devolve data null
 *     - sucesso passa a linha por normalizeConnection
 *   updateConnection — delega e invalida o cache
 *   insertConnection
 *     - invalida o cache mesmo quando o insert falha
 *     - erro devolve normalized null (sem chamar normalizeConnection)
 *     - data null devolve normalized null
 *     - sucesso devolve normalized preenchido
 *   logQrAttempt / updateQrAttempt — tabela qr_attempts, com select('id')
 *   callEvolutionApi — invoca a function 'evolution-api' com o body
 *   callEvolutionApiV2 — invoca o path recebido
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getWhatsappConnectionsMock,
  invalidateCacheMock,
  safeFromMock,
  normalizeConnectionMock,
  supabaseFromMock,
  invokeMock,
} = vi.hoisted(() => ({
  getWhatsappConnectionsMock: vi.fn(),
  invalidateCacheMock: vi.fn(),
  safeFromMock: vi.fn(),
  normalizeConnectionMock: vi.fn(),
  supabaseFromMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/whatsappConnectionsCache', () => ({
  getWhatsappConnections: getWhatsappConnectionsMock,
  invalidateWhatsappConnectionsCache: invalidateCacheMock,
}));
vi.mock('@/integrations/supabase/safeClient', () => ({ safeFrom: safeFromMock }));
vi.mock('@/integrations/supabase/rowNormalizers', () => ({
  normalizeConnection: normalizeConnectionMock,
  evolutionInstanceName: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: supabaseFromMock, functions: { invoke: invokeMock } },
}));

import { whatsappConnectionRepository } from '../whatsappConnectionRepository';

/** Builder encadeável: os terminais recebidos em `terminals` resolvem a promise. */
function makeChain(result: unknown, terminals: string[]) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'insert', 'update', 'maybeSingle', 'single']) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return terminals.includes(op) ? Promise.resolve(result) : chain;
    };
  }
  return { chain, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  normalizeConnectionMock.mockImplementation((row: unknown) => ({
    normalized: true,
    row,
  }));
});

describe('whatsappConnectionRepository.fetchConnections', () => {
  it('devolve as linhas do cache com error null', async () => {
    getWhatsappConnectionsMock.mockResolvedValue([{ id: 'c1' }]);
    await expect(whatsappConnectionRepository.fetchConnections()).resolves.toEqual({
      data: [{ id: 'c1' }],
      error: null,
    });
  });

  it('exceção do cache vira { data: null, error }', async () => {
    getWhatsappConnectionsMock.mockRejectedValue(new Error('cache miss fatal'));
    const out = await whatsappConnectionRepository.fetchConnections();
    expect(out.data).toBeNull();
    expect((out.error as Error).message).toBe('cache miss fatal');
  });
});

describe('whatsappConnectionRepository.fetchConnectionByIdCanonical', () => {
  it('filtra por id e usa maybeSingle', async () => {
    const { chain, calls } = makeChain({ data: { id: 'c1' }, error: null }, ['maybeSingle']);
    safeFromMock.mockReturnValue(chain);
    await whatsappConnectionRepository.fetchConnectionByIdCanonical('c1');
    expect(safeFromMock).toHaveBeenCalledWith('whatsapp_connections');
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual(['id', 'c1']);
    expect(calls.some((c) => c.op === 'maybeSingle')).toBe(true);
  });

  it('erro devolve data null sem normalizar', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'rls' } }, ['maybeSingle']);
    safeFromMock.mockReturnValue(chain);
    const out = await whatsappConnectionRepository.fetchConnectionByIdCanonical('c1');
    expect(out.data).toBeNull();
    expect(normalizeConnectionMock).not.toHaveBeenCalled();
  });

  it('sucesso passa a linha por normalizeConnection', async () => {
    const { chain } = makeChain({ data: { id: 'c1' }, error: null }, ['maybeSingle']);
    safeFromMock.mockReturnValue(chain);
    const out = await whatsappConnectionRepository.fetchConnectionByIdCanonical('c1');
    expect(normalizeConnectionMock).toHaveBeenCalledWith({ id: 'c1' });
    expect(out.data).toEqual({ normalized: true, row: { id: 'c1' } });
  });
});

describe('whatsappConnectionRepository.updateConnection', () => {
  it('delega o update e invalida o cache', async () => {
    const { chain, calls } = makeChain({ data: null, error: null }, ['eq']);
    safeFromMock.mockReturnValue(chain);
    await whatsappConnectionRepository.updateConnection('c1', { status: 'connected' });
    expect(calls.find((c) => c.op === 'update')?.args).toEqual([{ status: 'connected' }]);
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual(['id', 'c1']);
    expect(invalidateCacheMock).toHaveBeenCalledTimes(1);
  });
});

describe('whatsappConnectionRepository.insertConnection', () => {
  it('invalida o cache mesmo quando o insert falha', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'duplicate' } }, ['single']);
    safeFromMock.mockReturnValue(chain);
    await whatsappConnectionRepository.insertConnection({ name: 'X' } as never);
    expect(invalidateCacheMock).toHaveBeenCalledTimes(1);
  });

  it('erro devolve normalized null e não chama normalizeConnection', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'duplicate' } }, ['single']);
    safeFromMock.mockReturnValue(chain);
    const out = await whatsappConnectionRepository.insertConnection({ name: 'X' } as never);
    expect(out.normalized).toBeNull();
    expect(normalizeConnectionMock).not.toHaveBeenCalled();
  });

  it('data null sem erro também devolve normalized null', async () => {
    const { chain } = makeChain({ data: null, error: null }, ['single']);
    safeFromMock.mockReturnValue(chain);
    const out = await whatsappConnectionRepository.insertConnection({ name: 'X' } as never);
    expect(out.normalized).toBeNull();
  });

  it('sucesso devolve normalized preenchido', async () => {
    const { chain, calls } = makeChain({ data: { id: 'novo' }, error: null }, ['single']);
    safeFromMock.mockReturnValue(chain);
    const out = await whatsappConnectionRepository.insertConnection({ name: 'X' } as never);
    expect(calls.find((c) => c.op === 'insert')?.args).toEqual([{ name: 'X' }]);
    expect(out.normalized).toEqual({ normalized: true, row: { id: 'novo' } });
  });
});

describe('whatsappConnectionRepository — qr_attempts', () => {
  it('logQrAttempt insere em qr_attempts retornando o id', async () => {
    const { chain, calls } = makeChain({ data: { id: 'qr1' }, error: null }, ['single']);
    supabaseFromMock.mockReturnValue(chain);
    await whatsappConnectionRepository.logQrAttempt({ connection_id: 'c1' } as never);
    expect(supabaseFromMock).toHaveBeenCalledWith('qr_attempts');
    expect(calls.find((c) => c.op === 'select')?.args).toEqual(['id']);
    expect(calls.some((c) => c.op === 'single')).toBe(true);
  });

  it('updateQrAttempt filtra pelo id da tentativa', async () => {
    const { chain, calls } = makeChain({ data: null, error: null }, ['eq']);
    supabaseFromMock.mockReturnValue(chain);
    await whatsappConnectionRepository.updateQrAttempt('qr1', { status: 'expired' } as never);
    expect(calls.find((c) => c.op === 'update')?.args).toEqual([{ status: 'expired' }]);
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual(['id', 'qr1']);
  });
});

describe('whatsappConnectionRepository — edge functions', () => {
  it('callEvolutionApiV2 invoca a function evolution-api com o body', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    await whatsappConnectionRepository.callEvolutionApiV2('evolution-api', { body: { action: 'connect' } });
    expect(invokeMock).toHaveBeenCalledWith('evolution-api', {
      body: { action: 'connect' },
    });
  });

  it('callEvolutionApiV2 invoca o path recebido', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    await whatsappConnectionRepository.callEvolutionApiV2('evolution-api-v2', {
      body: { x: 1 },
    });
    expect(invokeMock).toHaveBeenCalledWith('evolution-api-v2', { body: { x: 1 } });
  });
});
