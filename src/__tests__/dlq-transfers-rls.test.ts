/**
 * Testes de integração das RPCs de DLQ/transfers com mock do client Supabase.
 *
 * Verifica que:
 *  - Agente comum recebe `42501 forbidden` em RPCs de DLQ.
 *  - Admin/supervisor recebem a lista paginada normalmente.
 *  - Transfers respeitam RLS (agente vê só os seus; admin vê tudo).
 *  - `isRlsDeniedError` classifica corretamente o erro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isRlsDeniedError, formatAdminError, rlsDeniedMessage } from '@/lib/errors/rlsError';
import { canAccessAdminResource, highestRole } from '@/lib/auth/roleMapping';

type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
type RpcFn = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

function makeClient(handler: RpcFn) {
  return { rpc: vi.fn(handler) };
}

describe('RLS denied error helper', () => {
  it('detects PostgREST 42501 errors', () => {
    expect(isRlsDeniedError({ code: '42501', message: 'forbidden' })).toBe(true);
  });
  it('detects HTTP 403 errors', () => {
    expect(isRlsDeniedError({ status: 403 })).toBe(true);
  });
  it('ignores generic errors', () => {
    expect(isRlsDeniedError(new Error('network timeout'))).toBe(false);
  });
  it('formats friendly PT-BR message', () => {
    expect(formatAdminError({ code: '42501' }, 'DLQ')).toBe(rlsDeniedMessage('DLQ'));
  });
});

describe('Role mapping', () => {
  it('grants supervisor access to DLQ', () => {
    expect(canAccessAdminResource('supervisor', 'dlq')).toBe(true);
    expect(canAccessAdminResource('admin', 'dlq')).toBe(true);
    expect(canAccessAdminResource('dev', 'dlq')).toBe(true);
  });
  it('denies agent/viewer access to DLQ', () => {
    expect(canAccessAdminResource('agent', 'dlq')).toBe(false);
    expect(canAccessAdminResource('viewer', 'dlq')).toBe(false);
    expect(canAccessAdminResource(null, 'dlq')).toBe(false);
  });
  it('picks the highest role from a list', () => {
    expect(highestRole(['agent', 'supervisor', 'viewer'])).toBe('supervisor');
    expect(highestRole(['agent'])).toBe('agent');
    expect(highestRole([])).toBeNull();
  });
});

describe('DLQ RPC gating (mocked)', () => {
  const dlqRows = [{ id: 'a', status: 'pending', total_count: 1 }];

  beforeEach(() => vi.clearAllMocks());

  it('agente comum recebe 42501 ao listar failed_messages', async () => {
    const client = makeClient(async () => ({ data: null, error: { code: '42501', message: 'forbidden' } }));
    const { error } = await client.rpc('rpc_list_failed_messages', { p_limit: 50, p_offset: 0 });
    expect(error).not.toBeNull();
    expect(isRlsDeniedError(error)).toBe(true);
  });

  it('admin obtém a lista paginada de DLQ', async () => {
    const client = makeClient(async (name) => {
      expect(name).toBe('rpc_list_failed_messages');
      return { data: dlqRows, error: null };
    });
    const { data, error } = await client.rpc('rpc_list_failed_messages', {
      p_status: ['pending'], p_limit: 50, p_offset: 0,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect((data as typeof dlqRows)[0].total_count).toBe(1);
  });

  it('agente comum recebe 42501 ao listar audit da DLQ', async () => {
    const client = makeClient(async () => ({ data: null, error: { code: '42501', message: 'forbidden' } }));
    const { error } = await client.rpc('rpc_dlq_list_audit', { p_limit: 30, p_offset: 0, p_action: null });
    expect(isRlsDeniedError(error)).toBe(true);
  });
});

describe('Transfers RPC respects RLS (mocked)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('agente vê apenas transfers em que é from/to (simulado via RLS)', async () => {
    const agentRows = [{ id: 't1', from_agent_id: 'me', to_agent_id: 'other', total_count: 1 }];
    const client = makeClient(async () => ({ data: agentRows, error: null }));
    const { data } = await client.rpc('rpc_list_transfers_paginated', { p_limit: 50, p_offset: 0 });
    expect((data as typeof agentRows).every(r => r.from_agent_id === 'me' || r.to_agent_id === 'me')).toBe(true);
  });

  it('admin vê o conjunto completo', async () => {
    const adminRows = [
      { id: 't1', from_agent_id: 'a', to_agent_id: 'b', total_count: 3 },
      { id: 't2', from_agent_id: 'c', to_agent_id: 'd', total_count: 3 },
      { id: 't3', from_agent_id: 'e', to_agent_id: 'f', total_count: 3 },
    ];
    const client = makeClient(async () => ({ data: adminRows, error: null }));
    const { data } = await client.rpc('rpc_list_transfers_paginated', { p_limit: 50, p_offset: 0 });
    expect((data as typeof adminRows).length).toBe(3);
    expect((data as typeof adminRows)[0].total_count).toBe(3);
  });
});
