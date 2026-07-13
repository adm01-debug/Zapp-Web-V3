/**
 * Tests for useFailedMessagesUI().
 *
 * The hook manages all local UI state for the failed-messages panel.
 * Pure logic under test:
 *   - Initial state defaults for every useState field
 *   - useCustomRange: true only when BOTH customFrom and customTo are non-empty
 *   - fromIso / toIso: ISO strings derived from customFrom/customTo inputs
 *   - sortedRows: api.rows sorted descending by created_at
 *   - toggleAll: selects all rows when none/partial selected; deselects all when fully selected
 *   - toggleOne: adds or removes a single id from selectedIds
 *
 * useFailedMessages (Supabase-backed) is partial-mocked so the hook can be
 * rendered without a real database or React Query context.
 *
 * Covered:
 *   - hours starts at 24
 *   - statusFilter starts as "all"
 *   - errorCodeFilter starts as "all"
 *   - rootCauseFilter starts as "all"
 *   - instanceFilter starts as "all"
 *   - searchInput starts as empty string
 *   - search starts as null
 *   - customFrom/customTo start as empty string
 *   - page starts at 0, pageSize is 50
 *   - selected starts as null, confirmBulkAbandon/guidedReprocessOpen start as false
 *   - selectedIds starts as an empty Set
 *   - useCustomRange is false when both fields are empty
 *   - useCustomRange is false when only customFrom is set
 *   - useCustomRange is false when only customTo is set
 *   - useCustomRange is true when both customFrom and customTo are set
 *   - sortedRows is empty when api.rows is empty
 *   - sortedRows orders rows by created_at descending
 *   - sortedRows does not mutate the original api.rows array
 *   - toggleAll selects all rows when selectedIds is empty
 *   - toggleAll selects all rows when only some are selected
 *   - toggleAll deselects all when every row is already selected
 *   - toggleOne adds an id when not present
 *   - toggleOne removes an id when already present
 *   - toggleOne handles independent toggling of multiple ids
 *   - state setters work: setHours, setStatusFilter, setPage, setSearch
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Minimal mock: only useFailedMessages is a runtime import in useFailedMessagesUI;
// all other imports (FailedMessageRow, FailedMessageStatus) are TypeScript types
// erased at runtime, so they need no mock entry.
vi.mock('@/features/admin', () => ({
  useFailedMessages: vi.fn(() => ({
    rows: [],
    total: 0,
    deniedReason: null,
    isLoading: false,
    isFetching: false,
    aggregates: {
      pending: 0, retrying: 0, abandoned24h: 0, successAfterRetryRate: 0,
      errorCodes: [], instances: [], byRootCause: [],
    },
    retryNow: vi.fn(),
    abandon: vi.fn(),
    bulkRetry: vi.fn(),
    bulkAbandon: vi.fn(),
    triggerReprocess: vi.fn(),
  })),
}));

import { useFailedMessages } from '@/features/admin';
import { useFailedMessagesUI } from '../useFailedMessagesUI';
import type { FailedMessageRow, FailedMessageStatus } from '../useFailedMessages';

// ── helpers ────────────────────────────────────────────────────────────────────

function makeRow(id: string, createdAt: string, status: FailedMessageStatus = 'pending'): FailedMessageRow {
  return {
    id,
    instance_name: 'inst-1',
    remote_jid: null,
    payload: {},
    error_code: null,
    error_message: null,
    http_status: null,
    retry_count: 0,
    max_retries: 3,
    status,
    last_attempt_at: null,
    next_attempt_at: null,
    succeeded_at: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function setMockRows(rows: FailedMessageRow[]) {
  vi.mocked(useFailedMessages).mockReturnValue({
    rows,
    total: rows.length,
    deniedReason: null,
    isLoading: false,
    isFetching: false,
    aggregates: {
      pending: 0, retrying: 0, abandoned24h: 0, successAfterRetryRate: 0,
      errorCodes: [], instances: [], byRootCause: [],
    },
    retryNow: vi.fn(),
    abandon: vi.fn(),
    bulkRetry: vi.fn(),
    bulkAbandon: vi.fn(),
    triggerReprocess: vi.fn(),
  } as unknown as ReturnType<typeof useFailedMessages>);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock to return empty rows by default
  setMockRows([]);
});

// ── initial state ──────────────────────────────────────────────────────────────
describe('useFailedMessagesUI — initial state', () => {
  it('hours starts at 24', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.hours).toBe(24);
  });

  it('statusFilter starts as "all"', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.statusFilter).toBe('all');
  });

  it('errorCodeFilter starts as "all"', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.errorCodeFilter).toBe('all');
  });

  it('rootCauseFilter starts as "all"', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.rootCauseFilter).toBe('all');
  });

  it('instanceFilter starts as "all"', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.instanceFilter).toBe('all');
  });

  it('searchInput starts as empty string', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.searchInput).toBe('');
  });

  it('search starts as null', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.search).toBeNull();
  });

  it('customFrom starts as empty string', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.customFrom).toBe('');
  });

  it('customTo starts as empty string', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.customTo).toBe('');
  });

  it('page starts at 0', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.page).toBe(0);
  });

  it('pageSize is 50', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.pageSize).toBe(50);
  });

  it('selected starts as null', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.selected).toBeNull();
  });

  it('selectedIds starts as an empty Set', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.selectedIds).toBeInstanceOf(Set);
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('confirmBulkAbandon starts as false', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.confirmBulkAbandon).toBe(false);
  });

  it('bulkReason starts as empty string', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.bulkReason).toBe('');
  });

  it('guidedReprocessOpen starts as false', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.guidedReprocessOpen).toBe(false);
  });
});

// ── useCustomRange ─────────────────────────────────────────────────────────────
describe('useFailedMessagesUI — useCustomRange', () => {
  it('is false when both fields are empty', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.useCustomRange).toBe(false);
  });

  it('is false when only customFrom is set', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setCustomFrom('2024-01-01T00:00'); });
    expect(result.current.useCustomRange).toBe(false);
  });

  it('is false when only customTo is set', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setCustomTo('2024-01-31T23:59'); });
    expect(result.current.useCustomRange).toBe(false);
  });

  it('is true when both customFrom and customTo are set', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => {
      result.current.setCustomFrom('2024-01-01T00:00');
      result.current.setCustomTo('2024-01-31T23:59');
    });
    expect(result.current.useCustomRange).toBe(true);
  });

  it('reverts to false when customFrom is cleared', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => {
      result.current.setCustomFrom('2024-01-01T00:00');
      result.current.setCustomTo('2024-01-31T23:59');
    });
    act(() => { result.current.setCustomFrom(''); });
    expect(result.current.useCustomRange).toBe(false);
  });
});

// ── sortedRows ─────────────────────────────────────────────────────────────────
describe('useFailedMessagesUI — sortedRows', () => {
  it('is empty when api.rows is empty', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.sortedRows).toHaveLength(0);
  });

  it('sorts rows descending by created_at', () => {
    const rows = [
      makeRow('r1', '2024-01-01T10:00:00Z'),
      makeRow('r2', '2024-01-03T10:00:00Z'),
      makeRow('r3', '2024-01-02T10:00:00Z'),
    ];
    setMockRows(rows);
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.sortedRows.map((r) => r.id)).toEqual(['r2', 'r3', 'r1']);
  });

  it('a single row is returned unchanged', () => {
    setMockRows([makeRow('only', '2024-06-15T12:00:00Z')]);
    const { result } = renderHook(() => useFailedMessagesUI());
    expect(result.current.sortedRows).toHaveLength(1);
    expect(result.current.sortedRows[0].id).toBe('only');
  });

  it('does not mutate the original api.rows order', () => {
    const rows = [
      makeRow('a', '2024-01-01T00:00:00Z'),
      makeRow('b', '2024-12-31T23:59:59Z'),
    ];
    setMockRows(rows);
    const { result } = renderHook(() => useFailedMessagesUI());
    // sortedRows should be ['b','a'] but original rows array order ['a','b'] unchanged
    expect(result.current.sortedRows[0].id).toBe('b');
    // The rows we passed in should not have been sorted in place
    expect(rows[0].id).toBe('a');
  });
});

// ── toggleAll ──────────────────────────────────────────────────────────────────
describe('useFailedMessagesUI — toggleAll', () => {
  it('selects all rows when selectedIds is empty', () => {
    const rows = [makeRow('r1', '2024-01-01Z'), makeRow('r2', '2024-01-02Z')];
    setMockRows(rows);
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.toggleAll(); });
    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.selectedIds.has('r1')).toBe(true);
    expect(result.current.selectedIds.has('r2')).toBe(true);
  });

  it('selects all rows when only some are already selected', () => {
    const rows = [makeRow('r1', '2024-01-01Z'), makeRow('r2', '2024-01-02Z'), makeRow('r3', '2024-01-03Z')];
    setMockRows(rows);
    const { result } = renderHook(() => useFailedMessagesUI());
    // Manually select one
    act(() => { result.current.setSelectedIds(new Set(['r1'])); });
    act(() => { result.current.toggleAll(); });
    expect(result.current.selectedIds.size).toBe(3);
  });

  it('deselects all when every row is already selected', () => {
    const rows = [makeRow('r1', '2024-01-01Z'), makeRow('r2', '2024-01-02Z')];
    setMockRows(rows);
    const { result } = renderHook(() => useFailedMessagesUI());
    // Select all first
    act(() => { result.current.toggleAll(); });
    expect(result.current.selectedIds.size).toBe(2);
    // Toggle again → deselect all
    act(() => { result.current.toggleAll(); });
    expect(result.current.selectedIds.size).toBe(0);
  });

  it('does nothing when there are no rows (empty sortedRows)', () => {
    setMockRows([]);
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.toggleAll(); });
    // sortedRows.length === 0 so the "else" branch selects all (empty set)
    expect(result.current.selectedIds.size).toBe(0);
  });
});

// ── toggleOne ──────────────────────────────────────────────────────────────────
describe('useFailedMessagesUI — toggleOne', () => {
  it('adds an id when not already selected', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.toggleOne('msg-42'); });
    expect(result.current.selectedIds.has('msg-42')).toBe(true);
  });

  it('removes an id when already selected', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.toggleOne('msg-42'); });
    act(() => { result.current.toggleOne('msg-42'); });
    expect(result.current.selectedIds.has('msg-42')).toBe(false);
  });

  it('toggling one id does not affect other selected ids', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.toggleOne('a'); });
    act(() => { result.current.toggleOne('b'); });
    act(() => { result.current.toggleOne('a'); }); // remove 'a'
    expect(result.current.selectedIds.has('a')).toBe(false);
    expect(result.current.selectedIds.has('b')).toBe(true);
  });

  it('can independently select multiple ids', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => {
      result.current.toggleOne('x1');
      result.current.toggleOne('x2');
      result.current.toggleOne('x3');
    });
    expect(result.current.selectedIds.size).toBe(3);
  });
});

// ── state setters ──────────────────────────────────────────────────────────────
describe('useFailedMessagesUI — state setters', () => {
  it('setHours updates hours', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setHours(48); });
    expect(result.current.hours).toBe(48);
  });

  it('setStatusFilter updates statusFilter', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setStatusFilter('retrying'); });
    expect(result.current.statusFilter).toBe('retrying');
  });

  it('setPage updates page', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setPage(3); });
    expect(result.current.page).toBe(3);
  });

  it('setSearch updates search and can be cleared', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setSearch('error'); });
    expect(result.current.search).toBe('error');
    act(() => { result.current.setSearch(null); });
    expect(result.current.search).toBeNull();
  });

  it('setErrorCodeFilter updates errorCodeFilter', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setErrorCodeFilter('http_500'); });
    expect(result.current.errorCodeFilter).toBe('http_500');
  });

  it('setSelected sets a row', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    const row = makeRow('r99', '2024-01-01Z');
    act(() => { result.current.setSelected(row); });
    expect(result.current.selected?.id).toBe('r99');
  });

  it('setConfirmBulkAbandon opens the confirm dialog', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setConfirmBulkAbandon(true); });
    expect(result.current.confirmBulkAbandon).toBe(true);
  });

  it('setGuidedReprocessOpen opens the guided dialog', () => {
    const { result } = renderHook(() => useFailedMessagesUI());
    act(() => { result.current.setGuidedReprocessOpen(true); });
    expect(result.current.guidedReprocessOpen).toBe(true);
  });
});
