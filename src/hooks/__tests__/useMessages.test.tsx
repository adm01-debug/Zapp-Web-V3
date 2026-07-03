import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Rewritten 2026-07-03 against the real hook API. The previous suite was stale:
// it called useMessages({ contactId }) (an object) when the hook takes a string
// remoteJid, so renderHook's per-render object identity re-fired the load effect
// in an infinite loop and OOM'd. It also mocked supabase.from().range() while the
// hook fetches via dbList(RPC.listMessagesLite). This version mocks the correct
// data layer and drives every effect to a deterministic, settled state.

const dbList = vi.fn();
const dbFrom = vi.fn();
const dbTable = vi.fn((t: string) => t);

const realtimeChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};
const supabaseChannel = vi.fn(() => realtimeChannel);
const removeChannel = vi.fn();

vi.mock('@/integrations/datasource/db', () => ({
  dbList: (...a: unknown[]) => dbList(...a),
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
});
