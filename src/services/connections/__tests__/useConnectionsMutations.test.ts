/**
 * Tests for os hooks de mutation de connections — F6-26 / Etapa 2.
 *
 * São wrappers finos sobre as factories genéricas de mutation. O que pode
 * quebrar aqui não é lógica, é **fiação**: chave de invalidação errada faz a
 * lista não atualizar depois de criar/deletar — bug clássico de "sumiu/não
 * apareceu". Os testes assertam a fiação e a delegação, sem montar React.
 *
 * Coberto:
 *   useCreateWhatsAppConnection
 *     - invalida connections.lists()
 *     - mensagens de sucesso/erro e showToasts
 *     - a mutationFn delega para connectionsService.createWhatsAppConnection
 *   useUpdateWhatsAppConnection
 *     - invalida lists() E details()
 *     - separa o id do resto do payload antes de delegar
 *   useDeleteWhatsAppConnection — invalida lists() e delega o id
 *   useDeleteWhatsAppConnectionsBulk — delega o array de ids
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMut, updateMut, deleteMut, service } = vi.hoisted(() => ({
  createMut: vi.fn(),
  updateMut: vi.fn(),
  deleteMut: vi.fn(),
  service: {
    createWhatsAppConnection: vi.fn(),
    updateWhatsAppConnection: vi.fn(),
    deleteWhatsAppConnection: vi.fn(),
    deleteWhatsAppConnectionsBulk: vi.fn(),
  },
}));

vi.mock('@/services/api', () => ({
  useCreateMutation: createMut,
  useUpdateMutation: updateMut,
  useDeleteMutation: deleteMut,
  queryKeys: {
    connections: {
      lists: () => ['connections', 'list'],
      details: () => ['connections', 'detail'],
    },
  },
}));

vi.mock('../index', () => ({ connectionsService: service }));

import {
  useCreateWhatsAppConnection,
  useUpdateWhatsAppConnection,
  useDeleteWhatsAppConnection,
  useDeleteWhatsAppConnectionsBulk,
} from '../useConnectionsMutations';

type Args = [(input: never) => unknown, Record<string, unknown>];

beforeEach(() => vi.clearAllMocks());

describe('useCreateWhatsAppConnection', () => {
  it('invalida a chave de listas e configura os toasts', () => {
    useCreateWhatsAppConnection();
    const [, opts] = createMut.mock.calls[0] as Args;
    expect(opts.invalidateKey).toEqual(['connections', 'list']);
    expect(opts.onSuccessMessage).toBe('Conexão criada com sucesso!');
    expect(opts.onErrorMessage).toBe('Erro ao criar conexão. Tente novamente.');
    expect(opts.showToasts).toBe(true);
  });

  it('delega para connectionsService.createWhatsAppConnection', () => {
    useCreateWhatsAppConnection();
    const [fn] = createMut.mock.calls[0] as Args;
    (fn as (d: unknown) => unknown)({ name: 'Suporte' });
    expect(service.createWhatsAppConnection).toHaveBeenCalledWith({ name: 'Suporte' });
  });
});

describe('useUpdateWhatsAppConnection', () => {
  it('invalida listas E detalhes', () => {
    useUpdateWhatsAppConnection();
    const [, opts] = updateMut.mock.calls[0] as Args;
    expect(opts.invalidateKeys).toEqual([
      ['connections', 'list'],
      ['connections', 'detail'],
    ]);
  });

  it('separa o id do resto do payload antes de delegar', () => {
    useUpdateWhatsAppConnection();
    const [fn] = updateMut.mock.calls[0] as Args;
    (fn as (d: unknown) => unknown)({ id: 'c1', status: 'connected', name: 'X' });
    expect(service.updateWhatsAppConnection).toHaveBeenCalledWith('c1', {
      status: 'connected',
      name: 'X',
    });
  });
});

describe('useDeleteWhatsAppConnection', () => {
  it('invalida a chave de listas', () => {
    useDeleteWhatsAppConnection();
    const [, opts] = deleteMut.mock.calls[0] as Args;
    expect(opts.invalidateKey).toEqual(['connections', 'list']);
  });

  it('delega o id', () => {
    useDeleteWhatsAppConnection();
    const [fn] = deleteMut.mock.calls[0] as Args;
    (fn as (d: unknown) => unknown)('c1');
    expect(service.deleteWhatsAppConnection).toHaveBeenCalledWith('c1');
  });
});

describe('useDeleteWhatsAppConnectionsBulk', () => {
  it('delega o array de ids', () => {
    useDeleteWhatsAppConnectionsBulk();
    const [fn] = deleteMut.mock.calls[0] as Args;
    (fn as (d: unknown) => unknown)(['a', 'b']);
    expect(service.deleteWhatsAppConnectionsBulk).toHaveBeenCalledWith(['a', 'b']);
  });

  it('mostra a mensagem no plural', () => {
    useDeleteWhatsAppConnectionsBulk();
    const [, opts] = deleteMut.mock.calls[0] as Args;
    expect(opts.onSuccessMessage).toBe('Conexões deletadas com sucesso!');
  });
});
