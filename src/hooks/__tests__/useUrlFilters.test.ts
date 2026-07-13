/**
 * Tests for useUrlFilters().
 *
 * The hook wraps useSearchParams() (react-router-dom) and parses / serialises
 * filter state to/from URL query parameters. Tests wrap each render with a
 * MemoryRouter so that useSearchParams has a Router context to work with.
 *
 * setFilters / clearFilters drive URL changes that synchronously update
 * filters in the same render cycle via useSearchParams + useMemo.
 *
 * Covered — parsing (filters from URL):
 *   - All filter fields are empty / null when URL has no params
 *   - status is split on ',' and returns an array
 *   - tags is split on ',' and returns an array
 *   - agentId is read from the 'agent' param
 *   - dateFrom is read from the 'from' param
 *   - dateTo is read from the 'to' param
 *   - search is read from the 'q' param
 *
 * Covered — setFilters (updates URL):
 *   - Setting a non-empty status array writes ',' joined value to URL
 *   - Setting an empty status array removes the param
 *   - Setting a non-empty tags array writes to URL
 *   - Setting an empty tags array removes the param
 *   - Setting a truthy agentId writes to URL
 *   - Setting agentId to null removes the param
 *   - Setting dateFrom / dateTo writes or removes correctly
 *   - Setting a non-empty search writes to URL
 *   - Setting search to '' removes the param
 *   - Partial update: only specified keys are changed
 *
 * Covered — clearFilters:
 *   - Removes all params and returns empty filter state
 *
 * Covered — hasActiveFilters:
 *   - false when all filters are empty
 *   - true when any filter is active (status, tags, agentId, dateFrom, dateTo, search)
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';
import { useUrlFilters } from '../useUrlFilters';

function makeWrapper(initialUrl = '/') {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initialUrl] }, children);
}

// ── parsing: initial URL → filters ────────────────────────────────────────────
describe('useUrlFilters — parsing from URL', () => {
  it('returns empty filter state when URL has no params', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    expect(result.current.filters).toEqual({
      status: [],
      tags: [],
      agentId: null,
      dateFrom: null,
      dateTo: null,
      search: '',
    });
  });

  it('parses status as an array split on commas', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=open,pending'),
    });
    expect(result.current.filters.status).toEqual(['open', 'pending']);
  });

  it('parses a single status value as a one-element array', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=closed'),
    });
    expect(result.current.filters.status).toEqual(['closed']);
  });

  it('parses tags as an array split on commas', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?tags=urgent,vip'),
    });
    expect(result.current.filters.tags).toEqual(['urgent', 'vip']);
  });

  it('parses agentId from the "agent" param', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?agent=agent-42'),
    });
    expect(result.current.filters.agentId).toBe('agent-42');
  });

  it('parses dateFrom from the "from" param', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?from=2024-01-01'),
    });
    expect(result.current.filters.dateFrom).toBe('2024-01-01');
  });

  it('parses dateTo from the "to" param', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?to=2024-12-31'),
    });
    expect(result.current.filters.dateTo).toBe('2024-12-31');
  });

  it('parses search from the "q" param', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?q=hello+world'),
    });
    expect(result.current.filters.search).toBe('hello world');
  });

  it('parses all filter fields simultaneously', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=open&tags=vip&agent=a1&from=2024-01-01&to=2024-01-31&q=test'),
    });
    const f = result.current.filters;
    expect(f.status).toEqual(['open']);
    expect(f.tags).toEqual(['vip']);
    expect(f.agentId).toBe('a1');
    expect(f.dateFrom).toBe('2024-01-01');
    expect(f.dateTo).toBe('2024-01-31');
    expect(f.search).toBe('test');
  });
});

// ── setFilters ─────────────────────────────────────────────────────────────────
describe('useUrlFilters — setFilters', () => {
  it('sets status array in URL and reflects in filters', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFilters({ status: ['open', 'closed'] }); });
    expect(result.current.filters.status).toEqual(['open', 'closed']);
  });

  it('removes status param when given an empty array', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=open'),
    });
    act(() => { result.current.setFilters({ status: [] }); });
    expect(result.current.filters.status).toEqual([]);
  });

  it('sets tags array in URL and reflects in filters', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFilters({ tags: ['urgent', 'vip'] }); });
    expect(result.current.filters.tags).toEqual(['urgent', 'vip']);
  });

  it('removes tags param when given an empty array', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?tags=vip'),
    });
    act(() => { result.current.setFilters({ tags: [] }); });
    expect(result.current.filters.tags).toEqual([]);
  });

  it('sets agentId in URL', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFilters({ agentId: 'agent-7' }); });
    expect(result.current.filters.agentId).toBe('agent-7');
  });

  it('removes agentId from URL when set to null', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?agent=agent-7'),
    });
    act(() => { result.current.setFilters({ agentId: null }); });
    expect(result.current.filters.agentId).toBeNull();
  });

  it('sets dateFrom in URL', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFilters({ dateFrom: '2024-03-01' }); });
    expect(result.current.filters.dateFrom).toBe('2024-03-01');
  });

  it('removes dateFrom when set to null', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?from=2024-03-01'),
    });
    act(() => { result.current.setFilters({ dateFrom: null }); });
    expect(result.current.filters.dateFrom).toBeNull();
  });

  it('sets dateTo in URL', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFilters({ dateTo: '2024-03-31' }); });
    expect(result.current.filters.dateTo).toBe('2024-03-31');
  });

  it('sets search in URL', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    act(() => { result.current.setFilters({ search: 'hello' }); });
    expect(result.current.filters.search).toBe('hello');
  });

  it('removes search when set to empty string', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?q=hello'),
    });
    act(() => { result.current.setFilters({ search: '' }); });
    expect(result.current.filters.search).toBe('');
  });

  it('partial update only modifies the specified keys', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=open&agent=agent-1'),
    });
    act(() => { result.current.setFilters({ status: ['closed'] }); });
    // agentId should be unchanged
    expect(result.current.filters.agentId).toBe('agent-1');
    expect(result.current.filters.status).toEqual(['closed']);
  });
});

// ── clearFilters ───────────────────────────────────────────────────────────────
describe('useUrlFilters — clearFilters', () => {
  it('resets all filters to empty state', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=open&tags=vip&agent=a1&from=2024-01-01&to=2024-01-31&q=test'),
    });
    act(() => { result.current.clearFilters(); });
    expect(result.current.filters).toEqual({
      status: [],
      tags: [],
      agentId: null,
      dateFrom: null,
      dateTo: null,
      search: '',
    });
  });
});

// ── hasActiveFilters ───────────────────────────────────────────────────────────
describe('useUrlFilters — hasActiveFilters', () => {
  it('is false when all filters are empty', () => {
    const { result } = renderHook(() => useUrlFilters(), { wrapper: makeWrapper('/') });
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('is true when status has values', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=open'),
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('is true when tags has values', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?tags=urgent'),
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('is true when agentId is set', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?agent=a1'),
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('is true when dateFrom is set', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?from=2024-01-01'),
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('is true when dateTo is set', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?to=2024-12-31'),
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('is true when search is set', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?q=hello'),
    });
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it('becomes false after clearFilters', () => {
    const { result } = renderHook(() => useUrlFilters(), {
      wrapper: makeWrapper('/?status=open&q=test'),
    });
    expect(result.current.hasActiveFilters).toBe(true);
    act(() => { result.current.clearFilters(); });
    expect(result.current.hasActiveFilters).toBe(false);
  });
});
