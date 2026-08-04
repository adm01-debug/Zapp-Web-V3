/**
 * Tests for useInboxBulkActions#bulkArchive — regression guard do BUG:
 * 'Arquivar' em lote fazia update({ assigned_to: null }) (desatribuir mascarado).
 * O comportamento correto é SOFT-DELETE via contactsRepository.updateStatusBulk
 * (deleted_at + deleted_reason='archived'), com undo = restore ('active').
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

    // Executa a action registrada: soft-delete via repositório
    await act(async () => {
      await capturedOptions?.action();
    });
    expect(mockUpdateStatusBulk).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatusBulk).toHaveBeenCalledWith([UUID_1, UUID_2], 'archived');

    // Nenhum update direto em contacts (assigned_to: null) — o bug antigo usava supabase/dbFrom
    expect(mockSupabaseFrom).not.toHaveBeenCalled();
    expect(mockDbFrom).not.toHaveBeenCalled();

    // clearSelection + refetch após sucesso
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.selectionMode).toBe(false);
    expect(refetch).toHaveBeenCalled();
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

    expect(mockUpdateStatusBulk).toHaveBeenCalledWith([UUID_1], 'archived');
  });
});
