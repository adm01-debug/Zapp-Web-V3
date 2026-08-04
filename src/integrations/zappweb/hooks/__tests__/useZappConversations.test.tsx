import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { createMockSupabase } from '@/test/mocks/supabase';
import { useZappConversations } from '../useZappConversations';
import { ZAPPWEB_INSTANCE } from '../../supabaseClient';

type MockClient = ReturnType<typeof createMockSupabase>;

// Holder populado pela factory do vi.mock (roda antes dos imports do módulo).
const supabaseMock = vi.hoisted(() => ({
  client: null as unknown as MockClient,
  convRows: [] as unknown[],
}));

// Mock do client principal (re-exportado como zappSupabase pelo supabaseClient).
vi.mock('@/integrations/supabase/client', async () => {
  const { createMockSupabase } = await vi.importActual<typeof import('@/test/mocks/supabase')>(
    '@/test/mocks/supabase'
  );
  supabaseMock.client = createMockSupabase({
    tables: { evolution_conversations_wpp2: { data: supabaseMock.convRows } },
  });
  return { supabase: supabaseMock.client };
});

const CONV_FIXTURE = {
  id: '00000000-0000-4000-8000-0000000000a1',
  remote_jid: '5511999990001@s.whatsapp.net',
  contact_id: null,
  status: 'aberta',
  unread_count: 2,
  last_message_content: 'oi',
  last_message_type: 'text',
  last_message_at: '2026-08-04T12:00:00Z',
  last_inbound_at: null,
  assigned_to: null,
  priority: 0,
  instance_name: ZAPPWEB_INSTANCE,
  evolution_contacts: [{ id: 'c1', push_name: 'Alice', phone_number: '5511999990001' }],
};

function convRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({ ...CONV_FIXTURE, id: `${i}` }));
}

beforeEach(() => {
  supabaseMock.convRows.length = 0;
  supabaseMock.convRows.push(...convRows(2));
  supabaseMock.client.from.mockClear();
  supabaseMock.client.channel.mockClear();
  supabaseMock.client.schema.mockClear();
  supabaseMock.client.removeChannel.mockClear();
});

describe('useZappConversations (fix: hooks zappweb sem .schema("evo"))', () => {
  it('carrega conversas direto de evolution_conversations_wpp2 sem passar por .schema("evo")', async () => {
    const { result } = renderHook(() => useZappConversations());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.conversations).toHaveLength(2);
    expect(result.current.conversations[0].instance_name).toBe(ZAPPWEB_INSTANCE);

    // NUNCA chamar .schema no client (schema 'evo' fora de PGRST_DB_SCHEMAS → PGRST106)
    expect(supabaseMock.client.schema).not.toHaveBeenCalled();

    // Query via from() direto na tabela (vista pelo PostgREST)
    expect(supabaseMock.client.from).toHaveBeenCalledWith('evolution_conversations_wpp2');

    // Chain completa: select (com join de contatos) → eq instance → eq status → order → limit
    const builder = supabaseMock.client.from.mock.results[0].value;
    expect(builder.schema).toBeUndefined(); // a chain NÃO possui método .schema
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('evolution_contacts'));
    expect(builder.eq).toHaveBeenCalledWith('instance_name', ZAPPWEB_INSTANCE);
    expect(builder.eq).toHaveBeenCalledWith('status', 'aberta');
    expect(builder.order).toHaveBeenCalledWith('last_message_at', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(50);
  });

  it('usa Realtime com schema "evo" APENAS na config do channel (obrigatório p/ partição root), nunca no query builder', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(supabaseMock.client.channel).toHaveBeenCalledWith(`zapp:conversations:${ZAPPWEB_INSTANCE}`);
    const channel = supabaseMock.client.channel.mock.results[0].value;
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        schema: 'evo',
        table: 'evolution_conversations',
        filter: `instance_name=eq.${ZAPPWEB_INSTANCE}`,
      }),
      expect.any(Function)
    );
    expect(channel.subscribe).toHaveBeenCalled();
    // Hook expõe refetch para consumidores
    expect(typeof result.current.refetch).toBe('function');
  });

  it('markAsRead faz update em evolution_conversations_wpp2 sem .schema', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAsRead('00000000-0000-4000-8000-0000000000a1');
    });

    expect(supabaseMock.client.schema).not.toHaveBeenCalled();
    const calls = supabaseMock.client.from.mock.results;
    const updateBuilder = calls[calls.length - 1].value;
    expect(updateBuilder.update).toHaveBeenCalledWith({ unread_count: 0 });
    expect(updateBuilder.eq).toHaveBeenCalledWith('id', '00000000-0000-4000-8000-0000000000a1');
  });

  it('refetch recarrega a lista', async () => {
    const { result } = renderHook(() => useZappConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = supabaseMock.client.from.mock.calls.length;

    await act(async () => {
      await result.current.refetch();
    });

    expect(supabaseMock.client.from.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(result.current.conversations).toHaveLength(2);
  });
});
