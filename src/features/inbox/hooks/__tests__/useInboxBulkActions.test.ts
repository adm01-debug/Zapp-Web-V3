/**
 * Tests for useInboxBulkActions#bulkArchive — regression guard do BUG:
 * 'Arquivar' em lote fazia update({ assigned_to: null }) (desatribuir mascarado).
 * O comportamento correto é SOFT-DELETE via contactsRepository.updateStatusBulk
 * (deleted_at + deleted_reason='archived'), com undo = restore ('active').
 *
 * Cobertura exaustiva: soft-delete, undo, seleção vazia, filtro de UUIDs,
 * caminhos de erro (updateStatusBulk rejeita / executeUndoable rejeita),
 * toggle de bulkLoading, limpeza pós-sucesso e smoke de regressão de
 * bulkMarkAsRead / bulkTransfer (não tocados pelo fix).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import { useInboxBulkActions } from '../useInboxBulkActions';

// ── Mocks (padrão dos testes vizinhos: variáveis prefixadas com `mock`) ───────

const mockUpdateStatusBulk = vi.fn(async (_ids: string[], _status: 'active' | 'archived') => []);
vi.mock('@/services/contacts/contactsRepository', () => ({
  contactsRepository: {
    updateStatusBulk: (...args: Parameters<typeof mockUpdateStatusBulk>) =>
      mockUpdateStatusBulk(...args),
  },
}));

let capturedOptions: {
  successMessage: string;
  undoMessage?: string;
  action: () => Promise<unknown>;
  undoAction: () => Promise<void>;
  onCommit?: () => void;
} | null = null;
const mockExecute = vi.fn(async (options: typeof capturedOptions) => {
  capturedOptions = options;
});
vi.mock('@/hooks/useUndoableAction', () => ({
  useUndoableAction: () => ({
    execute: (...args: Parameters<typeof mockExecute>) => mockExecute(...args),
    cancelPendingAction: vi.fn(),
    isPending: false,
    canUndo: false,
    timeRemaining: 0,
  }),
}));

const mockSupabaseFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    functions: { invoke: vi.fn() },
  },
}));

const mockDbFrom = vi.fn();
vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (...args: unknown[]) => mockDbFrom(...args),
}));

// Barrel pesado — o hook só usa o tipo; mock evita carregar componentes reais.
vi.mock('@/features/inbox', () => ({
  ConversationWithMessages: {},
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_1 = '550e8400-e29b-41d4-a716-446655440001';
const UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const TARGET_UUID = '550e8400-e29b-41d4-a716-446655440099';
const QUEUE_ID = '550e8400-e29b-41d4-a716-4466554400aa';
const JID = '5511999887766@s.whatsapp.net';

type HookResult = ReturnType<typeof useInboxBulkActions>;

function setup() {
  const refetch = vi.fn();
  const { result } = renderHook(() => useInboxBulkActions({ refetch, filteredConversations: [] }));
  return { result, refetch };
}

function selectIds(result: { current: HookResult }, ids: string[]) {
  act(() => {
    result.current.toggleSelectionMode();
    ids.forEach((id) => result.current.toggleSelection(id));
  });
}

/**
 * Chain mock para `dbFrom(table).update(payload).in(col, ids).eq(col, val)`,
 * onde o resultado final (`.eq()`) é um Promise resolvendo `{ error: null }`.
 */
function mockDbFromChain(result: { data?: unknown; error?: unknown } = { error: null }) {
  const eq = vi.fn(() => Promise.resolve(result));
  const inFilter = vi.fn(() => ({ eq }));
  const update = vi.fn(() => ({ in: inFilter }));
  return { update, in: inFilter, eq };
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedOptions = null;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useInboxBulkActions — bulkArchive', () => {
  it('arquiva em lote com soft-delete: updateStatusBulk(ids, "archived") e NÃO mexe em assigned_to', async () => {
    const { result, refetch } = setup();
    selectIds(result, [UUID_1, UUID_2]);

    await act(async () => {
      await result.current.bulkArchive();
    });

    // Registrou a ação no executeUndoable com as mensagens corretas
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(capturedOptions?.successMessage).toBe('2 contato(s) arquivado(s)');
    expect(capturedOptions?.undoMessage).toBe('Arquivamento desfeito');

    // Executa a action registrada: soft-delete via repositório — exatamente 1x
    await act(async () => {
      await capturedOptions?.action();
    });
    expect(mockUpdateStatusBulk).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatusBulk).toHaveBeenCalledWith([UUID_1, UUID_2], 'archived');

    // Nenhum update direto em contacts (assigned_to: null) — o bug antigo usava supabase/dbFrom
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockDbFrom).not.toHaveBeenCalled();

    // clearSelection + refetch após sucesso (exatamente uma vez)
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectionMode).toBe(false);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('undoAction restaura via updateStatusBulk(ids, "active")', async () => {
    const { result } = setup();
    selectIds(result, [UUID_1]);

    await act(async () => {
      await result.current.bulkArchive();
    });

    await act(async () => {
      await capturedOptions?.undoAction();
    });
    expect(mockUpdateStatusBulk).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatusBulk).toHaveBeenCalledWith([UUID_1], 'active');
  });

  it('não chama nada quando a seleção está vazia', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockUpdateStatusBulk).not.toHaveBeenCalled();
    expect(result.current.bulkLoading).toBe(false);
  });

  it('filtra IDs que não são UUID antes de arquivar', async () => {
    const { result } = setup();
    selectIds(result, [UUID_1, JID]);

    await act(async () => {
      await result.current.bulkArchive();
    });
    await act(async () => {
      await capturedOptions?.action();
    });

    expect(mockUpdateStatusBulk).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatusBulk).toHaveBeenCalledWith([UUID_1], 'archived');
  });

  it('no-op quando NENHUM id selecionado é UUID válido (bulkLoading volta a false, nada é chamado)', async () => {
    const { result, refetch } = setup();
    selectIds(result, [JID, 'not-a-uuid', '123']);

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockUpdateStatusBulk).not.toHaveBeenCalled();
    expect(result.current.bulkLoading).toBe(false);
    expect(refetch).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    // Seleção permanece intacta (não há clearSelection em no-op)
    expect(result.current.selectedIds.size).toBe(3);
  });

  it('mostra toast.error("Erro ao arquivar contatos") e zera bulkLoading quando updateStatusBulk rejeita', async () => {
    const { result, refetch } = setup();
    selectIds(result, [UUID_1, UUID_2]);

    mockUpdateStatusBulk.mockRejectedValueOnce(new Error('db indisponível'));
    // Simula o executeUndoable REAL (src/hooks/useUndoableAction.ts): executa
    // action() imediatamente e REPROPAGA a rejeição (catch → throw error).
    mockExecute.mockImplementationOnce(async (options) => {
      capturedOptions = options;
      await options?.action();
    });

    // bulkArchive engole a rejeição internamente (catch do hook) — resolve sem throw
    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(mockUpdateStatusBulk).toHaveBeenCalledWith([UUID_1, UUID_2], 'archived');
    expect(toast.error).toHaveBeenCalledWith('Erro ao arquivar contatos');
    expect(toast.success).not.toHaveBeenCalled();
    // finally do hook: bulkLoading volta a false
    expect(result.current.bulkLoading).toBe(false);
    // Falha NÃO limpa seleção nem dispara refetch (clearSelection/refetch ficam na action)
    expect(result.current.selectedIds.size).toBe(2);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('trata rejeição do próprio executeUndoable com toast.error e bulkLoading false', async () => {
    const { result, refetch } = setup();
    selectIds(result, [UUID_1]);

    mockExecute.mockRejectedValueOnce(new Error('falha interna do undo'));

    await act(async () => {
      await result.current.bulkArchive();
    });

    expect(toast.error).toHaveBeenCalledWith('Erro ao arquivar contatos');
    expect(result.current.bulkLoading).toBe(false);
    // A action nunca rodou — nenhum soft-delete foi emitido
    expect(mockUpdateStatusBulk).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('alterna bulkLoading true durante a execução e volta a false ao final', async () => {
    const { result } = setup();
    selectIds(result, [UUID_1]);

    // executeUndoable fica pendente até resolvermos manualmente
    let resolveExecute: (() => void) | undefined;
    mockExecute.mockImplementationOnce(
      (options) =>
        new Promise<void>((resolve) => {
          capturedOptions = options;
          resolveExecute = resolve;
        })
    );

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.bulkArchive();
    });

    // Enquanto o executeUndoable não resolve, bulkLoading fica true
    expect(result.current.bulkLoading).toBe(true);

    await act(async () => {
      resolveExecute?.();
      await pending;
    });

    expect(result.current.bulkLoading).toBe(false);
  });
});

describe('useInboxBulkActions — regressão bulkMarkAsRead / bulkTransfer (não tocados pelo fix)', () => {
  it('bulkMarkAsRead: atualiza messages.is_read via dbFrom e limpa seleção', async () => {
    const { result, refetch } = setup();
    const chain = mockDbFromChain();
    mockDbFrom.mockReturnValue(chain);
    selectIds(result, [UUID_1]);

    await act(async () => {
      await result.current.bulkMarkAsRead();
    });

    expect(mockDbFrom).toHaveBeenCalledWith('messages');
    expect(chain.update).toHaveBeenCalledWith({ is_read: true });
    expect(chain.in).toHaveBeenCalledWith('contact_id', [UUID_1]);
    expect(chain.eq).toHaveBeenCalledWith('is_read', false);
    expect(toast.success).toHaveBeenCalledWith('1 conversa(s) marcada(s) como lida(s)');
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);
    // Não deve tocar no fluxo de arquivamento
    expect(mockUpdateStatusBulk).not.toHaveBeenCalled();
  });

  it('bulkTransfer(agent): atualiza contacts.assigned_to via dbFrom e limpa seleção', async () => {
    const { result, refetch } = setup();
    const chain = mockDbFromChain();
    mockDbFrom.mockReturnValue(chain);
    selectIds(result, [UUID_2]);

    await act(async () => {
      await result.current.bulkTransfer('agent', TARGET_UUID);
    });

    expect(mockDbFrom).toHaveBeenCalledWith('contacts');
    expect(chain.update).toHaveBeenCalledWith({ assigned_to: TARGET_UUID });
    expect(chain.in).toHaveBeenCalledWith('id', [UUID_2]);
    expect(toast.success).toHaveBeenCalledWith('1 contato(s) transferido(s)');
    expect(result.current.selectedIds.size).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatusBulk).not.toHaveBeenCalled();
  });

  it('bulkTransfer(queue): atualiza contacts.queue_id via dbFrom', async () => {
    const { result } = setup();
    const chain = mockDbFromChain();
    mockDbFrom.mockReturnValue(chain);
    selectIds(result, [UUID_1]);

    await act(async () => {
      await result.current.bulkTransfer('queue', QUEUE_ID);
    });

    expect(mockDbFrom).toHaveBeenCalledWith('contacts');
    expect(chain.update).toHaveBeenCalledWith({ queue_id: QUEUE_ID });
    expect(chain.in).toHaveBeenCalledWith('id', [UUID_1]);
  });
});
