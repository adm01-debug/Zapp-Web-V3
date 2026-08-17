/**
 * TESTE RED (TDD) — allowlist de tabelas no useBulkActions.
 *
 * Gap: o hook executa delete/archive em QUALQUER tableName informado via
 * `fromTable(tableName)` (src/hooks/useBulkActions.ts), sem validar contra
 * uma allowlist. Um tableName arbitrário (ex.: `users`, `auth.users`,
 * `zapp._lgpd_payload`) dispara DELETE/UPDATE em massa no PostgREST.
 *
 * Contrato esperado (fix GREEN):
 *   - delete/archive só executam se tableName ∈ BULK_ACTIONS_ALLOWLIST;
 *   - tableName fora da allowlist → NÃO chama fromTable + toast.error
 *     (mensagem mencionando allowlist/permitida/autorizada);
 *   - tableName vazio/null/whitespace → nenhuma action disponível;
 *   - tabela na allowlist → comportamento atual preservado.
 *
 * HOJE (antes do fix):
 *   - cenários 1 e 4 EXECUTAM o delete/update (chamam fromTable) → RED;
 *   - cenário 3 com `'   '` (espaços) também executa (string truthy) → RED;
 *   - cenário 3 com undefined/'' já não executa (guard `if (!tableName)`) → green;
 *   - cenários 2 e 4b (allowlist) já passam → green (regressão).
 *
 * Nota: vitest include é `src` + glob de testes — para rodar, copiar
 * para `src/hooks/__tests__/useBulkActions-allowlist.test.ts` (ou ajustar include).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ──────────────────────────────────────────────
// Mocks (vi.hoisted — o factory do vi.mock é hoisted para o topo)
// ──────────────────────────────────────────────
const { mockFromTable, mockToast } = vi.hoisted(() => ({
  mockFromTable: vi.fn((_table: string) => ({
    delete: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    }),
    update: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ error: null }),
    }),
  })),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: (table: string) => mockFromTable(table),
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

import { useBulkActions } from '@/hooks/useBulkActions';

// ──────────────────────────────────────────────
// Allowlist esperada (contrato do fix GREEN)
// Hoje o hook não tem callers em produção (só testes); os nomes abaixo vêm
// dos testes existentes (useBulkActions.test.tsx / contratoF4.simulacao.test.tsx)
// e são as tabelas que o fix DEVE liberar.
// ──────────────────────────────────────────────
const BULK_ALLOWLIST = ['tasks', 'campaign_contacts'] as const;

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

interface TestItem {
  id: string;
  name: string;
}

const testItems: TestItem[] = [
  { id: '1', name: 'Item 1' },
  { id: '2', name: 'Item 2' },
  { id: '3', name: 'Item 3' },
];

describe('useBulkActions — allowlist de tabelas (TDD RED)', () => {
  beforeEach(() => {
    mockFromTable.mockClear();
    mockToast.success.mockClear();
    mockToast.error.mockClear();
  });

  // ── CENÁRIO 1: delete com tableName FORA da allowlist ──
  it('RED: delete em tabela fora da allowlist NÃO executa (hoje executa)', async () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'tabela_nao_allowlist' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.executeAction('delete');
    });

    // HOJE: fromTable('tabela_nao_allowlist') é chamado → falha (RED)
    expect(mockFromTable).not.toHaveBeenCalled();
    // HOJE: toast.success é chamado (não error) → falha (RED)
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringMatching(/allowlist|permitid|autorizad/i)
    );
  });

  // ── CENÁRIO 2: delete com tableName NA allowlist ──
  it('delete em tabela NA allowlist executa normalmente (regressão)', async () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: BULK_ALLOWLIST[0] }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.executeAction('delete');
    });

    expect(mockFromTable).toHaveBeenCalledWith('tasks');
    const deleteBuilder = mockFromTable.mock.results[0].value.delete();
    expect(deleteBuilder.in).toHaveBeenCalledWith('id', ['1', '2', '3']);
    expect(mockToast.success).toHaveBeenCalled();
  });

  // ── CENÁRIO 3: tableName vazio / null / whitespace ──
  it.each([
    { label: 'undefined', tableName: undefined },
    { label: 'string vazia', tableName: '' },
    { label: 'só espaços', tableName: '   ' },
  ])('$label: nenhuma operação de bulk é disparada', ({ tableName }) => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.selectAll();
    });

    // Sem tableName válido → actions delete/archive nem existem
    expect(
      result.current.availableActions.some((a) => a.id === 'delete' || a.id === 'archive')
    ).toBe(false);

    act(() => {
      void result.current.executeAction('delete');
    });

    // RED para o caso 'só espaços' (hoje `'   '` é truthy → executa fromTable)
    expect(mockFromTable).not.toHaveBeenCalled();
  });

  // ── CENÁRIO 4: bulk update (archive) com tableName FORA da allowlist ──
  it('RED: archive (update) em tabela fora da allowlist NÃO executa (hoje executa)', async () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'tabela_nao_allowlist' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.executeAction('archive');
    });

    // HOJE: fromTable('tabela_nao_allowlist').update(...) é chamado → falha (RED)
    expect(mockFromTable).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalledWith(
      expect.stringMatching(/allowlist|permitid|autorizad/i)
    );
  });

  // ── CENÁRIO 4b: archive com tableName NA allowlist ──
  it('archive em tabela NA allowlist executa normalmente (regressão)', async () => {
    const { result } = renderHook(
      () => useBulkActions<TestItem>(testItems, { tableName: 'campaign_contacts' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.selectAll();
    });

    await act(async () => {
      await result.current.executeAction('archive');
    });

    expect(mockFromTable).toHaveBeenCalledWith('campaign_contacts');
    const updateBuilder = mockFromTable.mock.results[0].value.update;
    expect(updateBuilder).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived' })
    );
    expect(mockToast.success).toHaveBeenCalled();
  });
});
