import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Rewritten 2026-07-03 against the real hook API. The previous suite was stale:
// it called useMessages({ contactId }) (an object) when the hook takes a string
// remoteJid, so renderHook's per-render object identity re-fired the load effect
// in an infinite loop and OOM'd. It also mocked supabase.from().range() while the
// hook fetches via dbList(RPC.listMessagesLite). This version mocks the correct
// data layer and drives every effect to a deterministic, settled state.

const dbList = vi.hoisted(() => vi.fn());
const dbRpc = vi.hoisted(() => vi.fn());
const dbFrom = vi.hoisted(() => vi.fn());
const dbTable = vi.fn((t: string) => t);

const realtimeChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
const supabaseChannel = vi.fn(() => realtimeChannel);
const removeChannel = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/datasource/db', () => ({
  dbList: (...a: unknown[]) => dbList(...a),
  dbRpc:  (...a: unknown[]) => dbRpc(...a),
  dbFrom: (...a: unknown[]) => dbFrom(...a),
  dbTable: (...a: unknown[]) => dbTable(...(a as Parameters<typeof dbTable>)),
}));
vi.mock('@/integrations/datasource/rpcCatalog', () => ({
  RPC: { listMessagesLite: 'list_messages_lite' },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...a: unknown[]) => supabaseChannel(...(a as Parameters<typeof supabaseChannel>)),
    removeChannel: (...a: unknown[]) => removeChannel(...a),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/eventBus', () => ({ eventBus: { on: vi.fn(() => vi.fn()) } }));
vi.mock('@/lib/inbox/chatOptimizations', () => ({
  deduplicateMessages: (_prev: unknown[], next: unknown[]) => next,
  setLastReceived: vi.fn(),
}));
vi.mock('@/lib/sanitize', () => ({ sanitizeText: (s: string) => s }));
vi.mock('@/lib/logger');

import { useMessages } from '@/hooks/useMessages';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'm1', message_id: 'wamid1', remote_jid: 'jid1', from_me: false,
    message_type: 'text', content: 'oi', created_at: '2026-01-01T00:00:00Z', ...over,
  };
}

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbList.mockResolvedValue({ data: [], error: null });
    dbRpc.mockResolvedValue({ data: null, error: null });
    dbFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
  });

  it('does not fetch and stays empty when remoteJid is null', async () => {
    const { result } = renderHook(() => useMessages(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual([]);
    expect(dbList).not.toHaveBeenCalled();
  });

  it('loads messages via dbList(RPC.listMessagesLite) and reverses them for the UI', async () => {
    dbList.mockResolvedValue({ data: [row({ id: 'a' }), row({ id: 'b' })], error: null });
    const { result } = renderHook(() => useMessages('jid1'));

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(dbList).toHaveBeenCalledWith('list_messages_lite', {
      p_remote_jid: 'jid1', p_limit: 50, p_offset: 0,
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(['b', 'a']);
    expect(result.current.loading).toBe(false);
  });

  it('settles to loading=false with no messages when the fetch errors', async () => {
    dbList.mockResolvedValue({ data: null, error: new Error('boom') });
    const { result } = renderHook(() => useMessages('jid1'));

    await waitFor(() => expect(dbList).toHaveBeenCalled());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toEqual([]);
  });

  it('subscribes to a realtime channel scoped to the remoteJid', async () => {
    const { result } = renderHook(() => useMessages('jid1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(supabaseChannel).toHaveBeenCalledWith('evo-messages:jid1');
    expect(realtimeChannel.subscribe).toHaveBeenCalled();
  });

  it('reports hasMore when a full page is returned', async () => {
    dbList.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => row({ id: `m${i}`, message_id: `w${i}` })),
      error: null,
    });
    const { result } = renderHook(() => useMessages('jid1'));

    await waitFor(() => expect(result.current.messages).toHaveLength(50));
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore issues a second dbList with p_offset=50 and sets hasMore=false on a partial page', async () => {
    dbList.mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => row({ id: `m${i}`, message_id: `w${i}` })),
      error: null,
    });
    const { result } = renderHook(() => useMessages('jid1'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    dbList.mockResolvedValue({ data: [row({ id: 'extra' })], error: null });

    await act(async () => { await result.current.loadMore(); });

    expect(dbList).toHaveBeenCalledTimes(2);
    expect(dbList).toHaveBeenNthCalledWith(2, 'list_messages_lite', expect.objectContaining({
      p_remote_jid: 'jid1', p_offset: 50,
    }));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loadingMore).toBe(false);
    expect(result.current.messages).toHaveLength(51);
  });

  it('appends a new message when a realtime INSERT payload arrives', async () => {
    dbList.mockResolvedValue({ data: [row({ id: 'existing', message_id: 'wmid0' })], error: null });
    const { result } = renderHook(() => useMessages('jid1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    const insertCall = realtimeChannel.on.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.event === 'INSERT',
    );
    const insertCallback = insertCall?.[2] as (p: Record<string, unknown>) => void;

    act(() => { insertCallback({ new: row({ id: 'new1', message_id: 'wmid1' }) }); });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.some((m) => m.id === 'new1')).toBe(true);
  });

  it('does not throw and leaves messages unchanged when a realtime UPDATE arrives with payload.new=null', async () => {
    dbList.mockResolvedValue({ data: [row({ id: 'r1' })], error: null });
    const { result } = renderHook(() => useMessages('jid1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    const updateCall = realtimeChannel.on.mock.calls.find(
      (c: unknown[]) => (c[1] as Record<string, unknown>)?.event === 'UPDATE',
    );
    const updateCallback = updateCall?.[2] as (p: Record<string, unknown>) => void;

    expect(() => act(() => { updateCallback({ new: null, old: { id: 'r1' } }); })).not.toThrow();
    expect(result.current.messages).toHaveLength(1);
  });
});
