/**
 * Tests for connectionsService — F6-26 / Etapa 2.
 *
 * Camada de regra de negócio entre os hooks e o repositório. Todo o valor dela
 * está nas validações e normalizações que faz *antes* de delegar — exatamente o
 * que estava sem cobertura. O repositório é mockado por inteiro: aqui interessa
 * o contrato (o que é rejeitado, o que é aparado, o que é repassado).
 *
 * Coberto:
 *   listWhatsAppConnections — repassa filtros sem alterar
 *   getWhatsAppConnection — id vazio lança; id válido delega
 *   searchWhatsAppConnections
 *     - query vazia ou com 1 caractere devolve [] sem tocar no repositório
 *     - query com 2+ caracteres é normalizada para minúsculas
 *   createWhatsAppConnection
 *     - nome ausente / vazio / só espaços lança
 *     - apara espaços de name e instance_name
 *     - força status 'disconnected' mesmo se o caller mandar outro
 *     - instance_name undefined permanece undefined
 *   updateWhatsAppConnection
 *     - id vazio lança
 *     - instance_name só com espaços lança
 *     - apara instance_name válido
 *     - update sem instance_name não inventa o campo com valor
 *   deleteWhatsAppConnection — id vazio lança; id válido delega
 *   deleteWhatsAppConnectionsBulk
 *     - lista vazia ou nula lança
 *     - devolve a CONTAGEM, não as linhas
 *   getConnectionStatus
 *     - id vazio devolve null sem chamar o repositório
 *     - conexão inexistente devolve null
 *     - status vazio ('') cai para null pelo operador ||
 *   checkConnectionHealth — id vazio lança
 *   onConnectionChange — devolve o unsubscribe do repositório
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  listWhatsAppConnections: vi.fn(),
  getWhatsAppConnection: vi.fn(),
  searchWhatsAppConnections: vi.fn(),
  createWhatsAppConnection: vi.fn(),
  updateWhatsAppConnection: vi.fn(),
  deleteWhatsAppConnection: vi.fn(),
  deleteWhatsAppConnectionsBulk: vi.fn(),
  checkConnectionHealth: vi.fn(),
  subscribeToConnectionChanges: vi.fn(),
}));

vi.mock('../connectionsRepository', () => ({ connectionsRepository: repo }));

import { connectionsService } from '../connectionsService';

beforeEach(() => {
  vi.clearAllMocks();
  repo.listWhatsAppConnections.mockResolvedValue({ data: [], total: 0 });
  repo.getWhatsAppConnection.mockResolvedValue({ id: 'c1', status: 'connected' });
  repo.searchWhatsAppConnections.mockResolvedValue([]);
  repo.createWhatsAppConnection.mockImplementation((d: unknown) => Promise.resolve(d));
  repo.updateWhatsAppConnection.mockImplementation((_id: string, u: unknown) =>
    Promise.resolve(u)
  );
  repo.deleteWhatsAppConnection.mockResolvedValue({ id: 'c1' });
  repo.deleteWhatsAppConnectionsBulk.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
  repo.checkConnectionHealth.mockResolvedValue({ ok: true });
  repo.subscribeToConnectionChanges.mockReturnValue(() => 'unsub');
});

describe('connectionsService.listWhatsAppConnections', () => {
  it('repassa os filtros ao repositório sem alterá-los', async () => {
    const filters = { status: 'connected', limit: 10 };
    await connectionsService.listWhatsAppConnections(filters);
    expect(repo.listWhatsAppConnections).toHaveBeenCalledWith(filters);
  });
});

describe('connectionsService.getWhatsAppConnection', () => {
  it('id vazio lança sem tocar no repositório', async () => {
    await expect(connectionsService.getWhatsAppConnection('')).rejects.toThrow(
      'Connection ID is required'
    );
    expect(repo.getWhatsAppConnection).not.toHaveBeenCalled();
  });

  it('id válido delega', async () => {
    await connectionsService.getWhatsAppConnection('c1');
    expect(repo.getWhatsAppConnection).toHaveBeenCalledWith('c1');
  });
});

describe('connectionsService.searchWhatsAppConnections', () => {
  it.each(['', 'a'])('query %o curta devolve [] sem consultar', async (q) => {
    await expect(connectionsService.searchWhatsAppConnections(q)).resolves.toEqual([]);
    expect(repo.searchWhatsAppConnections).not.toHaveBeenCalled();
  });

  it('normaliza a query para minúsculas', async () => {
    await connectionsService.searchWhatsAppConnections('SUPorte');
    expect(repo.searchWhatsAppConnections).toHaveBeenCalledWith('suporte');
  });
});

describe('connectionsService.createWhatsAppConnection', () => {
  it.each([
    ['sem name', {}],
    ['name vazio', { name: '' }],
    ['name só com espaços', { name: '   ' }],
  ])('%s lança e não delega', async (_l, data) => {
    await expect(connectionsService.createWhatsAppConnection(data)).rejects.toThrow(
      'Connection name is required'
    );
    expect(repo.createWhatsAppConnection).not.toHaveBeenCalled();
  });

  it('apara espaços de name e instance_name', async () => {
    await connectionsService.createWhatsAppConnection({
      name: '  Suporte  ',
      instance_name: '  suporte_1  ',
    });
    expect(repo.createWhatsAppConnection).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Suporte', instance_name: 'suporte_1' })
    );
  });

  it('força status disconnected mesmo se o caller mandar outro', async () => {
    await connectionsService.createWhatsAppConnection({
      name: 'Suporte',
      status: 'connected',
    });
    expect(repo.createWhatsAppConnection).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'disconnected' })
    );
  });

  it('instance_name ausente permanece undefined', async () => {
    await connectionsService.createWhatsAppConnection({ name: 'Suporte' });
    const arg = repo.createWhatsAppConnection.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.instance_name).toBeUndefined();
  });
});

describe('connectionsService.updateWhatsAppConnection', () => {
  it('id vazio lança', async () => {
    await expect(connectionsService.updateWhatsAppConnection('', {})).rejects.toThrow(
      'Connection ID is required'
    );
  });

  it('instance_name só com espaços lança', async () => {
    await expect(
      connectionsService.updateWhatsAppConnection('c1', { instance_name: '   ' })
    ).rejects.toThrow('Instance name cannot be empty');
    expect(repo.updateWhatsAppConnection).not.toHaveBeenCalled();
  });

  it('apara instance_name válido', async () => {
    await connectionsService.updateWhatsAppConnection('c1', { instance_name: ' inst ' });
    expect(repo.updateWhatsAppConnection).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ instance_name: 'inst' })
    );
  });

  it('update sem instance_name não inventa valor para o campo', async () => {
    await connectionsService.updateWhatsAppConnection('c1', { status: 'connected' });
    const [, updates] = repo.updateWhatsAppConnection.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(updates.instance_name).toBeUndefined();
    expect(updates.status).toBe('connected');
  });
});

describe('connectionsService.deleteWhatsAppConnection', () => {
  it('id vazio lança', async () => {
    await expect(connectionsService.deleteWhatsAppConnection('')).rejects.toThrow(
      'Connection ID is required'
    );
  });

  it('id válido delega', async () => {
    await expect(connectionsService.deleteWhatsAppConnection('c1')).resolves.toEqual({
      id: 'c1',
    });
  });
});

describe('connectionsService.deleteWhatsAppConnectionsBulk', () => {
  it('lista vazia lança', async () => {
    await expect(connectionsService.deleteWhatsAppConnectionsBulk([])).rejects.toThrow(
      'No IDs provided'
    );
  });

  it('lista nula lança', async () => {
    await expect(
      connectionsService.deleteWhatsAppConnectionsBulk(null as unknown as string[])
    ).rejects.toThrow('No IDs provided');
  });

  it('devolve a contagem, não as linhas', async () => {
    await expect(
      connectionsService.deleteWhatsAppConnectionsBulk(['a', 'b'])
    ).resolves.toBe(2);
  });
});

describe('connectionsService.getConnectionStatus', () => {
  it('id vazio devolve null sem consultar', async () => {
    await expect(connectionsService.getConnectionStatus('')).resolves.toBeNull();
    expect(repo.getWhatsAppConnection).not.toHaveBeenCalled();
  });

  it('conexão inexistente devolve null', async () => {
    repo.getWhatsAppConnection.mockResolvedValue(null);
    await expect(connectionsService.getConnectionStatus('c1')).resolves.toBeNull();
  });

  it('status vazio cai para null', async () => {
    repo.getWhatsAppConnection.mockResolvedValue({ id: 'c1', status: '' });
    await expect(connectionsService.getConnectionStatus('c1')).resolves.toBeNull();
  });

  it('devolve o status quando existe', async () => {
    await expect(connectionsService.getConnectionStatus('c1')).resolves.toBe('connected');
  });
});

describe('connectionsService.checkConnectionHealth', () => {
  it('id vazio lança', async () => {
    await expect(connectionsService.checkConnectionHealth('')).rejects.toThrow(
      'Connection ID is required'
    );
  });

  it('id válido delega', async () => {
    await connectionsService.checkConnectionHealth('c1');
    expect(repo.checkConnectionHealth).toHaveBeenCalledWith('c1');
  });
});

describe('connectionsService.onConnectionChange', () => {
  it('devolve o unsubscribe do repositório', () => {
    const cb = vi.fn();
    const unsub = connectionsService.onConnectionChange(cb);
    expect(repo.subscribeToConnectionChanges).toHaveBeenCalledWith(cb);
    expect(typeof unsub).toBe('function');
  });
});
