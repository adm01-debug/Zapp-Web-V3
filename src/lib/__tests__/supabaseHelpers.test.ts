/**
 * Tests for supabaseHelpers.ts — fromTable() is a thin delegation wrapper.
 *
 * Verifies:
 * - fromTable(name) calls supabase.from(name)
 * - The return value from supabase.from is forwarded as-is
 * - Different table names are forwarded correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockFrom },
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { fromTable } from '../supabaseHelpers';

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ── delegation ────────────────────────────────────────────────────────────────
describe('fromTable', () => {
  it('calls supabase.from with the provided table name', () => {
    const builder = {};
    mockFrom.mockReturnValue(builder);
    fromTable('contacts');
    expect(mockFrom).toHaveBeenCalledWith('contacts');
  });

  it('returns the query builder from supabase.from', () => {
    const builder = { select: vi.fn() };
    mockFrom.mockReturnValue(builder);
    const result = fromTable('contacts');
    expect(result).toBe(builder);
  });

  it('forwards any table name including dynamic ones', () => {
    const builder = {};
    mockFrom.mockReturnValue(builder);
    fromTable('some_dynamic_table');
    expect(mockFrom).toHaveBeenCalledWith('some_dynamic_table');
  });

  it('calls supabase.from exactly once per invocation', () => {
    mockFrom.mockReturnValue({});
    fromTable('events');
    expect(mockFrom).toHaveBeenCalledOnce();
  });

  it('returns distinct builder instances for successive calls', () => {
    const builderA = { id: 'a' };
    const builderB = { id: 'b' };
    mockFrom.mockReturnValueOnce(builderA).mockReturnValueOnce(builderB);
    expect(fromTable('tableA')).toBe(builderA);
    expect(fromTable('tableB')).toBe(builderB);
  });
});
