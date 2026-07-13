import { describe, it, expect } from 'vitest';
import { parseEdgeEvents, ALL_EVENTS, type Evt } from '../edgeEvents';

// ── ALL_EVENTS ─────────────────────────────────────────────────────────────────

describe('ALL_EVENTS', () => {
  it('has exactly 3 events', () => {
    expect(ALL_EVENTS).toHaveLength(3);
  });

  it('contains INSERT', () => {
    expect(ALL_EVENTS).toContain('INSERT');
  });

  it('contains UPDATE', () => {
    expect(ALL_EVENTS).toContain('UPDATE');
  });

  it('contains DELETE', () => {
    expect(ALL_EVENTS).toContain('DELETE');
  });

  it('all elements are valid Evt literals', () => {
    const valid = new Set<string>(['INSERT', 'UPDATE', 'DELETE']);
    ALL_EVENTS.forEach((e) => expect(valid.has(e)).toBe(true));
  });
});

// ── parseEdgeEvents — wildcard '*' ───────────────────────────────────────────

describe('parseEdgeEvents — wildcard "*"', () => {
  it('returns all 3 events for "*"', () => {
    const result = parseEdgeEvents('*');
    expect(result.size).toBe(3);
    expect(result.has('INSERT')).toBe(true);
    expect(result.has('UPDATE')).toBe(true);
    expect(result.has('DELETE')).toBe(true);
  });

  it('returns all 3 events for "* status changes"', () => {
    const result = parseEdgeEvents('* status changes');
    expect(result.size).toBe(3);
  });

  it('returns all 3 events when "*" is embedded in a label', () => {
    const result = parseEdgeEvents('postgres_changes *');
    expect(result.size).toBe(3);
  });
});

// ── parseEdgeEvents — single event tokens ────────────────────────────────────

describe('parseEdgeEvents — single token INSERT', () => {
  it('returns {INSERT} for "INSERT"', () => {
    const result = parseEdgeEvents('INSERT');
    expect(result.has('INSERT')).toBe(true);
    expect(result.has('UPDATE')).toBe(false);
    expect(result.has('DELETE')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns {INSERT} for "INSERT new row"', () => {
    const result = parseEdgeEvents('INSERT new row');
    expect(result.has('INSERT')).toBe(true);
    expect(result.size).toBe(1);
  });
});

describe('parseEdgeEvents — single token UPDATE', () => {
  it('returns {UPDATE} for "UPDATE"', () => {
    const result = parseEdgeEvents('UPDATE');
    expect(result.has('UPDATE')).toBe(true);
    expect(result.has('INSERT')).toBe(false);
    expect(result.has('DELETE')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns {UPDATE} for "UPDATE status"', () => {
    const result = parseEdgeEvents('UPDATE status');
    expect(result.has('UPDATE')).toBe(true);
    expect(result.size).toBe(1);
  });
});

describe('parseEdgeEvents — single token DELETE', () => {
  it('returns {DELETE} for "DELETE"', () => {
    const result = parseEdgeEvents('DELETE');
    expect(result.has('DELETE')).toBe(true);
    expect(result.has('INSERT')).toBe(false);
    expect(result.has('UPDATE')).toBe(false);
    expect(result.size).toBe(1);
  });

  it('returns {DELETE} for "DELETE record"', () => {
    const result = parseEdgeEvents('DELETE record');
    expect(result.has('DELETE')).toBe(true);
    expect(result.size).toBe(1);
  });
});

// ── parseEdgeEvents — multiple event tokens ───────────────────────────────────

describe('parseEdgeEvents — multiple tokens', () => {
  it('returns {INSERT, UPDATE} for "INSERT | UPDATE"', () => {
    const result = parseEdgeEvents('INSERT | UPDATE');
    expect(result.has('INSERT')).toBe(true);
    expect(result.has('UPDATE')).toBe(true);
    expect(result.has('DELETE')).toBe(false);
    expect(result.size).toBe(2);
  });

  it('returns {INSERT, DELETE} for "INSERT or DELETE"', () => {
    const result = parseEdgeEvents('INSERT or DELETE');
    expect(result.has('INSERT')).toBe(true);
    expect(result.has('DELETE')).toBe(true);
    expect(result.has('UPDATE')).toBe(false);
    expect(result.size).toBe(2);
  });

  it('returns {UPDATE, DELETE} for "UPDATE, DELETE"', () => {
    const result = parseEdgeEvents('UPDATE, DELETE');
    expect(result.has('UPDATE')).toBe(true);
    expect(result.has('DELETE')).toBe(true);
    expect(result.has('INSERT')).toBe(false);
    expect(result.size).toBe(2);
  });

  it('returns all 3 events for "INSERT UPDATE DELETE"', () => {
    const result = parseEdgeEvents('INSERT UPDATE DELETE');
    expect(result.size).toBe(3);
    expect(result.has('INSERT')).toBe(true);
    expect(result.has('UPDATE')).toBe(true);
    expect(result.has('DELETE')).toBe(true);
  });
});

// ── parseEdgeEvents — word-boundary guard (no false positives) ────────────────

describe('parseEdgeEvents — word-boundary guard', () => {
  it('does not match "INSERTION" as INSERT', () => {
    const result = parseEdgeEvents('INSERTION');
    expect(result.has('INSERT')).toBe(false);
  });

  it('does not match "UPDATED" as UPDATE', () => {
    const result = parseEdgeEvents('UPDATED');
    expect(result.has('UPDATE')).toBe(false);
  });

  it('does not match "DELETED" as DELETE', () => {
    const result = parseEdgeEvents('DELETED');
    expect(result.has('DELETE')).toBe(false);
  });

  it('does not match "INSERTING" as INSERT', () => {
    const result = parseEdgeEvents('INSERTING record');
    expect(result.has('INSERT')).toBe(false);
  });

  it('does not match "UPDATES" as UPDATE', () => {
    const result = parseEdgeEvents('UPDATES status field');
    expect(result.has('UPDATE')).toBe(false);
  });
});

// ── parseEdgeEvents — empty / no-match inputs ─────────────────────────────────

describe('parseEdgeEvents — empty and no-match inputs', () => {
  it('returns an empty Set for an empty string', () => {
    const result = parseEdgeEvents('');
    expect(result.size).toBe(0);
  });

  it('returns an empty Set for unrelated text', () => {
    const result = parseEdgeEvents('postgres_changes channel');
    expect(result.size).toBe(0);
  });

  it('returns an empty Set for lowercase "insert"', () => {
    const result = parseEdgeEvents('insert');
    expect(result.size).toBe(0);
  });

  it('returns an empty Set for "select ... from table" (no wildcard, no event tokens)', () => {
    const result = parseEdgeEvents('select id from table');
    expect(result.size).toBe(0);
  });
});

// ── parseEdgeEvents — returns a Set (not array) ──────────────────────────────

describe('parseEdgeEvents — return type', () => {
  it('returns a Set instance', () => {
    const result = parseEdgeEvents('INSERT');
    expect(result).toBeInstanceOf(Set);
  });

  it('deduplicates events if a token appears twice', () => {
    const result = parseEdgeEvents('INSERT INSERT');
    expect(result.size).toBe(1);
  });
});

// ── parseEdgeEvents — wildcard supersedes individual tokens ──────────────────

describe('parseEdgeEvents — wildcard with individual tokens', () => {
  it('returns 3 events when "*" is combined with "INSERT"', () => {
    const result = parseEdgeEvents('* INSERT');
    expect(result.size).toBe(3);
  });

  it('returns 3 events when "*" is combined with all three', () => {
    const result = parseEdgeEvents('* INSERT UPDATE DELETE');
    expect(result.size).toBe(3);
  });
});
