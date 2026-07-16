import { describe, it, expect } from 'vitest';
import { normalizeSearchInsights } from '@/hooks/useSearchManagement';

describe('normalizeSearchInsights', () => {
  it('returns fully-populated defaults when input is null/undefined', () => {
    const a = normalizeSearchInsights(null);
    const b = normalizeSearchInsights(undefined);
    for (const r of [a, b]) {
      expect(r.total_searches).toBe(0);
      expect(r.unique_queries).toBe(0);
      expect(r.vector_searches).toBe(0);
      expect(r.vector_share).toBe(0);
      expect(r.total_clicks).toBe(0);
      expect(r.click_through_rate).toBe(0);
      expect(r.zero_result_count).toBe(0);
      expect(r.zero_result_rate).toBe(0);
      expect(r.top_queries).toEqual([]);
      expect(r.zero_results).toEqual([]);
    }
  });

  it('coerces numeric strings and ignores non-finite values', () => {
    const r = normalizeSearchInsights({
      total_searches: '42',
      unique_queries: NaN,
      vector_searches: Infinity,
      vector_share: '0.5',
      total_clicks: null,
      zero_result_count: undefined,
    });
    expect(r.total_searches).toBe(42);
    expect(r.unique_queries).toBe(0);
    expect(r.vector_searches).toBe(0);
    expect(r.vector_share).toBe(0.5);
    expect(r.total_clicks).toBe(0);
    expect(r.zero_result_count).toBe(0);
  });

  it('normalizes top_queries and zero_results arrays defensively', () => {
    const r = normalizeSearchInsights({
      top_queries: [{ query: 'foo', count: 3 }, { query: 42, count: 'bad' }, null],
      zero_result_queries: [{ query: 'bar', attempts: 2 }],
    });
    expect(r.top_queries).toEqual([
      { query: 'foo', count: 3 },
      { query: '', count: 0 },
      { query: '', count: 0 },
    ]);
    expect(r.zero_results).toEqual([{ query: 'bar', attempts: 2 }]);
  });
});
