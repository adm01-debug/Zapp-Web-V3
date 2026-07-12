/**
 * Cross-tab request dedupe.
 *
 * Why: Two tabs of the same agent can race the same logical action — clicking
 * "Resend" twice across tabs, or one tab re-submitting from optimistic state
 * while another already fired. The Evolution proxy already has server-side
 * idempotency, but the round-trip + WhatsApp echo can still produce flicker
 * and double-counted retries. This util collapses the duplicate at the
 * **browser** level: only one tab actually invokes the function; the others
 * await the response via BroadcastChannel and replay it locally.
 *
 * Scope: opt-in. Caller passes a stable `key` (we reuse the same
 * `Idempotency-Key` used server-side: `msg:<row-id>`).
 *
 * Mechanism:
 *  1. Leader claim — atomic write to `localStorage` with timestamp.
 *     If another tab already claimed within the TTL window, we are a follower.
 *  2. Leader runs the work and broadcasts `{ key, ok, value/error }` on done.
 *  3. Follower subscribes to BroadcastChannel and awaits the message,
 *     timing out at `ttlMs` (falls back to running locally — better duplicate
 *     than stuck UI).
 *
 * Falls back to a no-op pass-through when BroadcastChannel/localStorage are
 * unavailable (SSR, private mode quirks).
 */

import { getLogger } from '@/lib/logger';
import { recordDedupeEvent } from '@/lib/dedupeMetrics';

const log = getLogger('CrossTabDedupe');

const CHANNEL_NAME = 'zappweb:send-dedupe:v1';
const STORAGE_PREFIX = 'zappweb:dedupe:';
const DEFAULT_TTL_MS = 60_000;
const FOLLOWER_WAIT_BUFFER_MS = 250; // small grace beyond TTL

interface ClaimRecord {
  tabId: string;
  at: number;
}

interface BroadcastDone {
  type: 'done';
  key: string;
  ok: boolean;
  /** Serialized JSON of the resolved value when ok=true. */
  value?: string;
  /** Serialized error message when ok=false. */
  error?: string;
  /** HTTP-ish status echoed for replay parity. */
  status?: number;
}

const TAB_ID =
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`);

let cachedChannel: BroadcastChannel | null | undefined;
function getChannel(): BroadcastChannel | null {
  if (cachedChannel !== undefined) return cachedChannel;
  try {
    cachedChannel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(CHANNEL_NAME)
      : null;
  } catch {
    cachedChannel = null;
  }
  return cachedChannel;
}

function getStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // touch to detect quota / disabled
    const probe = '__zw_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Try to atomically claim leadership for `key`. Returns true if this tab
 * is the leader. A claim from another tab within `ttlMs` keeps that tab
 * the leader.
 */
function claimLeadership(key: string, ttlMs: number, tabId: string = TAB_ID): boolean {
  const storage = getStorage();
  if (!storage) return true; // no coordination possible → behave as leader

  const storageKey = STORAGE_PREFIX + key;
  const now = Date.now();

  try {
    const raw = storage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as ClaimRecord;
      if (parsed && typeof parsed.at === 'number' && now - parsed.at < ttlMs) {
        // Active claim. If it's our own tab (re-entry), keep leadership.
        return parsed.tabId === tabId;
      }
    }
    const record: ClaimRecord = { tabId, at: now };
    storage.setItem(storageKey, JSON.stringify(record));

    // Re-read to detect a near-simultaneous write from another tab.
    // Whichever tab's value persisted wins.
    const verify = storage.getItem(storageKey);
    if (!verify) return true;
    const verifyParsed = JSON.parse(verify) as ClaimRecord;
    return verifyParsed.tabId === tabId;
  } catch (e) {
    log.warn('claimLeadership failed, defaulting to leader', e);
    return true;
  }
}

function releaseLeadership(key: string, tabId: string = TAB_ID) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const storageKey = STORAGE_PREFIX + key;
    const raw = storage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as ClaimRecord;
    if (parsed.tabId === tabId) storage.removeItem(storageKey);
  } catch {
    /* no-op */
  }
}

function broadcastDone(payload: BroadcastDone, channel?: BroadcastChannel | null) {
  const ch = channel ?? getChannel();
  if (!ch) return;
  try {
    ch.postMessage(payload);
  } catch (e) {
    log.warn('broadcast failed', e);
  }
}

function awaitBroadcast<T>(
  key: string,
  ttlMs: number,
  channel?: BroadcastChannel | null,
): Promise<{ value: T } | { error: Error }> {
  return new Promise((resolve) => {
    const ch = channel ?? getChannel();
    if (!ch) {
      resolve({ error: new Error('CROSS_TAB_NO_CHANNEL') });
      return;
    }
    const timer = setTimeout(() => {
      ch.removeEventListener('message', onMessage);
      resolve({ error: new Error('CROSS_TAB_TIMEOUT') });
    }, ttlMs + FOLLOWER_WAIT_BUFFER_MS);

    const onMessage = (ev: MessageEvent<BroadcastDone>) => {
      const m = ev.data;
      if (!m || m.type !== 'done' || m.key !== key) return;
      clearTimeout(timer);
      ch.removeEventListener('message', onMessage);
      if (m.ok) {
        try {
          const parsed = m.value ? (JSON.parse(m.value) as T) : (undefined as T);
          resolve({ value: parsed });
        } catch (e) {
          resolve({ error: e instanceof Error ? e : new Error('CROSS_TAB_PARSE_ERROR') });
        }
      } else {
        const err = new Error(m.error || 'CROSS_TAB_REMOTE_ERROR');
        if (typeof m.status === 'number') (err as Error & { status?: number }).status = m.status;
        resolve({ error: err });
      }
    };
    ch.addEventListener('message', onMessage);
  });
}

export interface CrossTabDedupeOptions {
  /** Lifetime of the leader claim. Followers wait at most this long. Default 60s. */
  ttlMs?: number;
  /**
   * If true, the follower replays the leader's response. If false, the
   * follower simply skips and resolves with `undefined as T` — caller must
   * tolerate that. Default true.
   */
  replayResponse?: boolean;
  /**
   * Test-only: override the per-tab identity and force a fresh
   * BroadcastChannel for this single call. Used by the multi-tab simulation
   * suite to model N independent browser tabs without re-evaluating the
   * module. NEVER set in production code.
   */
  __tabIdForTests?: string;
}

/**
 * Run `work()` at most once across all tabs sharing this origin for the same
 * `key` within `ttlMs`. Other tabs receive the leader's resolved value.
 *
 * If `work()` throws on the leader, the rejection is broadcast and rethrown
 * on followers as well, preserving caller-side error handling parity.
 */
export async function crossTabDedupe<T>(
  key: string,
  work: () => Promise<T>,
  options: CrossTabDedupeOptions = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const replay = options.replayResponse ?? true;
  const startedAt = Date.now();
  const tabId = options.__tabIdForTests ?? TAB_ID;
  // When tests inject a tab id, give them a dedicated BroadcastChannel
  // bound to the same name so each "tab" really is independent.
  const channel: BroadcastChannel | null = options.__tabIdForTests
    ? (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null)
    : getChannel();
  const closeTestChannel = () => {
    if (options.__tabIdForTests) {
      try { channel?.close(); } catch { /* no-op */ }
    }
  };

  const isLeader = claimLeadership(key, ttlMs, tabId);

  if (!isLeader) {
    log.info('follower → awaiting leader', { key });
    if (!replay) {
      recordDedupeEvent({ key, outcome: 'follower-replay', durationMs: Date.now() - startedAt, ok: true });
      closeTestChannel();
      return undefined as T; // ignore-audit: intentional undefined return as T — follower path with no replay; caller expects possible undefined
    }
    const outcome = await awaitBroadcast<T>(key, ttlMs, channel);
    if ('value' in outcome) {
      recordDedupeEvent({ key, outcome: 'follower-replay', durationMs: Date.now() - startedAt, ok: true });
      closeTestChannel();
      return outcome.value;
    }
    log.warn('follower fallback → running locally', { key, reason: outcome.error.message });
    try {
      const value = await work();
      recordDedupeEvent({ key, outcome: 'follower-fallback', durationMs: Date.now() - startedAt, ok: true });
      return value;
    } catch (e) {
      recordDedupeEvent({ key, outcome: 'follower-fallback', durationMs: Date.now() - startedAt, ok: false });
      throw e;
    } finally {
      closeTestChannel();
    }
  }

  log.info('leader → executing', { key });
  try {
    const value = await work();
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(value);
    } catch {
      serialized = undefined;
    }
    broadcastDone({ type: 'done', key, ok: true, value: serialized }, channel);
    recordDedupeEvent({ key, outcome: 'leader', durationMs: Date.now() - startedAt, ok: true });
    return value;
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const status = (e as { status?: number } | null)?.status;
    broadcastDone(
      { type: 'done', key, ok: false, error: err.message, status: typeof status === 'number' ? status : undefined },
      channel,
    );
    recordDedupeEvent({ key, outcome: 'leader', durationMs: Date.now() - startedAt, ok: false });
    throw e;
  } finally {
    setTimeout(() => releaseLeadership(key, tabId), ttlMs);
    // Defer test-channel close so any in-flight broadcast can be delivered first.
    if (options.__tabIdForTests) setTimeout(closeTestChannel, 50);
  }
}

/** Test/cleanup helper. */
export function __resetCrossTabDedupeForTests() {
  cachedChannel = undefined;
}
