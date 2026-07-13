import { describe, it, expect } from 'vitest';
import { newRequestId } from '@/lib/withRequestId';
import type { RequestTrace } from '@/lib/withRequestId';

// ── newRequestId — shape ───────────────────────────────────────────────────────

describe('newRequestId — return shape', () => {
  it('returns an object with requestId and headers fields', () => {
    const trace = newRequestId();
    expect(trace).toHaveProperty('requestId');
    expect(trace).toHaveProperty('headers');
  });

  it('requestId is a non-empty string', () => {
    const { requestId } = newRequestId();
    expect(typeof requestId).toBe('string');
    expect(requestId.length).toBeGreaterThan(0);
  });

  it('headers contains x-request-id field', () => {
    const { headers } = newRequestId();
    expect(headers).toHaveProperty('x-request-id');
  });

  it('headers["x-request-id"] matches requestId', () => {
    const trace = newRequestId();
    expect(trace.headers['x-request-id']).toBe(trace.requestId);
  });
});

// ── newRequestId — prefix ─────────────────────────────────────────────────────

describe('newRequestId — with prefix', () => {
  it('requestId starts with prefix_', () => {
    const { requestId } = newRequestId('send');
    expect(requestId.startsWith('send_')).toBe(true);
  });

  it('requestId has content after the prefix separator', () => {
    const { requestId } = newRequestId('my-prefix');
    const parts = requestId.split('_');
    // "my-prefix_<raw>" → split on "_": "my-prefix" + "<raw>"
    expect(parts.length).toBeGreaterThanOrEqual(2);
    const suffix = requestId.slice('my-prefix_'.length);
    expect(suffix.length).toBeGreaterThan(0);
  });

  it('without prefix, requestId has no leading underscore', () => {
    const { requestId } = newRequestId();
    expect(requestId.startsWith('_')).toBe(false);
  });

  it('x-request-id still matches requestId when prefix is provided', () => {
    const trace = newRequestId('campaign');
    expect(trace.headers['x-request-id']).toBe(trace.requestId);
  });
});

// ── newRequestId — uniqueness ─────────────────────────────────────────────────

describe('newRequestId — uniqueness', () => {
  it('two calls produce different requestIds', () => {
    const id1 = newRequestId().requestId;
    const id2 = newRequestId().requestId;
    expect(id1).not.toBe(id2);
  });

  it('100 calls all produce unique requestIds', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(newRequestId().requestId);
    }
    expect(ids.size).toBe(100);
  });
});

// ── newRequestId — length constraints ────────────────────────────────────────

describe('newRequestId — length', () => {
  it('raw (no-prefix) requestId is at most 8 characters', () => {
    // The raw id is sliced to 8 chars from a UUID or random string
    const { requestId } = newRequestId();
    expect(requestId.length).toBeLessThanOrEqual(8);
  });

  it('prefixed requestId length is prefix.length + 1 (underscore) + 8', () => {
    const prefix = 'test';
    const { requestId } = newRequestId(prefix);
    expect(requestId.length).toBe(prefix.length + 1 + 8);
  });
});

// ── RequestTrace type ─────────────────────────────────────────────────────────

describe('RequestTrace — type conformance', () => {
  it('satisfies RequestTrace interface shape', () => {
    const trace: RequestTrace = newRequestId();
    // Type check at runtime: both fields exist and have the right JS type
    expect(typeof trace.requestId).toBe('string');
    expect(typeof trace.headers['x-request-id']).toBe('string');
  });
});
