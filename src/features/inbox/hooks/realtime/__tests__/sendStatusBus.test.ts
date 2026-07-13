/**
 * Tests for sendStatusBus.ts — an in-memory pub/sub singleton for transient
 * send statuses with a bounded history ring buffer.
 *
 * Module state is isolated in every test via __resetSendStatusForTest() in
 * beforeEach.  No network, React, or Supabase dependencies.
 *
 * Functions under test:
 *   emitSendStatus(messageId, detail, context?)
 *   getSendStatus(messageId)
 *   getSendStatusHistory(messageId)
 *   getAllSendStatusHistory()
 *   subscribeSendStatusHistory(cb)
 *   clearSendStatusHistory()
 *   subscribeSendStatus(messageId, cb)
 *   subscribeAllSendStatus(cb)
 *   clearSendStatus(messageId)
 *   __resetSendStatusForTest()
 *
 * Covered:
 *   emitSendStatus
 *     - stores detail and makes it retrievable via getSendStatus
 *     - overwrites a previous status for the same messageId
 *     - fires per-message listeners
 *     - fires global listeners
 *     - fires history listeners with the history entry
 *     - does not throw when a listener throws
 *     - adds updatedAt field (number)
 *     - passes context fields into the history entry
 *   getSendStatus
 *     - returns undefined for an unknown messageId
 *     - returns the most-recently emitted detail
 *   getSendStatusHistory
 *     - returns [] for an unknown messageId
 *     - returns a copy (mutation does not affect internal state)
 *     - accumulates entries in order
 *     - deltaMs is null for the first entry
 *     - deltaMs is the ms difference for subsequent entries
 *   getAllSendStatusHistory
 *     - returns empty object when nothing emitted
 *     - returns all tracked messages
 *     - copies are returned (mutation does not affect internal state)
 *   subscribeSendStatus
 *     - listener fires on emit for the subscribed messageId
 *     - listener does not fire for a different messageId
 *     - unsubscribe stops future calls
 *     - listener map is cleaned up when the last listener unsubscribes
 *   subscribeAllSendStatus
 *     - fires for every messageId
 *     - unsubscribe stops future calls
 *   subscribeSendStatusHistory
 *     - fires for every emitted entry
 *     - unsubscribe stops future calls
 *   clearSendStatus
 *     - removes the status from the store
 *     - clears per-message listeners so they no longer fire
 *   clearSendStatusHistory
 *     - clears all history buckets
 *     - does not affect the live store
 *   __resetSendStatusForTest
 *     - clears store, listeners, global listeners, history, and historyListeners
 *   ring buffer — per-message limit
 *     - retains at most 50 entries, dropping the oldest
 *   ring buffer — total-messages cap (soft eviction)
 *     - when more than 2000 messages are tracked the oldest is evicted from history
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  emitSendStatus,
  getSendStatus,
  getSendStatusHistory,
  getAllSendStatusHistory,
  subscribeSendStatusHistory,
  clearSendStatusHistory,
  subscribeSendStatus,
  subscribeAllSendStatus,
  clearSendStatus,
  __resetSendStatusForTest,
} from '../sendStatusBus';

beforeEach(() => {
  __resetSendStatusForTest();
});

// ── emitSendStatus / getSendStatus ─────────────────────────────────────────

describe('emitSendStatus + getSendStatus — store behaviour', () => {
  it('stores the emitted detail and returns it via getSendStatus', () => {
    emitSendStatus('m1', { status: 'sending' });
    const result = getSendStatus('m1');
    expect(result).toBeDefined();
    expect(result?.status).toBe('sending');
  });

  it('adds an updatedAt timestamp (number)', () => {
    const before = Date.now();
    emitSendStatus('m1', { status: 'sending' });
    const after = Date.now();
    const result = getSendStatus('m1');
    expect(typeof result?.updatedAt).toBe('number');
    expect(result!.updatedAt).toBeGreaterThanOrEqual(before);
    expect(result!.updatedAt).toBeLessThanOrEqual(after);
  });

  it('overwrites the previous status for the same messageId', () => {
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m1', { status: 'sent' });
    expect(getSendStatus('m1')?.status).toBe('sent');
  });

  it('stores statuses independently for different messageIds', () => {
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m2', { status: 'failed' });
    expect(getSendStatus('m1')?.status).toBe('sending');
    expect(getSendStatus('m2')?.status).toBe('failed');
  });

  it('passes optional detail fields through', () => {
    emitSendStatus('m1', { status: 'retrying', attempt: 2, totalRetries: 3, errorCode: 503, errorReason: 'timeout' });
    const r = getSendStatus('m1')!;
    expect(r.attempt).toBe(2);
    expect(r.totalRetries).toBe(3);
    expect(r.errorCode).toBe(503);
    expect(r.errorReason).toBe('timeout');
  });
});

describe('getSendStatus — unknown key', () => {
  it('returns undefined for a messageId that was never emitted', () => {
    expect(getSendStatus('no-such-id')).toBeUndefined();
  });
});

// ── per-message listener ───────────────────────────────────────────────────

describe('subscribeSendStatus — per-message listener', () => {
  it('fires the listener when the subscribed message is emitted', () => {
    const cb = vi.fn();
    subscribeSendStatus('m1', cb);
    emitSendStatus('m1', { status: 'sending' });
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].status).toBe('sending');
  });

  it('does NOT fire for a different messageId', () => {
    const cb = vi.fn();
    subscribeSendStatus('m1', cb);
    emitSendStatus('m2', { status: 'sending' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('fires multiple times when emit is called multiple times', () => {
    const cb = vi.fn();
    subscribeSendStatus('m1', cb);
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m1', { status: 'sent' });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops future calls', () => {
    const cb = vi.fn();
    const unsub = subscribeSendStatus('m1', cb);
    emitSendStatus('m1', { status: 'sending' });
    unsub();
    emitSendStatus('m1', { status: 'sent' });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not throw when a listener throws', () => {
    subscribeSendStatus('m1', () => { throw new Error('boom'); });
    expect(() => emitSendStatus('m1', { status: 'sending' })).not.toThrow();
  });

  it('multiple listeners on the same message all fire', () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeSendStatus('m1', a);
    subscribeSendStatus('m1', b);
    emitSendStatus('m1', { status: 'sending' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });
});

// ── global listener ────────────────────────────────────────────────────────

describe('subscribeAllSendStatus — global listener', () => {
  it('fires for every emitted messageId', () => {
    const cb = vi.fn();
    subscribeAllSendStatus(cb);
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m2', { status: 'failed' });
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[0][0]).toBe('m1');
    expect(cb.mock.calls[1][0]).toBe('m2');
  });

  it('passes the full detail to the global listener', () => {
    const cb = vi.fn();
    subscribeAllSendStatus(cb);
    emitSendStatus('m1', { status: 'retrying', attempt: 1 });
    expect(cb.mock.calls[0][1].status).toBe('retrying');
    expect(cb.mock.calls[0][1].attempt).toBe(1);
  });

  it('unsubscribe stops future calls', () => {
    const cb = vi.fn();
    const unsub = subscribeAllSendStatus(cb);
    emitSendStatus('m1', { status: 'sending' });
    unsub();
    emitSendStatus('m2', { status: 'sending' });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not throw when a global listener throws', () => {
    subscribeAllSendStatus(() => { throw new Error('oops'); });
    expect(() => emitSendStatus('m1', { status: 'sending' })).not.toThrow();
  });
});

// ── history ────────────────────────────────────────────────────────────────

describe('getSendStatusHistory — history accumulation', () => {
  it('returns [] for an unknown messageId', () => {
    expect(getSendStatusHistory('no-such-id')).toEqual([]);
  });

  it('accumulates entries in emission order', () => {
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m1', { status: 'sent' });
    const h = getSendStatusHistory('m1');
    expect(h).toHaveLength(2);
    expect(h[0].status).toBe('sending');
    expect(h[1].status).toBe('sent');
  });

  it('first entry has deltaMs null', () => {
    emitSendStatus('m1', { status: 'sending' });
    expect(getSendStatusHistory('m1')[0].deltaMs).toBeNull();
  });

  it('second entry has deltaMs as a non-negative number', () => {
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m1', { status: 'sent' });
    const delta = getSendStatusHistory('m1')[1].deltaMs;
    expect(typeof delta).toBe('number');
    expect(delta!).toBeGreaterThanOrEqual(0);
  });

  it('returns a copy — mutating it does not affect internal state', () => {
    emitSendStatus('m1', { status: 'sending' });
    const copy = getSendStatusHistory('m1');
    copy.push({ status: 'sent', updatedAt: 0, deltaMs: null });
    expect(getSendStatusHistory('m1')).toHaveLength(1);
  });

  it('context fields are stored in the history entry', () => {
    emitSendStatus('m1', { status: 'sending' }, { contactId: 'c42', source: 'manual-resend' });
    const entry = getSendStatusHistory('m1')[0];
    expect(entry.contactId).toBe('c42');
    expect(entry.source).toBe('manual-resend');
  });

  it('contactId and source default to null when context is omitted', () => {
    emitSendStatus('m1', { status: 'sending' });
    const entry = getSendStatusHistory('m1')[0];
    expect(entry.contactId).toBeNull();
    expect(entry.source).toBeNull();
  });
});

describe('getAllSendStatusHistory', () => {
  it('returns an empty object when nothing has been emitted', () => {
    expect(getAllSendStatusHistory()).toEqual({});
  });

  it('returns entries for all tracked messages', () => {
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m2', { status: 'failed' });
    const all = getAllSendStatusHistory();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all['m1'][0].status).toBe('sending');
    expect(all['m2'][0].status).toBe('failed');
  });

  it('returned arrays are copies — mutation does not affect internal state', () => {
    emitSendStatus('m1', { status: 'sending' });
    const all = getAllSendStatusHistory();
    all['m1'].push({ status: 'sent', updatedAt: 0, deltaMs: null });
    expect(getSendStatusHistory('m1')).toHaveLength(1);
  });
});

// ── history listener ───────────────────────────────────────────────────────

describe('subscribeSendStatusHistory — history listener', () => {
  it('fires whenever an entry is appended', () => {
    const cb = vi.fn();
    subscribeSendStatusHistory(cb);
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m2', { status: 'failed' });
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('receives the correct messageId and entry', () => {
    const cb = vi.fn();
    subscribeSendStatusHistory(cb);
    emitSendStatus('m1', { status: 'sent' });
    expect(cb.mock.calls[0][0]).toBe('m1');
    expect(cb.mock.calls[0][1].status).toBe('sent');
  });

  it('unsubscribe stops future calls', () => {
    const cb = vi.fn();
    const unsub = subscribeSendStatusHistory(cb);
    emitSendStatus('m1', { status: 'sending' });
    unsub();
    emitSendStatus('m1', { status: 'sent' });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('does not throw when a history listener throws', () => {
    subscribeSendStatusHistory(() => { throw new Error('oops'); });
    expect(() => emitSendStatus('m1', { status: 'sending' })).not.toThrow();
  });
});

// ── clearSendStatusHistory ─────────────────────────────────────────────────

describe('clearSendStatusHistory', () => {
  it('clears all history buckets', () => {
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m2', { status: 'failed' });
    clearSendStatusHistory();
    expect(getSendStatusHistory('m1')).toEqual([]);
    expect(getAllSendStatusHistory()).toEqual({});
  });

  it('does not affect the live store', () => {
    emitSendStatus('m1', { status: 'sending' });
    clearSendStatusHistory();
    expect(getSendStatus('m1')?.status).toBe('sending');
  });
});

// ── clearSendStatus ────────────────────────────────────────────────────────

describe('clearSendStatus', () => {
  it('removes the status from the store', () => {
    emitSendStatus('m1', { status: 'sending' });
    clearSendStatus('m1');
    expect(getSendStatus('m1')).toBeUndefined();
  });

  it('listeners no longer fire after clearSendStatus', () => {
    const cb = vi.fn();
    subscribeSendStatus('m1', cb);
    clearSendStatus('m1');
    emitSendStatus('m1', { status: 'sending' });
    // listener was cleared, but new emit re-adds to store
    // the cb should NOT have been called during the cleared period
    // After clear the listener set is gone so cb fires 0 times for the "old" sub
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not affect other messageIds in the store', () => {
    emitSendStatus('m1', { status: 'sending' });
    emitSendStatus('m2', { status: 'sent' });
    clearSendStatus('m1');
    expect(getSendStatus('m2')?.status).toBe('sent');
  });
});

// ── ring buffer per-message limit ──────────────────────────────────────────

describe('ring buffer — per-message limit (50 entries)', () => {
  it('retains at most 50 entries, dropping the oldest when exceeded', () => {
    for (let i = 0; i < 60; i++) {
      emitSendStatus('m1', { status: 'sending', attempt: i });
    }
    const h = getSendStatusHistory('m1');
    expect(h).toHaveLength(50);
    // oldest (attempt 0-9) should have been dropped; last should be attempt 59
    expect(h[h.length - 1].attempt).toBe(59);
    // first retained should be attempt 10
    expect(h[0].attempt).toBe(10);
  });

  it('exactly 50 entries are kept without truncation', () => {
    for (let i = 0; i < 50; i++) {
      emitSendStatus('m1', { status: 'sending', attempt: i });
    }
    expect(getSendStatusHistory('m1')).toHaveLength(50);
  });
});

// ── ring buffer total-messages cap ─────────────────────────────────────────

describe('ring buffer — total-messages cap (2000 messages)', () => {
  it('evicts the oldest message history when more than 2000 distinct messages are tracked', () => {
    // emit for 2001 distinct message IDs
    for (let i = 0; i < 2001; i++) {
      emitSendStatus(`msg-${i}`, { status: 'sending' });
    }
    const all = getAllSendStatusHistory();
    // msg-0 should have been evicted
    expect(all['msg-0']).toBeUndefined();
    // msg-2000 (the newest) should be present
    expect(all['msg-2000']).toBeDefined();
  });

  it('exactly 2000 distinct messages are retained without eviction', () => {
    for (let i = 0; i < 2000; i++) {
      emitSendStatus(`msg-${i}`, { status: 'sending' });
    }
    expect(Object.keys(getAllSendStatusHistory())).toHaveLength(2000);
  });
});

// ── __resetSendStatusForTest ───────────────────────────────────────────────

describe('__resetSendStatusForTest', () => {
  it('clears the store', () => {
    emitSendStatus('m1', { status: 'sending' });
    __resetSendStatusForTest();
    expect(getSendStatus('m1')).toBeUndefined();
  });

  it('clears history', () => {
    emitSendStatus('m1', { status: 'sending' });
    __resetSendStatusForTest();
    expect(getSendStatusHistory('m1')).toEqual([]);
  });

  it('clears per-message listeners', () => {
    const cb = vi.fn();
    subscribeSendStatus('m1', cb);
    __resetSendStatusForTest();
    emitSendStatus('m1', { status: 'sending' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('clears global listeners', () => {
    const cb = vi.fn();
    subscribeAllSendStatus(cb);
    __resetSendStatusForTest();
    emitSendStatus('m1', { status: 'sending' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('clears history listeners', () => {
    const cb = vi.fn();
    subscribeSendStatusHistory(cb);
    __resetSendStatusForTest();
    emitSendStatus('m1', { status: 'sending' });
    expect(cb).not.toHaveBeenCalled();
  });
});
