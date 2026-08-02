/**
 * Tests for useConnectionsActions() — F6-26 / Etapa 2.
 *
 * O hook concentra a lógica de negócio crítica do módulo connections:
 * criar, definir padrão e deletar conexões WhatsApp. Antes deste arquivo
 * tinha **zero** cobertura, apesar de F6-02 depender dele para regressão.
 *
 * Estratégia de mock:
 * - `safeClient` é substituído por um query-builder encadeável que **registra**
 *   as chamadas (`insert`, `update`, `eq`, `neq`, `delete`), permitindo assertar
 *   o payload real enviado ao Postgrest sem tocar em rede.
 * - `useToast` devolve um spy — as mensagens ao usuário são contrato observável.
 * - `useQueryClient` devolve um spy de `invalidateQueries` (F6-26 cobre também
 *   a invalidação de cache, que é onde bugs de "UI não atualiza" nascem).
 * - `evolutionInstanceName` é mockado para exercitar os dois caminhos do delete
 *   (com e sem nome de instância) — a regra do incidente da instância fantasma.
 *
 * Coberto:
 *   handleAddConnection
 *     - rejeita nome vazio, com toast destrutivo, sem tocar no banco
 *     - insere com is_default=true quando é a primeira conexão
 *     - insere com is_default=false quando já existem conexões
 *     - usa generateInstanceName para api_type 'evolution'
 *     - usa prefixo `official_` para api_type 'official'
 *     - anexa a nova conexão ao estado e fecha o diálogo
 *     - reseta o formulário para o default 'evolution'
 *     - abre o QR Code apenas no fluxo evolution
 *     - NÃO abre QR Code no fluxo official
 *     - invalida os dois caches de conexões
 *     - em erro: toast destrutivo, estado intacto, isCreating volta a false
 *     - isCreating é ligado no início e desligado no fim
 *   handleSetDefault
 *     - zera is_default das demais antes de marcar a escolhida
 *     - reflete a troca no estado local
 *     - em erro: toast destrutivo e estado inalterado
 *   handleDelete
 *     - deleta a instância na Evolution pelo NOME, nunca pelo UUID
 *     - segue com o delete no banco mesmo se a Evolution falhar
 *     - pula a chamada à Evolution quando não há nome resolvível
 *     - remove a conexão do estado local
 *     - em erro do banco: toast destrutivo e conexão preservada no estado
 *   aliases exportados (handleCreateConnection / handleDeleteConnection)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { WhatsAppConnection } from '../../types';

// ── mocks ─────────────────────────────────────────────────────────────────────
// vi.mock é içado para o topo do arquivo: os spies precisam nascer em vi.hoisted,
// senão as factories referenciam consts ainda não inicializadas.
const {
  toastSpy,
  invalidateQueriesSpy,
  generateInstanceNameMock,
  evolutionInstanceNameMock,
  singleSpy,
  fromSpy,
} = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  invalidateQueriesSpy: vi.fn(),
  generateInstanceNameMock: vi.fn((name: string) => `gen_${name}`),
  evolutionInstanceNameMock: vi.fn(),
  singleSpy: vi.fn(),
  fromSpy: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastSpy }),
  toast: toastSpy,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesSpy }),
}));

vi.mock('@/services/api/queryKeys', () => ({
  queryKeys: {
    connections: { all: () => ['connections'] },
    talkx: { waConnections: () => ['talkx', 'wa-connections'] },
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../services/whatsappConnectionService', () => ({
  whatsappConnectionService: { generateInstanceName: generateInstanceNameMock },
}));

vi.mock('@/lib/evolutionInstance', () => ({
  evolutionInstanceName: (c: unknown) => evolutionInstanceNameMock(c),
}));

/** Query-builder encadeável que registra o que foi chamado. */
type Recorded = { op: string; arg?: unknown; col?: string; val?: unknown };
let recorded: Recorded[] = [];
function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = (op: string) => (a?: unknown, b?: unknown) => {
    recorded.push(
      op === 'eq' || op === 'neq'
        ? { op, col: a as string, val: b }
        : { op, arg: a }
    );
    return builder;
  };
  for (const op of ['insert', 'update', 'delete', 'select', 'eq', 'neq']) {
    builder[op] = chain(op);
  }
  return builder;
}

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: {
    single: (table: string, qb: (b: unknown) => unknown) => singleSpy(table, qb),
    from: (table: string, qb: (b: unknown) => unknown) => fromSpy(table, qb),
  },
}));

import { useConnectionsActions } from '../useConnectionsActions';
import { whatsappConnectionService } from '../../../services/whatsappConnectionService';

// ── harness ───────────────────────────────────────────────────────────────────
function makeConnection(over: Partial<WhatsAppConnection> = {}): WhatsAppConnection {
  return {
    id: 'conn-1',
    name: 'Suporte',
    phone_number: '5511999999999',
    instance_name: 'suporte_123456',
    instance_id: '11111111-1111-4111-8111-111111111111',
    status: 'connected',
    qr_code: null,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

type Harness = {
  connections: WhatsAppConnection[];
  setConnections: ReturnType<typeof vi.fn>;
  setIsCreating: ReturnType<typeof vi.fn>;
  setIsAddDialogOpen: ReturnType<typeof vi.fn>;
  setNewConnection: ReturnType<typeof vi.fn>;
  handleShowQrCode: ReturnType<typeof vi.fn>;
  disconnectInstance: ReturnType<typeof vi.fn>;
  deleteInstance: ReturnType<typeof vi.fn>;
  newConnection: { name: string; phone_number: string; api_type: 'evolution' | 'official' };
};

function setup(over: Partial<Harness> = {}) {
  const state: WhatsAppConnection[] = over.connections ?? [];
  const h: Harness = {
    connections: state,
    setConnections: vi.fn(),
    setIsCreating: vi.fn(),
    setIsAddDialogOpen: vi.fn(),
    setNewConnection: vi.fn(),
    handleShowQrCode: vi.fn(),
    disconnectInstance: vi.fn().mockResolvedValue(undefined),
    deleteInstance: vi.fn().mockResolvedValue(undefined),
    newConnection: { name: 'Vendas', phone_number: '5511988887777', api_type: 'evolution' },
    ...over,
  };
  const { result } = renderHook(() =>
    useConnectionsActions(
      h.connections,
      h.setConnections,
      h.setIsCreating,
      h.setIsAddDialogOpen,
      h.setNewConnection,
      h.handleShowQrCode,
      h.disconnectInstance,
      h.deleteInstance,
      h.newConnection
    )
  );
  return { result, h };
}

/** Executa o callback que o hook passa ao safeClient contra o builder gravador. */
function runQueryBuilder(qb: (b: unknown) => unknown) {
  qb(makeBuilder());
}

function findRecorded(op: string) {
  return recorded.find((r) => r.op === op);
}

beforeEach(() => {
  vi.clearAllMocks();
  recorded = [];
  generateInstanceNameMock.mockImplementation((name: string) => `gen_${name}`);
  evolutionInstanceNameMock.mockReturnValue('suporte_123456');
  singleSpy.mockImplementation((_t: string, qb: (b: unknown) => unknown) => {
    runQueryBuilder(qb);
    return Promise.resolve({ data: makeConnection({ id: 'nova-1' }), error: null });
  });
  fromSpy.mockImplementation((_t: string, qb: (b: unknown) => unknown) => {
    runQueryBuilder(qb);
    return Promise.resolve({ data: null, error: null });
  });
});

// ── handleAddConnection ───────────────────────────────────────────────────────
describe('useConnectionsActions — handleAddConnection', () => {
  it('rejeita nome vazio com toast destrutivo e sem tocar no banco', async () => {
    const { result } = setup({
      newConnection: { name: '', phone_number: '', api_type: 'evolution' },
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nome é obrigatório', variant: 'destructive' })
    );
    expect(singleSpy).not.toHaveBeenCalled();
  });

  it('marca is_default=true quando é a primeira conexão', async () => {
    const { result } = setup({ connections: [] });
    await act(async () => {
      await result.current.handleAddConnection();
    });
    const insert = findRecorded('insert')?.arg as Record<string, unknown>;
    expect(insert.is_default).toBe(true);
  });

  it('marca is_default=false quando já existem conexões', async () => {
    const { result } = setup({ connections: [makeConnection()] });
    await act(async () => {
      await result.current.handleAddConnection();
    });
    const insert = findRecorded('insert')?.arg as Record<string, unknown>;
    expect(insert.is_default).toBe(false);
  });

  it('usa generateInstanceName no fluxo evolution', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(whatsappConnectionService.generateInstanceName).toHaveBeenCalledWith('Vendas');
    const insert = findRecorded('insert')?.arg as Record<string, unknown>;
    expect(insert.instance_name).toBe('gen_Vendas');
    expect(insert.instance_id).toBe('gen_Vendas');
  });

  it('usa prefixo official_ no fluxo official, sem chamar generateInstanceName', async () => {
    const { result } = setup({
      newConnection: { name: 'Meta', phone_number: '', api_type: 'official' },
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(whatsappConnectionService.generateInstanceName).not.toHaveBeenCalled();
    const insert = findRecorded('insert')?.arg as Record<string, unknown>;
    expect(String(insert.instance_name)).toMatch(/^official_/);
  });

  it('insere sempre com status disconnected', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleAddConnection();
    });
    const insert = findRecorded('insert')?.arg as Record<string, unknown>;
    expect(insert.status).toBe('disconnected');
  });

  it('anexa a nova conexão ao estado', async () => {
    const { result, h } = setup({ connections: [makeConnection()] });
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(h.setConnections).toHaveBeenCalled();
    const updater = h.setConnections.mock.calls[0][0] as (
      p: WhatsAppConnection[]
    ) => WhatsAppConnection[];
    const next = updater([makeConnection()]);
    expect(next).toHaveLength(2);
    expect(next[1].id).toBe('nova-1');
  });

  it('fecha o diálogo e reseta o formulário para evolution', async () => {
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(h.setIsAddDialogOpen).toHaveBeenCalledWith(false);
    expect(h.setNewConnection).toHaveBeenCalledWith({
      name: '',
      phone_number: '',
      api_type: 'evolution',
    });
  });

  it('abre o QR Code no fluxo evolution', async () => {
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(h.handleShowQrCode).toHaveBeenCalledTimes(1);
  });

  it('NÃO abre o QR Code no fluxo official', async () => {
    const { result, h } = setup({
      newConnection: { name: 'Meta', phone_number: '', api_type: 'official' },
    });
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(h.handleShowQrCode).not.toHaveBeenCalled();
  });

  it('invalida os dois caches de conexões', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['connections'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['talkx', 'wa-connections'],
    });
  });

  it('liga e desliga isCreating', async () => {
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(h.setIsCreating).toHaveBeenNthCalledWith(1, true);
    expect(h.setIsCreating).toHaveBeenLastCalledWith(false);
  });

  it('em erro do banco: toast destrutivo, estado intacto e isCreating liberado', async () => {
    singleSpy.mockImplementation((_t: string, qb: (b: unknown) => unknown) => {
      runQueryBuilder(qb);
      return Promise.resolve({ data: null, error: new Error('duplicate key') });
    });
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleAddConnection();
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao criar conexão', variant: 'destructive' })
    );
    expect(h.setConnections).not.toHaveBeenCalled();
    expect(h.setIsAddDialogOpen).not.toHaveBeenCalled();
    expect(h.setIsCreating).toHaveBeenLastCalledWith(false);
  });
});

// ── handleSetDefault ──────────────────────────────────────────────────────────
describe('useConnectionsActions — handleSetDefault', () => {
  it('zera is_default das demais antes de marcar a escolhida', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleSetDefault('conn-2');
    });
    const updates = recorded.filter((r) => r.op === 'update').map((r) => r.arg);
    expect(updates[0]).toEqual({ is_default: false });
    expect(updates[1]).toEqual({ is_default: true });
    expect(recorded.find((r) => r.op === 'neq')).toEqual({
      op: 'neq',
      col: 'id',
      val: 'conn-2',
    });
    expect(recorded.find((r) => r.op === 'eq')).toEqual({
      op: 'eq',
      col: 'id',
      val: 'conn-2',
    });
  });

  it('reflete a troca de padrão no estado local', async () => {
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleSetDefault('conn-2');
    });
    const updater = h.setConnections.mock.calls[0][0] as (
      p: WhatsAppConnection[]
    ) => WhatsAppConnection[];
    const next = updater([
      makeConnection({ id: 'conn-1', is_default: true }),
      makeConnection({ id: 'conn-2', is_default: false }),
    ]);
    expect(next.map((c) => c.is_default)).toEqual([false, true]);
  });

  it('emite toast de sucesso e invalida cache', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.handleSetDefault('conn-2');
    });
    expect(toastSpy).toHaveBeenCalledWith({ title: 'Conexão padrão atualizada' });
    expect(invalidateQueriesSpy).toHaveBeenCalled();
  });

  it('em erro: toast destrutivo e estado inalterado', async () => {
    fromSpy
      .mockImplementationOnce((_t: string, qb: (b: unknown) => unknown) => {
        runQueryBuilder(qb);
        return Promise.resolve({ data: null, error: null });
      })
      .mockImplementationOnce((_t: string, qb: (b: unknown) => unknown) => {
        runQueryBuilder(qb);
        return Promise.resolve({ data: null, error: new Error('rls denied') });
      });
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleSetDefault('conn-2');
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao definir padrão', variant: 'destructive' })
    );
    expect(h.setConnections).not.toHaveBeenCalled();
  });
});

// ── handleDelete ──────────────────────────────────────────────────────────────
describe('useConnectionsActions — handleDelete', () => {
  it('deleta a instância na Evolution pelo NOME, nunca pelo UUID', async () => {
    const conn = makeConnection({
      instance_name: 'suporte_123456',
      instance_id: '11111111-1111-4111-8111-111111111111',
    });
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleDelete(conn);
    });
    expect(h.deleteInstance).toHaveBeenCalledWith('suporte_123456');
    expect(h.deleteInstance).not.toHaveBeenCalledWith(conn.instance_id);
  });

  it('segue com o delete no banco mesmo se a Evolution falhar', async () => {
    const { result, h } = setup({
      deleteInstance: vi.fn().mockRejectedValue(new Error('404 instance not found')),
    });
    await act(async () => {
      await result.current.handleDelete(makeConnection());
    });
    expect(recorded.some((r) => r.op === 'delete')).toBe(true);
    expect(h.setConnections).toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith({ title: 'Conexão removida' });
  });

  it('pula a Evolution quando não há nome de instância resolvível', async () => {
    evolutionInstanceNameMock.mockReturnValue(null);
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleDelete(makeConnection({ instance_name: null }));
    });
    expect(h.deleteInstance).not.toHaveBeenCalled();
    expect(recorded.some((r) => r.op === 'delete')).toBe(true);
  });

  it('remove a conexão do estado local', async () => {
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleDelete(makeConnection({ id: 'conn-1' }));
    });
    const updater = h.setConnections.mock.calls[0][0] as (
      p: WhatsAppConnection[]
    ) => WhatsAppConnection[];
    const next = updater([makeConnection({ id: 'conn-1' }), makeConnection({ id: 'conn-2' })]);
    expect(next.map((c) => c.id)).toEqual(['conn-2']);
  });

  it('em erro do banco: toast destrutivo e conexão preservada no estado', async () => {
    fromSpy.mockImplementation((_t: string, qb: (b: unknown) => unknown) => {
      runQueryBuilder(qb);
      return Promise.resolve({ data: null, error: new Error('foreign key violation') });
    });
    const { result, h } = setup();
    await act(async () => {
      await result.current.handleDelete(makeConnection());
    });
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Erro ao deletar', variant: 'destructive' })
    );
    expect(h.setConnections).not.toHaveBeenCalled();
  });
});

// ── contrato de exportação ────────────────────────────────────────────────────
describe('useConnectionsActions — aliases exportados', () => {
  it('handleCreateConnection e handleDeleteConnection apontam para as mesmas funções', () => {
    const { result } = setup();
    expect(result.current.handleCreateConnection).toBe(result.current.handleAddConnection);
    expect(result.current.handleDeleteConnection).toBe(result.current.handleDelete);
  });
});
