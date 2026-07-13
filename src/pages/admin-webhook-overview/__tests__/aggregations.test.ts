import { describe, it, expect } from 'vitest';
import {
  aggregateByType,
  aggregateByTypeAndInstance,
  aggregateHourly,
  categoryColor,
  categoryFill,
  type WebhookEventLite,
} from '../aggregations';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<WebhookEventLite> = {}): WebhookEventLite {
  return {
    event_type: 'MESSAGES_UPSERT',
    instance_name: 'inst-1',
    processed: true,
    error_message: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── aggregateByType ───────────────────────────────────────────────────────────

describe('aggregateByType — empty', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateByType([])).toEqual([]);
  });
});

describe('aggregateByType — single event', () => {
  it('returns one aggregate for a single processed event', () => {
    const row = makeRow({ event_type: 'MESSAGES_UPSERT', processed: true, error_message: null });
    const result = aggregateByType([row]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('MESSAGES_UPSERT');
    expect(result[0].total).toBe(1);
    expect(result[0].processed).toBe(1);
    expect(result[0].errored).toBe(0);
  });

  it('counts errored when error_message is non-null', () => {
    const row = makeRow({ processed: true, error_message: 'timeout' });
    const result = aggregateByType([row]);
    expect(result[0].errored).toBe(1);
    expect(result[0].processed).toBe(0);
  });

  it('sets lastAt from the single row created_at', () => {
    const ts = '2024-06-01T12:00:00Z';
    const row = makeRow({ created_at: ts });
    const result = aggregateByType([row]);
    expect(result[0].lastAt).toBe(ts);
  });
});

describe('aggregateByType — multiple events same type', () => {
  it('merges rows of the same event_type', () => {
    const rows = [
      makeRow({ event_type: 'CALL', processed: true, error_message: null }),
      makeRow({ event_type: 'CALL', processed: false, error_message: 'err' }),
      makeRow({ event_type: 'CALL', processed: true, error_message: null }),
    ];
    const result = aggregateByType(rows);
    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(3);
    expect(result[0].processed).toBe(2);
    expect(result[0].errored).toBe(1);
  });

  it('lastAt is the most recent created_at across rows', () => {
    const rows = [
      makeRow({ created_at: '2024-01-01T10:00:00Z' }),
      makeRow({ created_at: '2024-01-01T12:00:00Z' }),
      makeRow({ created_at: '2024-01-01T11:00:00Z' }),
    ];
    const result = aggregateByType(rows);
    expect(result[0].lastAt).toBe('2024-01-01T12:00:00Z');
  });
});

describe('aggregateByType — multiple event types', () => {
  it('produces one aggregate per distinct event_type', () => {
    const rows = [
      makeRow({ event_type: 'MESSAGES_UPSERT' }),
      makeRow({ event_type: 'CONNECTION_UPDATE' }),
      makeRow({ event_type: 'MESSAGES_UPSERT' }),
    ];
    const result = aggregateByType(rows);
    expect(result).toHaveLength(2);
  });

  it('sorts by total descending', () => {
    const rows = [
      makeRow({ event_type: 'CONNECTION_UPDATE' }),
      makeRow({ event_type: 'MESSAGES_UPSERT' }),
      makeRow({ event_type: 'MESSAGES_UPSERT' }),
      makeRow({ event_type: 'MESSAGES_UPSERT' }),
    ];
    const result = aggregateByType(rows);
    expect(result[0].type).toBe('MESSAGES_UPSERT');
    expect(result[0].total).toBe(3);
    expect(result[1].type).toBe('CONNECTION_UPDATE');
    expect(result[1].total).toBe(1);
  });

  it('counts only error_message=null+processed=true as processed', () => {
    const rows = [
      makeRow({ event_type: 'CALL', processed: true, error_message: null }),
      makeRow({ event_type: 'CALL', processed: false, error_message: null }),
      makeRow({ event_type: 'CALL', processed: true, error_message: 'err' }),
    ];
    const result = aggregateByType(rows);
    expect(result[0].processed).toBe(1);
    expect(result[0].errored).toBe(1);
    expect(result[0].total).toBe(3);
  });
});

// ── aggregateByTypeAndInstance ────────────────────────────────────────────────

describe('aggregateByTypeAndInstance — empty', () => {
  it('returns empty types, instances, and matrix for empty input', () => {
    const result = aggregateByTypeAndInstance([]);
    expect(result.types).toEqual([]);
    expect(result.instances).toEqual([]);
    expect(result.matrix).toEqual({});
  });
});

describe('aggregateByTypeAndInstance — single row', () => {
  it('puts the event in the correct matrix cell', () => {
    const row = makeRow({ event_type: 'MESSAGES_UPSERT', instance_name: 'inst-1' });
    const result = aggregateByTypeAndInstance([row]);
    expect(result.matrix['MESSAGES_UPSERT']['inst-1']).toBe(1);
  });

  it('contains the one type and one instance', () => {
    const row = makeRow({ event_type: 'MESSAGES_UPSERT', instance_name: 'inst-1' });
    const result = aggregateByTypeAndInstance([row]);
    expect(result.types).toContain('MESSAGES_UPSERT');
    expect(result.instances).toContain('inst-1');
  });
});

describe('aggregateByTypeAndInstance — accumulates counts', () => {
  it('increments the matrix cell for repeated type+instance', () => {
    const rows = [
      makeRow({ event_type: 'CALL', instance_name: 'inst-1' }),
      makeRow({ event_type: 'CALL', instance_name: 'inst-1' }),
      makeRow({ event_type: 'CALL', instance_name: 'inst-2' }),
    ];
    const result = aggregateByTypeAndInstance(rows);
    expect(result.matrix['CALL']['inst-1']).toBe(2);
    expect(result.matrix['CALL']['inst-2']).toBe(1);
  });
});

describe('aggregateByTypeAndInstance — sorting', () => {
  it('sorts types by total count descending', () => {
    const rows = [
      makeRow({ event_type: 'CALL', instance_name: 'inst-1' }),
      makeRow({ event_type: 'MESSAGES_UPSERT', instance_name: 'inst-1' }),
      makeRow({ event_type: 'MESSAGES_UPSERT', instance_name: 'inst-2' }),
      makeRow({ event_type: 'MESSAGES_UPSERT', instance_name: 'inst-1' }),
    ];
    const result = aggregateByTypeAndInstance(rows);
    expect(result.types[0]).toBe('MESSAGES_UPSERT');
    expect(result.types[1]).toBe('CALL');
  });

  it('sorts instances alphabetically', () => {
    const rows = [
      makeRow({ instance_name: 'zap-c' }),
      makeRow({ instance_name: 'zap-a' }),
      makeRow({ instance_name: 'zap-b' }),
    ];
    const result = aggregateByTypeAndInstance(rows);
    expect(result.instances).toEqual(['zap-a', 'zap-b', 'zap-c']);
  });
});

describe('aggregateByTypeAndInstance — multiple types and instances', () => {
  it('builds the matrix with separate cells for different type/instance combos', () => {
    const rows = [
      makeRow({ event_type: 'MESSAGES_UPSERT', instance_name: 'alpha' }),
      makeRow({ event_type: 'CALL', instance_name: 'beta' }),
    ];
    const result = aggregateByTypeAndInstance(rows);
    expect(result.matrix['MESSAGES_UPSERT']['alpha']).toBe(1);
    expect(result.matrix['CALL']['beta']).toBe(1);
    expect(result.matrix['MESSAGES_UPSERT']['beta']).toBeUndefined();
  });

  it('returns correct unique type and instance counts', () => {
    const rows = [
      makeRow({ event_type: 'A', instance_name: 'x' }),
      makeRow({ event_type: 'A', instance_name: 'y' }),
      makeRow({ event_type: 'B', instance_name: 'x' }),
    ];
    const result = aggregateByTypeAndInstance(rows);
    expect(result.types).toHaveLength(2);
    expect(result.instances).toHaveLength(2);
  });
});

// ── aggregateHourly ───────────────────────────────────────────────────────────

describe('aggregateHourly — structure', () => {
  it('returns an array', () => {
    expect(Array.isArray(aggregateHourly([], 24))).toBe(true);
  });

  it('buckets are sorted ascending by bucketTs', () => {
    const buckets = aggregateHourly([], 24);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].bucketTs).toBeGreaterThan(buckets[i - 1].bucketTs);
    }
  });

  it('every bucket has a non-empty label string', () => {
    const buckets = aggregateHourly([], 24);
    buckets.forEach((b) => {
      expect(typeof b.bucket).toBe('string');
      expect(b.bucket.length).toBeGreaterThan(0);
    });
  });

  it('every bucket starts with processed=0 and errored=0 when no rows', () => {
    const buckets = aggregateHourly([], 24);
    buckets.forEach((b) => {
      expect(b.processed).toBe(0);
      expect(b.errored).toBe(0);
    });
  });
});

describe('aggregateHourly — bucket sizing', () => {
  it('uses 1h buckets for a 24h window (at least 24 buckets)', () => {
    const buckets = aggregateHourly([], 24);
    expect(buckets.length).toBeGreaterThanOrEqual(24);
  });

  it('uses 6h buckets for a 48h window (fewer than 24 buckets)', () => {
    const bucketsHourly = aggregateHourly([], 24);
    const bucketsWide = aggregateHourly([], 48);
    expect(bucketsWide.length).toBeLessThan(bucketsHourly.length);
  });

  it('consecutive bucketTs differ by 1h for a 24h window', () => {
    const ONE_HOUR = 60 * 60 * 1000;
    const buckets = aggregateHourly([], 24);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].bucketTs - buckets[i - 1].bucketTs).toBe(ONE_HOUR);
    }
  });

  it('consecutive bucketTs differ by 6h for a 48h window', () => {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const buckets = aggregateHourly([], 48);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].bucketTs - buckets[i - 1].bucketTs).toBe(SIX_HOURS);
    }
  });
});

describe('aggregateHourly — row classification', () => {
  it('counts a processed row in the last bucket (row timestamped now)', () => {
    const row = makeRow({ processed: true, error_message: null, created_at: new Date().toISOString() });
    const buckets = aggregateHourly([row], 24);
    const last = buckets[buckets.length - 1];
    expect(last.processed).toBe(1);
    expect(last.errored).toBe(0);
  });

  it('counts an errored row in the last bucket (row timestamped now)', () => {
    const row = makeRow({ processed: false, error_message: 'fail', created_at: new Date().toISOString() });
    const buckets = aggregateHourly([row], 24);
    const last = buckets[buckets.length - 1];
    expect(last.errored).toBe(1);
    expect(last.processed).toBe(0);
  });

  it('ignores a row with an invalid created_at date', () => {
    const row = makeRow({ created_at: 'not-a-date' });
    const buckets = aggregateHourly([row], 24);
    const total = buckets.reduce((s, b) => s + b.processed + b.errored, 0);
    expect(total).toBe(0);
  });

  it('ignores a row outside the time window (very old row)', () => {
    const row = makeRow({ created_at: '2000-01-01T00:00:00Z' });
    const buckets = aggregateHourly([row], 24);
    const total = buckets.reduce((s, b) => s + b.processed + b.errored, 0);
    expect(total).toBe(0);
  });

  it('sums multiple rows into the same bucket', () => {
    const now = new Date().toISOString();
    const rows = [
      makeRow({ processed: true, error_message: null, created_at: now }),
      makeRow({ processed: true, error_message: null, created_at: now }),
      makeRow({ processed: false, error_message: 'err', created_at: now }),
    ];
    const buckets = aggregateHourly(rows, 24);
    const last = buckets[buckets.length - 1];
    expect(last.processed).toBe(2);
    expect(last.errored).toBe(1);
  });
});

// ── categoryColor ─────────────────────────────────────────────────────────────

describe('categoryColor', () => {
  it('"MESSAGES_UPSERT" → "text-primary"', () => {
    expect(categoryColor('MESSAGES_UPSERT')).toBe('text-primary');
  });

  it('"messages_upsert" (lowercase) → "text-primary"', () => {
    expect(categoryColor('messages_upsert')).toBe('text-primary');
  });

  it('"MESSAGES_UPDATE" → "text-primary"', () => {
    expect(categoryColor('MESSAGES_UPDATE')).toBe('text-primary');
  });

  it('"CONNECTION_UPDATE" → "text-warning"', () => {
    expect(categoryColor('CONNECTION_UPDATE')).toBe('text-warning');
  });

  it('"QRCODE_UPDATED" → "text-warning"', () => {
    expect(categoryColor('QRCODE_UPDATED')).toBe('text-warning');
  });

  it('"PRESENCE_UPDATE" → "text-muted-foreground"', () => {
    expect(categoryColor('PRESENCE_UPDATE')).toBe('text-muted-foreground');
  });

  it('"CHATS_UPDATE" → "text-muted-foreground"', () => {
    expect(categoryColor('CHATS_UPDATE')).toBe('text-muted-foreground');
  });

  it('"CONTACTS_UPDATE" → "text-muted-foreground"', () => {
    expect(categoryColor('CONTACTS_UPDATE')).toBe('text-muted-foreground');
  });

  it('"CALL" → "text-accent-foreground"', () => {
    expect(categoryColor('CALL')).toBe('text-accent-foreground');
  });

  it('"LABELS_EDIT" → "text-secondary-foreground"', () => {
    expect(categoryColor('LABELS_EDIT')).toBe('text-secondary-foreground');
  });

  it('"UNKNOWN_EVENT" → "text-foreground"', () => {
    expect(categoryColor('UNKNOWN_EVENT')).toBe('text-foreground');
  });

  it('empty string → "text-foreground"', () => {
    expect(categoryColor('')).toBe('text-foreground');
  });
});

// ── categoryFill ──────────────────────────────────────────────────────────────

describe('categoryFill', () => {
  it('"MESSAGES_UPSERT" → "hsl(var(--primary))"', () => {
    expect(categoryFill('MESSAGES_UPSERT')).toBe('hsl(var(--primary))');
  });

  it('"messages_upsert" (lowercase) → "hsl(var(--primary))"', () => {
    expect(categoryFill('messages_upsert')).toBe('hsl(var(--primary))');
  });

  it('"CONNECTION_UPDATE" → "hsl(var(--warning))"', () => {
    expect(categoryFill('CONNECTION_UPDATE')).toBe('hsl(var(--warning))');
  });

  it('"QRCODE_UPDATED" → "hsl(var(--warning))"', () => {
    expect(categoryFill('QRCODE_UPDATED')).toBe('hsl(var(--warning))');
  });

  it('"PRESENCE_UPDATE" → "hsl(var(--muted-foreground))"', () => {
    expect(categoryFill('PRESENCE_UPDATE')).toBe('hsl(var(--muted-foreground))');
  });

  it('"CHATS_UPDATE" → "hsl(var(--muted-foreground))"', () => {
    expect(categoryFill('CHATS_UPDATE')).toBe('hsl(var(--muted-foreground))');
  });

  it('"CONTACTS_UPDATE" → "hsl(var(--muted-foreground))"', () => {
    expect(categoryFill('CONTACTS_UPDATE')).toBe('hsl(var(--muted-foreground))');
  });

  it('"CALL" → "hsl(var(--accent))"', () => {
    expect(categoryFill('CALL')).toBe('hsl(var(--accent))');
  });

  it('"LABELS_EDIT" → "hsl(var(--secondary))"', () => {
    expect(categoryFill('LABELS_EDIT')).toBe('hsl(var(--secondary))');
  });

  it('"UNKNOWN_EVENT" → "hsl(var(--foreground))"', () => {
    expect(categoryFill('UNKNOWN_EVENT')).toBe('hsl(var(--foreground))');
  });

  it('empty string → "hsl(var(--foreground))"', () => {
    expect(categoryFill('')).toBe('hsl(var(--foreground))');
  });

  it('all fill values start with "hsl(var(--"', () => {
    const types = [
      'MESSAGES_UPSERT',
      'CONNECTION_UPDATE',
      'QRCODE_UPDATED',
      'PRESENCE_UPDATE',
      'CHATS_UPDATE',
      'CONTACTS_UPDATE',
      'CALL',
      'LABELS_EDIT',
      'UNKNOWN',
    ];
    types.forEach((t) => {
      expect(categoryFill(t)).toMatch(/^hsl\(var\(--/);
    });
  });
});
