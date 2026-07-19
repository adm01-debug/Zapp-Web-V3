import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContactEnrichedData } from '../useContactEnrichedData';

const LOCAL_ID = '11111111-1111-1111-1111-111111111111';

// Mutable per-test rows
let contactRow: Record<string, unknown> | null = null;
let aiTagsRows: unknown[] = [];
let slaRow: Record<string, unknown> | null = null;

function chain(finalValue: { data: unknown; error: unknown }) {
  const c: any = {
    select: () => c,
    eq: () => c,
    or: () => c,
    order: () => c,
    limit: () => c,
    maybeSingle: () => Promise.resolve(finalValue),
    then: (resolve: (v: unknown) => void) => Promise.resolve(finalValue).then(resolve),
  };
  return c;
}

vi.mock('@/lib/logger', () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/sanitize', () => ({ sanitizePostgrestFilter: (v: string) => v }));

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (table: string) => {
    if (table === 'contacts') {
      // Both resolve step (by phone/uuid) and enriched fetch use dbFrom('contacts').
      // Return { id: LOCAL_ID } for lookups; and the enriched row for selects with fields.
      return {
        select: (fields: string) => {
          const isEnriched = fields.includes('company');
          const value = isEnriched
            ? { data: contactRow, error: null }
            : { data: { id: LOCAL_ID }, error: null };
          return chain(value);
        },
      };
    }
    return { select: () => chain({ data: null, error: null }) };
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'ai_conversation_tags') {
        return { select: () => chain({ data: aiTagsRows, error: null }) };
      }
      if (table === 'conversation_sla') {
        return { select: () => chain({ data: slaRow, error: null }) };
      }
      return { select: () => chain({ data: null, error: null }) };
    },
  },
}));

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useContactEnrichedData', () => {
  beforeEach(() => {
    contactRow = null;
    aiTagsRows = [];
    slaRow = null;
  });

  it('retorna aiTags como array vazio quando não há tags (nunca undefined)', async () => {
    const { result } = renderHook(() => useContactEnrichedData(LOCAL_ID), { wrapper: wrapper() });
    await waitFor(() => {
      expect(Array.isArray(result.current.aiTags)).toBe(true);
    });
    expect(result.current.aiTags).toEqual([]);
    expect(result.current.aiTags).not.toBeUndefined();
  });

  it('retorna aiTags como array populado quando existem tags', async () => {
    aiTagsRows = [
      { id: 't1', tag_name: 'urgent', confidence: 0.9, source: 'ai' },
      { id: 't2', tag_name: 'vip', confidence: 0.7, source: 'ai' },
    ];
    const { result } = renderHook(() => useContactEnrichedData(LOCAL_ID), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.aiTags.length).toBe(2);
    });
    expect(Array.isArray(result.current.aiTags)).toBe(true);
  });

  it('normaliza surname para null quando o banco retorna undefined/ausente', async () => {
    // Row without surname field at all (undefined) — hook must coerce to null
    contactRow = {
      company: 'ACME',
      job_title: null,
      nickname: null,
      // surname omitted → undefined
      contact_type: null,
      ai_sentiment: null,
      ai_priority: null,
      channel_type: null,
    };
    const { result } = renderHook(() => useContactEnrichedData(LOCAL_ID), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.enrichedData).toBeTruthy();
    });
    expect(result.current.enrichedData?.surname).toBeNull();
    expect(result.current.enrichedData?.surname).not.toBeUndefined();
  });

  it('normaliza surname para null quando o banco retorna null explicitamente', async () => {
    contactRow = {
      company: null,
      job_title: null,
      nickname: null,
      surname: null,
      contact_type: null,
      ai_sentiment: null,
      ai_priority: null,
      channel_type: null,
    };
    const { result } = renderHook(() => useContactEnrichedData(LOCAL_ID), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.enrichedData).toBeTruthy();
    });
    expect(result.current.enrichedData?.surname).toBeNull();
  });

  it('slaInfo é null quando não há registro (não quebra consumidores)', async () => {
    slaRow = null;
    const { result } = renderHook(() => useContactEnrichedData(LOCAL_ID), { wrapper: wrapper() });
    await waitFor(() => {
      expect(Array.isArray(result.current.aiTags)).toBe(true);
    });
    // Sem SLA row, slaInfo deve ser null — nunca undefined que quebraria acesso a campos
    expect(result.current.slaInfo ?? null).toBeNull();
  });

  it('slaInfo preserva campos como null quando ausentes na resposta', async () => {
    slaRow = {
      first_response_breached: false,
      resolution_breached: null,
      first_response_at: '2026-01-01T00:00:00Z',
      resolved_at: null,
    };
    const { result } = renderHook(() => useContactEnrichedData(LOCAL_ID), { wrapper: wrapper() });
    await waitFor(() => {
      expect(result.current.slaInfo).toBeTruthy();
    });
    expect(result.current.slaInfo?.resolution_breached ?? null).toBeNull();
    expect(result.current.slaInfo?.resolved_at ?? null).toBeNull();
    expect(result.current.slaInfo?.first_response_breached).toBe(false);
  });
});
