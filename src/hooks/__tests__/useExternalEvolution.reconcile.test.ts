/**
 * Tests for the pure reconciliation utilities exported from useExternalEvolution:
 *   reconcileOptimistic — merges optimistic messages with canonical ones
 *   applyReconciliation — applies reconciliation as an atomic setState call
 *
 * All module-level side-effectful imports are mocked so no network,
 * React-Query, Supabase, or playerStateStore calls are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock refs ──────────────────────────────────────────────────────────
const mockRecordMatch = vi.hoisted(() => vi.fn());
const mockMigrate = vi.hoisted(() => vi.fn());

// ── Module mocks ───────────────────────────────────────────────────────────────
vi.mock('@/features/inbox', () => ({
  recordMatch: mockRecordMatch,
  playerStateStore: { migrate: mockMigrate },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), debug: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/hooks/useMountedRef', () => ({ useMountedRef: () => ({ current: true }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));
vi.mock('@/lib/externalProxy', () => ({ queryExternalProxy: vi.fn() }));
vi.mock('@/adapters/evolutionAdapter', () => ({
  buildExternalConversations: vi.fn(),
  evolutionToRealtimeMessage: vi.fn(),
  jidToPhone: vi.fn(),
}));
vi.mock('@/lib/constants/whatsappInstances', () => ({
  DEFAULT_WHATSAPP_INSTANCE: 'default-instance',
}));
vi.mock('@/lib/realtime/crossTabDedupe', () => ({
  dedupedFetch: vi.fn(),
  subscribeDedupe: vi.fn(() => () => {}),
}));

// ── Import SUT AFTER mocks ─────────────────────────────────────────────────────
import { reconcileOptimistic, applyReconciliation } from '../useExternalEvolution';
import type { RealtimeMessage } from '@/features/inbox';

// ── Helpers ────────────────────────────────────────────────────────────────────
function msg(
  id: string,
  overrides: Partial<RealtimeMessage> = {}
): RealtimeMessage {
  return {
    id,
    contact_id: null,
    agent_id: null,
    content: 'hello',
    sender: 'sender@s.whatsapp.net',
    message_type: 'text',
    media_url: null,
    is_read: false,
    status: 'sent',
    status_updated_at: null,
    created_at: new Date(1_700_000_000_000).toISOString(),
    updated_at: new Date(1_700_000_000_000).toISOString(),
    external_id: null,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: false,
    reactions: null,
    ...overrides,
  };
}

function optMsg(
  id: string,
  overrides: Partial<RealtimeMessage> = {}
): RealtimeMessage {
  return msg(`optimistic:${id}`, overrides);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── reconcileOptimistic — empty incoming ───────────────────────────────────────
describe('reconcileOptimistic — empty incoming', () => {
  it('returns prev unchanged when incoming is empty', () => {
    const prev = [msg('1'), msg('2')];
    const result = reconcileOptimistic(prev, []);
    expect(result.filteredPrev).toBe(prev);
    expect(result.additions).toHaveLength(0);
    expect(result.remap.size).toBe(0);
  });
});

// ── reconcileOptimistic — no optimistic messages ───────────────────────────────
describe('reconcileOptimistic — canonical-only prev', () => {
  it('keeps all canonical prev messages', () => {
    const prev = [msg('c1'), msg('c2')];
    const incoming = [msg('c3')];
    const result = reconcileOptimistic(prev, incoming);
    expect(result.filteredPrev.map((m) => m.id)).toContain('c1');
    expect(result.filteredPrev.map((m) => m.id)).toContain('c2');
  });

  it('adds new incoming messages not already in prev', () => {
    const prev = [msg('c1')];
    const incoming = [msg('c2'), msg('c3')];
    const result = reconcileOptimistic(prev, incoming);
    expect(result.additions.map((m) => m.id)).toContain('c2');
    expect(result.additions.map((m) => m.id)).toContain('c3');
  });

  it('does not duplicate incoming messages already in prev', () => {
    const prev = [msg('c1')];
    const incoming = [msg('c1'), msg('c2')];
    const result = reconcileOptimistic(prev, incoming);
    const allIds = [
      ...result.filteredPrev.map((m) => m.id),
      ...result.additions.map((m) => m.id),
    ];
    const count = allIds.filter((id) => id === 'c1').length;
    expect(count).toBe(1);
  });
});

// ── reconcileOptimistic — external_id reconciliation ──────────────────────────
describe('reconcileOptimistic — strategy: external_id', () => {
  it('removes an optimistic msg whose external_id matches an incoming msg', () => {
    const opt = optMsg('o1', { external_id: 'ext-abc' });
    const canonical = msg('c1', { external_id: 'ext-abc' });
    const result = reconcileOptimistic([opt], [canonical]);
    expect(result.filteredPrev.map((m) => m.id)).not.toContain('optimistic:o1');
  });

  it('builds a remap entry from optimisticId → canonicalId', () => {
    const opt = optMsg('o1', { external_id: 'ext-abc' });
    const canonical = msg('c1', { external_id: 'ext-abc' });
    const result = reconcileOptimistic([opt], [canonical]);
    expect(result.remap.get('optimistic:o1')).toBe('c1');
  });

  it('adds the canonical with promoted status patch to additions', () => {
    const opt = optMsg('o1', {
      external_id: 'ext-abc',
      status: 'delivered',
      status_updated_at: null,
    });
    const canonical = msg('c1', {
      external_id: 'ext-abc',
      status: 'sent',
      status_updated_at: null,
    });
    const result = reconcileOptimistic([opt], [canonical]);
    const added = result.additions.find((m) => m.id === 'c1');
    // optimistic has higher rank (delivered > sent), so promoted status is delivered
    expect(added?.status).toBe('delivered');
  });

  it('inherits media_url from optimistic when canonical has none', () => {
    const opt = optMsg('o1', {
      external_id: 'ext-1',
      media_url: 'blob://local-media',
      message_type: 'image',
    });
    const canonical = msg('c1', {
      external_id: 'ext-1',
      media_url: null,
      message_type: 'image',
    });
    const result = reconcileOptimistic([opt], [canonical]);
    const added = result.additions.find((m) => m.id === 'c1');
    expect(added?.media_url).toBe('blob://local-media');
  });

  it('keeps canonical media_url when it already has one', () => {
    const opt = optMsg('o1', {
      external_id: 'ext-1',
      media_url: 'blob://old',
      message_type: 'image',
    });
    const canonical = msg('c1', {
      external_id: 'ext-1',
      media_url: 'https://real-cdn/image.jpg',
      message_type: 'image',
    });
    const result = reconcileOptimistic([opt], [canonical]);
    const added = result.additions.find((m) => m.id === 'c1');
    expect(added?.media_url).toBe('https://real-cdn/image.jpg');
  });

  it('calls recordMatch with strategy "external_id"', () => {
    const opt = optMsg('o1', { external_id: 'ext-x' });
    const canonical = msg('c1', { external_id: 'ext-x' });
    reconcileOptimistic([opt], [canonical]);
    expect(mockRecordMatch).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'external_id' })
    );
  });
});

// ── reconcileOptimistic — text fallback ───────────────────────────────────────
describe('reconcileOptimistic — strategy: text_fallback', () => {
  const BASE_TIME = 1_700_000_000_000;

  it('removes optimistic text msg that matches by sender+content within 2min', () => {
    const opt = optMsg('o1', {
      sender: 'me@s.whatsapp.net',
      content: 'oi',
      message_type: 'text',
      created_at: new Date(BASE_TIME).toISOString(),
    });
    const canonical = msg('c1', {
      sender: 'me@s.whatsapp.net',
      content: 'oi',
      message_type: 'text',
      created_at: new Date(BASE_TIME + 5_000).toISOString(), // 5s later
    });
    const result = reconcileOptimistic([opt], [canonical]);
    expect(result.filteredPrev.map((m) => m.id)).not.toContain('optimistic:o1');
    expect(result.remap.get('optimistic:o1')).toBe('c1');
  });

  it('keeps optimistic text msg when time delta exceeds 2min', () => {
    const opt = optMsg('o1', {
      sender: 'me@s.whatsapp.net',
      content: 'oi',
      message_type: 'text',
      created_at: new Date(BASE_TIME).toISOString(),
    });
    const canonical = msg('c1', {
      sender: 'me@s.whatsapp.net',
      content: 'oi',
      message_type: 'text',
      // 121 seconds later (exceeds 120s window)
      created_at: new Date(BASE_TIME + 121_000).toISOString(),
    });
    const result = reconcileOptimistic([opt], [canonical]);
    expect(result.filteredPrev.map((m) => m.id)).toContain('optimistic:o1');
  });

  it('keeps optimistic text msg when content differs', () => {
    const opt = optMsg('o1', { content: 'oi', sender: 's', message_type: 'text' });
    const canonical = msg('c1', { content: 'tchau', sender: 's', message_type: 'text' });
    const result = reconcileOptimistic([opt], [canonical]);
    expect(result.filteredPrev.map((m) => m.id)).toContain('optimistic:o1');
  });
});

// ── reconcileOptimistic — media fallback ──────────────────────────────────────
describe('reconcileOptimistic — strategy: media_fallback', () => {
  const BASE_TIME = 1_700_000_000_000;

  it('removes optimistic image msg that matches by sender+type within 2min', () => {
    const opt = optMsg('o1', {
      sender: 'me@s.whatsapp.net',
      message_type: 'image',
      content: '[Image]',
      created_at: new Date(BASE_TIME).toISOString(),
    });
    const canonical = msg('c1', {
      sender: 'me@s.whatsapp.net',
      message_type: 'image',
      content: '',
      created_at: new Date(BASE_TIME + 3_000).toISOString(),
    });
    const result = reconcileOptimistic([opt], [canonical]);
    expect(result.filteredPrev.map((m) => m.id)).not.toContain('optimistic:o1');
    expect(result.remap.get('optimistic:o1')).toBe('c1');
  });

  it('calls recordMatch with strategy "media_fallback"', () => {
    const opt = optMsg('o1', {
      sender: 'me',
      message_type: 'audio',
      created_at: new Date(BASE_TIME).toISOString(),
    });
    const canonical = msg('c1', {
      sender: 'me',
      message_type: 'audio',
      created_at: new Date(BASE_TIME + 1_000).toISOString(),
    });
    reconcileOptimistic([opt], [canonical]);
    expect(mockRecordMatch).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'media_fallback' })
    );
  });
});

// ── applyReconciliation ────────────────────────────────────────────────────────
describe('applyReconciliation', () => {
  it('calls setMessages updater synchronously', () => {
    const setMessages = vi.fn((updater: (prev: RealtimeMessage[]) => RealtimeMessage[]) => {
      updater([]);
    });
    applyReconciliation(setMessages, [], (fp, add) => [...fp, ...add]);
    expect(setMessages).toHaveBeenCalledTimes(1);
  });

  it('returns the remap size from reconciliation', () => {
    const opt = optMsg('o1', { external_id: 'ext-x' });
    const canonical = msg('c1', { external_id: 'ext-x' });
    const setMessages = vi.fn((updater: (prev: RealtimeMessage[]) => RealtimeMessage[]) => {
      updater([opt]);
    });
    const { remapSize } = applyReconciliation(
      setMessages,
      [canonical],
      (fp, add) => [...fp, ...add]
    );
    expect(remapSize).toBe(1);
  });

  it('calls playerStateStore.migrate for each remapped optimistic id', () => {
    const opt = optMsg('o1', { external_id: 'ext-x' });
    const canonical = msg('c1', { external_id: 'ext-x' });
    const setMessages = vi.fn((updater: (prev: RealtimeMessage[]) => RealtimeMessage[]) => {
      updater([opt]);
    });
    applyReconciliation(setMessages, [canonical], (fp, add) => [...fp, ...add]);
    expect(mockMigrate).toHaveBeenCalledWith('optimistic:o1', 'c1');
  });

  it('returns prev unchanged when nothing changed', () => {
    const prev = [msg('c1')];
    let capturedResult: RealtimeMessage[] | undefined;
    const setMessages = vi.fn((updater: (prev: RealtimeMessage[]) => RealtimeMessage[]) => {
      capturedResult = updater(prev);
    });
    applyReconciliation(setMessages, [msg('c1')], (fp, add) => [...fp, ...add]);
    // c1 is already in prev and incoming — no additions, no removals → returns prev ref
    expect(capturedResult).toBe(prev);
  });
});
