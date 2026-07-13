import { describe, it, expect } from 'vitest';
import {
  BATCH_SIZE,
  isNearTop,
  isAtBottom,
  deduplicateMessages,
} from '../chatOptimizations';

// ── BATCH_SIZE ────────────────────────────────────────────────────────────────

describe('BATCH_SIZE', () => {
  it('is a positive number', () => {
    expect(typeof BATCH_SIZE).toBe('number');
    expect(BATCH_SIZE).toBeGreaterThan(0);
  });

  it('equals 50', () => {
    expect(BATCH_SIZE).toBe(50);
  });
});

// ── isNearTop ─────────────────────────────────────────────────────────────────

describe('isNearTop — default threshold (100)', () => {
  it('returns true when scrollTop is 0', () => {
    expect(isNearTop(0)).toBe(true);
  });

  it('returns true when scrollTop equals the threshold (100)', () => {
    expect(isNearTop(100)).toBe(true);
  });

  it('returns true when scrollTop is below threshold (50)', () => {
    expect(isNearTop(50)).toBe(true);
  });

  it('returns false when scrollTop is above threshold (101)', () => {
    expect(isNearTop(101)).toBe(false);
  });

  it('returns false when scrollTop is 500', () => {
    expect(isNearTop(500)).toBe(false);
  });
});

describe('isNearTop — custom threshold', () => {
  it('returns true when scrollTop equals custom threshold (200)', () => {
    expect(isNearTop(200, 200)).toBe(true);
  });

  it('returns true when scrollTop is below custom threshold (199)', () => {
    expect(isNearTop(199, 200)).toBe(true);
  });

  it('returns false when scrollTop exceeds custom threshold (201)', () => {
    expect(isNearTop(201, 200)).toBe(false);
  });

  it('works with threshold 0: only scrollTop=0 returns true', () => {
    expect(isNearTop(0, 0)).toBe(true);
    expect(isNearTop(1, 0)).toBe(false);
  });
});

// ── isAtBottom ────────────────────────────────────────────────────────────────

describe('isAtBottom — default threshold (100)', () => {
  it('returns true when scrollTop is at the very bottom', () => {
    // scrollHeight - scrollTop === clientHeight exactly
    expect(isAtBottom(1000, 900, 100)).toBe(true);
  });

  it('returns true when within default threshold (scrollHeight - scrollTop = clientHeight + 99)', () => {
    // 1000 - 801 = 199 ≤ 100 + 100 = 200
    expect(isAtBottom(1000, 801, 100)).toBe(true);
  });

  it('returns true when distance to bottom equals threshold (scrollHeight - scrollTop = clientHeight + 100)', () => {
    // 1000 - 800 = 200 ≤ 100 + 100 = 200
    expect(isAtBottom(1000, 800, 100)).toBe(true);
  });

  it('returns false when scrolled above threshold', () => {
    // 1000 - 799 = 201 > 100 + 100 = 200
    expect(isAtBottom(1000, 799, 100)).toBe(false);
  });

  it('returns false when far from the bottom', () => {
    expect(isAtBottom(1000, 0, 100)).toBe(false);
  });
});

describe('isAtBottom — custom threshold', () => {
  it('returns true with custom threshold 0 only at exact bottom', () => {
    expect(isAtBottom(1000, 900, 100, 0)).toBe(true);
    expect(isAtBottom(1000, 899, 100, 0)).toBe(false);
  });

  it('returns true with large custom threshold', () => {
    // If threshold = 500: scrollHeight - scrollTop ≤ clientHeight + 500
    // 1000 - 0 = 1000 ≤ 100 + 500 = 600? No. 1000 > 600, returns false.
    expect(isAtBottom(1000, 0, 100, 500)).toBe(false);
    // 1000 - 500 = 500 ≤ 100 + 500 = 600: true
    expect(isAtBottom(1000, 500, 100, 500)).toBe(true);
  });
});

// ── deduplicateMessages ───────────────────────────────────────────────────────

describe('deduplicateMessages — empty inputs', () => {
  it('returns empty array when both inputs are empty', () => {
    expect(deduplicateMessages([], [])).toEqual([]);
  });

  it('returns all incoming when existing is empty', () => {
    const incoming = [
      { id: '1', message_id: 'msg_1' },
      { id: '2', message_id: 'msg_2' },
    ];
    expect(deduplicateMessages([], incoming)).toEqual(incoming);
  });

  it('returns empty array when incoming is empty', () => {
    const existing = [{ id: '1', message_id: 'msg_1' }];
    expect(deduplicateMessages(existing, [])).toEqual([]);
  });
});

describe('deduplicateMessages — dedup by message_id', () => {
  it('filters out incoming messages whose message_id is already in existing', () => {
    const existing = [{ id: 'a', message_id: 'msg_1' }];
    const incoming = [
      { id: 'b', message_id: 'msg_1' },  // duplicate message_id
      { id: 'c', message_id: 'msg_2' },  // new
    ];
    const result = deduplicateMessages(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].message_id).toBe('msg_2');
  });

  it('keeps all incoming messages when there are no duplicates', () => {
    const existing = [{ id: 'a', message_id: 'msg_1' }];
    const incoming = [
      { id: 'b', message_id: 'msg_2' },
      { id: 'c', message_id: 'msg_3' },
    ];
    const result = deduplicateMessages(existing, incoming);
    expect(result).toHaveLength(2);
  });
});

describe('deduplicateMessages — dedup by id (no message_id)', () => {
  it('filters out incoming messages whose id matches existing id when no message_id', () => {
    const existing = [{ id: 'id-1' }];
    const incoming = [
      { id: 'id-1' },   // duplicate id
      { id: 'id-2' },   // new
    ];
    const result = deduplicateMessages(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('id-2');
  });
});

describe('deduplicateMessages — cross-field dedup', () => {
  it('filters duplicate when existing has message_id and incoming has matching id', () => {
    // Existing: message_id='abc'; incoming: id='abc' (no message_id)
    const existing = [{ id: 'x', message_id: 'abc' }];
    const incoming = [{ id: 'abc' }];  // id matches existing.message_id
    const result = deduplicateMessages(existing, incoming);
    expect(result).toHaveLength(0);
  });

  it('filters duplicate when existing has id and incoming has matching message_id', () => {
    // Existing: id='abc' (no message_id); incoming: message_id='abc'
    const existing = [{ id: 'abc' }];
    const incoming = [{ id: 'new', message_id: 'abc' }];
    const result = deduplicateMessages(existing, incoming);
    expect(result).toHaveLength(0);
  });
});

describe('deduplicateMessages — preserves order and all fields', () => {
  it('preserves order of non-duplicate incoming messages', () => {
    const existing = [{ id: 'a' }];
    const incoming = [
      { id: 'c', extra: 'third' },
      { id: 'b', extra: 'second' },
    ] as Array<{ id: string; extra: string }>;
    const result = deduplicateMessages(existing, incoming);
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('b');
  });

  it('preserves all fields of non-duplicate messages', () => {
    const existing: Array<{ id: string }> = [];
    const incoming = [{ id: '1', message_id: 'msg_1', content: 'hello' }];
    const result = deduplicateMessages(existing, incoming);
    expect(result[0]).toEqual({ id: '1', message_id: 'msg_1', content: 'hello' });
  });
});

describe('deduplicateMessages — message_id takes priority over id', () => {
  it('uses message_id to build existingIds when present in existing', () => {
    // existing message has id='a' and message_id='msg_1'.
    // existingIds = {'msg_1'} (uses message_id, not 'a')
    const existing = [{ id: 'a', message_id: 'msg_1' }];
    const incoming = [
      { id: 'a', message_id: 'msg_2' },  // id matches 'a' but message_id is different
    ];
    // existingIds built from existing.message_id = 'msg_1'.
    // incoming[0].message_id = 'msg_2' → not in existingIds → passes filter
    const result = deduplicateMessages(existing, incoming);
    expect(result).toHaveLength(1);
  });
});
