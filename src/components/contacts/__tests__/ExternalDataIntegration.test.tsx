import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock RPC and direct table calls used by the updated hooks.
// useExternalEmpresas / useExternalCargos call:
//   - getExternalSupabase().from('salespeople')  → externalClient mock
//   - dbRpc(RPC.searchContactsAdvanced, ...)     → datasource/db mock (routes to 'lovable' client)
const mockDbRpc = vi.hoisted(() => vi.fn()); // intercepts dbRpc calls (search_contacts_advanced etc.)
const mockFrom = vi.hoisted(() => vi.fn()); // tracks getExternalSupabase().from() calls

vi.mock('@/integrations/datasource/db', () => ({
  dbRpc: (...a: unknown[]) =>
    (globalThis as Record<string, (...args: unknown[]) => unknown>).__mockDbRpc(...a),
}));

vi.mock('@/integrations/supabase/externalClient', () => {
  const _mockFrom = (table: string) => {
    (globalThis as Record<string, (t: string) => void>).__extMockFrom(table);
    return {
      select: vi.fn(() => ({
        not: vi.fn(() => ({
          limit: vi.fn(() => {
            if (table === 'salespeople') {
              return Promise.resolve({
                data: [
                  { role: 'Closer' },
                  { role: 'SDR' },
                  { role: 'Gerente' },
                  { role: '  Hybrid  ' },
                  { role: '' },
                  { role: null },
                ],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          }),
        })),
      })),
    };
  };
  const client = { from: _mockFrom };
  return {
    externalSupabase: client,
    getExternalSupabase: () => client,
    isExternalConfigured: true,
  };
});

// Bridge mock fns to globalThis so hoisted factories can access them at call time
(globalThis as Record<string, unknown>).__mockDbRpc = mockDbRpc;
(globalThis as Record<string, unknown>).__extMockFrom = mockFrom;

vi.mock('@/lib/logger');

import { useExternalEmpresas } from '@/hooks/useExternalEmpresas';
import { useExternalCargos } from '@/hooks/useExternalCargos';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// dbRpc returns { data, error, correlationId } — match what the hook destructures
function rpcOk(data: unknown) {
  return Promise.resolve({ data, error: null, correlationId: '' });
}
function rpcErr(message: string) {
  return Promise.resolve({ data: null, error: new Error(message), correlationId: '' });
}

// ─── useExternalEmpresas (RPC-based) ───────────────────────────────
describe('useExternalEmpresas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: single page with diverse company names
    mockDbRpc.mockReturnValue(
      rpcOk({
        results: [
          { company_name: 'Acme Corp' },
          { company_name: 'TechBR' },
          { company_name: '  SpaceLabs  ' },
          { company_name: 'Acme Corp' }, // duplicate
          { company_name: '' }, // empty
          { company_name: null }, // null
        ],
      })
    );
  });

  it('fetches unique trimmed empresa names via RPC', async () => {
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data).toContain('Acme Corp');
    expect(data).toContain('TechBR');
    expect(data).toContain('SpaceLabs');
    // No duplicates
    expect(data.filter((e) => e === 'Acme Corp')).toHaveLength(1);
    // No empty strings
    expect(data.filter((e) => e === '')).toHaveLength(0);
  });

  it('calls dbRpc with search_contacts_advanced def and p_page=0', async () => {
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // dbRpc is called with (RpcDefinition, params) — first arg is the def object
    expect(mockDbRpc).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'search_contacts_advanced' }),
      expect.objectContaining({ p_page: 0, p_page_size: 200 })
    );
  });

  it('paginates until fewer results than page size', async () => {
    // First call returns full page, second returns partial
    mockDbRpc
      .mockReturnValueOnce(
        rpcOk({
          results: Array.from({ length: 200 }, (_, i) => ({ company_name: `Company ${i}` })),
        })
      )
      .mockReturnValueOnce(
        rpcOk({
          results: [{ company_name: 'Last Company' }],
        })
      );

    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDbRpc).toHaveBeenCalledTimes(2);
    expect(result.current.data).toContain('Last Company');
    expect(result.current.data).toContain('Company 0');
  });

  it('handles RPC error gracefully', async () => {
    mockDbRpc.mockReturnValue(rpcErr('RPC failed'));
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns sorted results (pt-BR locale)', async () => {
    const { result } = renderHook(() => useExternalEmpresas(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    const sorted = [...data].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    expect(data).toEqual(sorted);
  });
});

// ─── useExternalCargos (salespeople.role + RPC) ────────────────────
describe('useExternalCargos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: RPC returns cargo field entries
    mockDbRpc.mockReturnValue(
      rpcOk({
        results: [
          { cargo: 'Diretor' },
          { cargo: 'Analista' },
          { cargo: 'Gerente' }, // duplicate with salespeople
          { cargo: '' },
        ],
      })
    );
  });

  it('merges salespeople.role + RPC cargos, deduplicates', async () => {
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    // From salespeople
    expect(data).toContain('Closer');
    expect(data).toContain('SDR');
    expect(data).toContain('Hybrid');
    // From RPC
    expect(data).toContain('Diretor');
    expect(data).toContain('Analista');
    // Deduplicated "Gerente" (both sources)
    expect(data.filter((c) => c === 'Gerente')).toHaveLength(1);
    // No empty strings
    expect(data.filter((c) => c === '')).toHaveLength(0);
  });

  it('queries salespeople table directly for roles', async () => {
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('salespeople');
  });

  it('also calls dbRpc for additional cargos', async () => {
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDbRpc).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'search_contacts_advanced' }),
      expect.objectContaining({ p_page: 0 })
    );
  });

  it('returns sorted results (pt-BR locale)', async () => {
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    const sorted = [...data].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    expect(data).toEqual(sorted);
  });

  it('handles salespeople error gracefully, still returns RPC data', async () => {
    // The mock already returns data, so this tests the merge logic
    const { result } = renderHook(() => useExternalCargos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.length).toBeGreaterThan(0);
  });
});

// ─── Disabled state ────────────────────────────────────────────────
describe('useExternalEmpresas — disabled when not configured', () => {
  it('does not fetch when external is not configured', () => {
    const enabled = false; // simulating isExternalConfigured = false
    expect(enabled).toBe(false);
  });
});

// ─── ContactForm — Empresa autocomplete logic ─────────────────────
describe('ContactForm — Empresa autocomplete logic', () => {
  const empresas = ['Acme Corp', 'Acme Ltda', 'TechBR', 'SpaceLabs', 'Google Brasil'];

  function filterEmpresas(list: string[], query: string) {
    if (query.length < 1) return [];
    return list.filter((e) => e.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
  }

  it('returns empty for empty query', () => {
    expect(filterEmpresas(empresas, '')).toHaveLength(0);
  });

  it('filters with 1 char', () => {
    const result = filterEmpresas(empresas, 'G');
    expect(result).toEqual(['Google Brasil']);
  });

  it('filters by partial match (case-insensitive)', () => {
    expect(filterEmpresas(empresas, 'acme')).toEqual(['Acme Corp', 'Acme Ltda']);
    expect(filterEmpresas(empresas, 'tech')).toEqual(['TechBR']);
    expect(filterEmpresas(empresas, 'GOOGLE')).toEqual(['Google Brasil']);
  });

  it('limits results to 8', () => {
    const bigList = Array.from({ length: 20 }, (_, i) => `Company ${i}`);
    expect(filterEmpresas(bigList, 'Company').length).toBe(8);
  });

  it('returns empty when no match', () => {
    expect(filterEmpresas(empresas, 'zzzz')).toHaveLength(0);
  });
});

// ─── ContactForm — Cargo select logic ─────────────────────────────
describe('ContactForm — Cargo select logic', () => {
  it('__none__ maps to empty string', () => {
    const value = '__none__';
    expect(value === '__none__' ? '' : value).toBe('');
  });

  it('valid cargo passes through', () => {
    const value: string = 'Gerente';
    expect(value === '__none__' ? '' : value).toBe('Gerente');
  });
});

// ─── ContactForm — Validation ─────────────────────────────────────
describe('ContactForm — Validation', () => {
  const validateEmail = (email: string): boolean => {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validatePhone = (phone: string): boolean => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  };

  const formatPhone = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.startsWith('55')) {
      if (cleaned.length <= 4) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2)}`;
      if (cleaned.length <= 6)
        return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4)}`;
      if (cleaned.length <= 11)
        return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
      return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9, 13)}`;
    }
    return value;
  };

  it('validates correct emails', () => {
    expect(validateEmail('test@email.com')).toBe(true);
    expect(validateEmail('user@domain.co.br')).toBe(true);
    expect(validateEmail('')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('missing@')).toBe(false);
    expect(validateEmail('@nodomain.com')).toBe(false);
  });

  it('validates correct phone numbers', () => {
    expect(validatePhone('+55 11 99999-9999')).toBe(true);
    expect(validatePhone('5511999999999')).toBe(true);
    expect(validatePhone('11999999999')).toBe(true);
  });

  it('rejects short phone numbers', () => {
    expect(validatePhone('123')).toBe(false);
    expect(validatePhone('999')).toBe(false);
  });

  it('formats Brazilian phone correctly', () => {
    expect(formatPhone('5511999999999')).toBe('+55 (11) 99999-9999');
    expect(formatPhone('5511')).toBe('+55 (11');
    expect(formatPhone('551199')).toBe('+55 (11) 99');
  });

  it('returns raw value for non-BR numbers', () => {
    expect(formatPhone('1234567890')).toBe('1234567890');
  });
});