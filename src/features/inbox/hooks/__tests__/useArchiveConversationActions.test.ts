/**
 * Testes do hook-contrato useArchiveConversationActions.
 *
 * Contrato:
 *  - archive(contactId)  → chama useArchiveContact().mutateAsync e dispara onDone no sucesso.
 *  - restore(contactId)  → chama useRestoreContact().mutateAsync e dispara onDone no sucesso.
 *  - contactId vazio/undefined → NO-OP (nenhuma mutation, onDone NÃO dispara).
 *  - rejeição da mutation → erro propaga e onDone NÃO é chamado.
 *  - onDone é opcional (hook não quebra sem ele).
 *  - archive/restore são estáveis entre renders (useCallback).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useArchiveConversationActions } from '../useArchiveConversationActions';

// ── Mocks (padrão dos testes vizinhos: variáveis prefixadas com `mock`) ───────

const mockArchiveContact = vi.fn(async (_contactId: string) => undefined);
const mockRestoreContact = vi.fn(async (_contactId: string) => undefined);

vi.mock('@/services/contacts/useContactsMutations', () => ({
  useArchiveContact: () => ({ mutateAsync: mockArchiveContact }),
  useRestoreContact: () => ({ mutateAsync: mockRestoreContact }),
}));

beforeEach(() => {
  mockArchiveContact.mockClear();
  mockRestoreContact.mockClear();
});

describe('useArchiveConversationActions', () => {
  it('archive(uuid): chama archiveContact com o id e dispara onDone no sucesso', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useArchiveConversationActions(onDone));

    await act(async () => {
      await result.current.archive('123e4567-e89b-12d3-a456-426614174000');
    });

    expect(mockArchiveContact).toHaveBeenCalledTimes(1);
    expect(mockArchiveContact).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    expect(mockRestoreContact).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('restore(uuid): chama restoreContact com o id e dispara onDone no sucesso', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useArchiveConversationActions(onDone));

    await act(async () => {
      await result.current.restore('123e4567-e89b-12d3-a456-426614174000');
    });

    expect(mockRestoreContact).toHaveBeenCalledTimes(1);
    expect(mockRestoreContact).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    expect(mockArchiveContact).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it.each(['', undefined as unknown as string])(
    'archive(%j): NO-OP — nenhuma mutation e onDone NÃO dispara',
    async (emptyId) => {
      const onDone = vi.fn();
      const { result } = renderHook(() => useArchiveConversationActions(onDone));

      await act(async () => {
        await result.current.archive(emptyId);
      });

      expect(mockArchiveContact).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    }
  );

  it.each(['', undefined as unknown as string])(
    'restore(%j): NO-OP — nenhuma mutation e onDone NÃO dispara',
    async (emptyId) => {
      const onDone = vi.fn();
      const { result } = renderHook(() => useArchiveConversationActions(onDone));

      await act(async () => {
        await result.current.restore(emptyId);
      });

      expect(mockRestoreContact).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    }
  );

  it('archive com rejeição: erro propaga e onDone NÃO é chamado', async () => {
    mockArchiveContact.mockRejectedValueOnce(new Error('falha ao arquivar'));
    const onDone = vi.fn();
    const { result } = renderHook(() => useArchiveConversationActions(onDone));

    await act(async () => {
      await expect(result.current.archive('123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(
        'falha ao arquivar'
      );
    });

    expect(mockArchiveContact).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('restore com rejeição: erro propaga e onDone NÃO é chamado', async () => {
    mockRestoreContact.mockRejectedValueOnce(new Error('falha ao restaurar'));
    const onDone = vi.fn();
    const { result } = renderHook(() => useArchiveConversationActions(onDone));

    await act(async () => {
      await expect(result.current.restore('123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(
        'falha ao restaurar'
      );
    });

    expect(mockRestoreContact).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('onDone opcional: sem callback o hook funciona sem quebrar', async () => {
    const { result } = renderHook(() => useArchiveConversationActions());

    await act(async () => {
      await result.current.archive('123e4567-e89b-12d3-a456-426614174000');
      await result.current.restore('123e4567-e89b-12d3-a456-426614174001');
    });

    expect(mockArchiveContact).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    expect(mockRestoreContact).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174001');
  });

  it('archive/restore estáveis: identity preservada entre renders (useCallback)', () => {
    const onDone = vi.fn();
    const { result, rerender } = renderHook(() => useArchiveConversationActions(onDone));

    const archiveFirst = result.current.archive;
    const restoreFirst = result.current.restore;

    rerender();

    expect(result.current.archive).toBe(archiveFirst);
    expect(result.current.restore).toBe(restoreFirst);
  });
});
