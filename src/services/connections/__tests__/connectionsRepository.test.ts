/**
 * Tests for connectionsRepository — F6-26 / Etapa 2.
 *
 * Camada de acesso a dados. Metade é delegação ao `genericService`; a outra
 * metade são queries diretas ao Supabase com detalhes que já causaram incidente
 * no repo — `maybeSingle()` em vez de `single()` (evita PGRST116) e o
 * `realtimeSchema: 'zapp'` do serviço genérico, sem o qual o realtime escuta o
 * schema errado.
 *
 * Coberto:
 *   - createService é configurado com a tabela e realtimeSchema 'zapp'
 *   - list/get/search/create/update/delete delegam ao serviço genérico
 *   - deleteWhatsAppConnectionsBulk dispara um delete por id, em paralelo
 *   - deleteWhatsAppConnectionsBulk com lista vazia devolve []
 *   - listChannelConnections usa limit/offset default (50/0) no range
 *   - listChannelConnections respeita limit/offset informados
 *   - listChannelConnections devolve [] quando data vem null
 *   - getChannelConnection usa maybeSingle e filtra por id
 *   - checkConnectionHealth seleciona só as colunas de saúde
 *   - checkConnectionHealth com erro devolve data null
 *   - checkConnectionHealth captura exceção e devolve o erro
 *   - subscribeToConnectionChanges delega ao subscribe do serviço
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { svc, createServiceCalls, createServiceMock, supabaseFromMock } = vi.hoisted(() => {
  // Registro persistente: createService roda no import do módulo, e o
  // vi.clearAllMocks() do beforeEach apagaria o histórico do spy.
  const createServiceCalls: unknown[][] = [];
  const svc = {
    list: vi.fn(),
    get: vi.fn(),
    search: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    subscribe: vi.fn(),
  };
  return {
    svc,
    createServiceCalls,
    createServiceMock: vi.fn((...args: unknown[]) => {
      createServiceCalls.push(args);
      return svc;
    }),
    supabaseFromMock: vi.fn(),
  };
});

vi.mock('@/services/api/genericService', () => ({ createService: createServiceMock }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: supabaseFromMock },
}));

import { connectionsRepository } from '../connectionsRepository';

/** Builder encadeável que grava as chamadas e resolve no valor configurado. */
function makeChain(result: unknown) {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'range', 'eq', 'maybeSingle']) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ op, args });
      return op === 'range' || op === 'maybeSingle' ? Promise.resolve(result) : chain;
    };
  }
  return { chain, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.list.mockResolvedValue({ data: [], total: 0 });
  svc.get.mockResolvedValue({ id: 'c1' });
  svc.search.mockResolvedValue([]);
  svc.create.mockResolvedValue({ id: 'novo' });
  svc.update.mockResolvedValue({ id: 'c1' });
  svc.delete.mockImplementation((id: string) => Promise.resolve({ id }));
  svc.subscribe.mockReturnValue(() => undefined);
});

describe('connectionsRepository — configuração do serviço genérico', () => {
  it('registra whatsapp_connections com realtimeSchema zapp', () => {
    expect(createServiceCalls).toContainEqual([
      'whatsapp_connections',
      { realtimeSchema: 'zapp' },
    ]);
  });
});

describe('connectionsRepository — delegações ao serviço genérico', () => {
  it('listWhatsAppConnections delega com os filtros', async () => {
    await connectionsRepository.listWhatsAppConnections({ status: 'connected' });
    expect(svc.list).toHaveBeenCalledWith({ status: 'connected' });
  });

  it('getWhatsAppConnection delega com o id', async () => {
    await connectionsRepository.getWhatsAppConnection('c1');
    expect(svc.get).toHaveBeenCalledWith('c1');
  });

  it('searchWhatsAppConnections delega com a query', async () => {
    await connectionsRepository.searchWhatsAppConnections('suporte');
    expect(svc.search).toHaveBeenCalledWith('suporte');
  });

  it('createWhatsAppConnection delega com o payload', async () => {
    await connectionsRepository.createWhatsAppConnection({ name: 'X' });
    expect(svc.create).toHaveBeenCalledWith({ name: 'X' });
  });

  it('updateWhatsAppConnection delega com id e updates', async () => {
    await connectionsRepository.updateWhatsAppConnection('c1', { status: 'connected' });
    expect(svc.update).toHaveBeenCalledWith('c1', { status: 'connected' });
  });

  it('deleteWhatsAppConnection delega com o id', async () => {
    await connectionsRepository.deleteWhatsAppConnection('c1');
    expect(svc.delete).toHaveBeenCalledWith('c1');
  });

  it('subscribeToConnectionChanges delega o callback', () => {
    const cb = vi.fn();
    connectionsRepository.subscribeToConnectionChanges(cb);
    expect(svc.subscribe).toHaveBeenCalledWith(cb);
  });
});

describe('connectionsRepository.deleteWhatsAppConnectionsBulk', () => {
  it('dispara um delete por id', async () => {
    const out = await connectionsRepository.deleteWhatsAppConnectionsBulk(['a', 'b', 'c']);
    expect(svc.delete).toHaveBeenCalledTimes(3);
    expect(out).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('lista vazia devolve [] sem chamar delete', async () => {
    await expect(connectionsRepository.deleteWhatsAppConnectionsBulk([])).resolves.toEqual(
      []
    );
    expect(svc.delete).not.toHaveBeenCalled();
  });
});

describe('connectionsRepository.listChannelConnections', () => {
  it('usa limit 50 / offset 0 por padrão', async () => {
    const { chain, calls } = makeChain({ data: [{ id: 'ch1' }], error: null, count: 1 });
    supabaseFromMock.mockReturnValue(chain);
    await connectionsRepository.listChannelConnections();
    expect(supabaseFromMock).toHaveBeenCalledWith('channel_connections');
    expect(calls.find((c) => c.op === 'range')?.args).toEqual([0, 49]);
  });

  it('respeita limit e offset informados', async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    supabaseFromMock.mockReturnValue(chain);
    await connectionsRepository.listChannelConnections({ limit: 10, offset: 20 });
    expect(calls.find((c) => c.op === 'range')?.args).toEqual([20, 29]);
  });

  it('devolve [] quando data vem null', async () => {
    const { chain } = makeChain({ data: null, error: null, count: 0 });
    supabaseFromMock.mockReturnValue(chain);
    const out = await connectionsRepository.listChannelConnections();
    expect(out.data).toEqual([]);
  });

  it('pede count exact junto do select', async () => {
    const { chain, calls } = makeChain({ data: [], error: null, count: 0 });
    supabaseFromMock.mockReturnValue(chain);
    await connectionsRepository.listChannelConnections();
    expect(calls.find((c) => c.op === 'select')?.args).toEqual(['*', { count: 'exact' }]);
  });
});

describe('connectionsRepository.getChannelConnection', () => {
  it('filtra por id e usa maybeSingle', async () => {
    const { chain, calls } = makeChain({ data: { id: 'ch1' }, error: null });
    supabaseFromMock.mockReturnValue(chain);
    const out = await connectionsRepository.getChannelConnection('ch1');
    expect(calls.find((c) => c.op === 'eq')?.args).toEqual(['id', 'ch1']);
    expect(calls.some((c) => c.op === 'maybeSingle')).toBe(true);
    expect(out.data).toEqual({ id: 'ch1' });
  });
});

describe('connectionsRepository.checkConnectionHealth', () => {
  it('seleciona apenas as colunas de saúde e usa maybeSingle', async () => {
    const { chain, calls } = makeChain({
      data: { status: 'connected', health_status: 'ok', health_reason: null },
      error: null,
    });
    supabaseFromMock.mockReturnValue(chain);
    const out = await connectionsRepository.checkConnectionHealth('c1');
    expect(calls.find((c) => c.op === 'select')?.args).toEqual([
      'status, health_status, health_reason',
    ]);
    expect(calls.some((c) => c.op === 'maybeSingle')).toBe(true);
    expect(out.error).toBeNull();
  });

  it('erro do Postgrest devolve data null', async () => {
    const { chain } = makeChain({ data: null, error: { message: 'rls denied' } });
    supabaseFromMock.mockReturnValue(chain);
    const out = await connectionsRepository.checkConnectionHealth('c1');
    expect(out.data).toBeNull();
    expect(out.error).toEqual({ message: 'rls denied' });
  });

  it('exceção é capturada e devolvida como error', async () => {
    supabaseFromMock.mockImplementation(() => {
      throw new Error('client offline');
    });
    const out = await connectionsRepository.checkConnectionHealth('c1');
    expect(out.data).toBeNull();
    expect((out.error as Error).message).toBe('client offline');
  });
});
