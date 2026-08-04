import { describe, it, expect } from 'vitest';
import {
  buildSendIdempotencyKey,
  buildSendIdempotencyKeyFromFingerprint,
} from '@/lib/sendIdempotency';
import type { SendFingerprint } from '@/lib/sendIdempotency';

// ── helpers ────────────────────────────────────────────────────────────────────

const NOW_MS = 1_700_000_000_000; // fixed reference (2023-11-14T22:13:20.000Z)
const BUCKET_MS = 1 * 60 * 1000; // 1 min (F4-16)

function makeFp(overrides: Partial<SendFingerprint> = {}): SendFingerprint {
  return {
    contactId: 'contact-abc',
    messageType: 'text',
    content: 'Hello world',
    now: NOW_MS,
    bucketMs: BUCKET_MS,
    ...overrides,
  };
}

// ── buildSendIdempotencyKey ────────────────────────────────────────────────────

describe('buildSendIdempotencyKey', () => {
  it('returns msg:<rowId>', () => {
    expect(buildSendIdempotencyKey('row-123')).toBe('msg:row-123');
  });

  it('returns msg:<rowId> for uuid-like ids', () => {
    expect(buildSendIdempotencyKey('550e8400-e29b-41d4-a716-446655440000'))
      .toBe('msg:550e8400-e29b-41d4-a716-446655440000');
  });

  it('works with empty string rowId', () => {
    expect(buildSendIdempotencyKey('')).toBe('msg:');
  });

  it('is pure — same input produces same output', () => {
    const id = 'test-row-id';
    expect(buildSendIdempotencyKey(id)).toBe(buildSendIdempotencyKey(id));
  });
});

// ── buildSendIdempotencyKeyFromFingerprint — format ───────────────────────────

describe('buildSendIdempotencyKeyFromFingerprint — key format', () => {
  it('starts with mfp:', async () => {
    const key = await buildSendIdempotencyKeyFromFingerprint(makeFp());
    expect(key).toMatch(/^mfp:/);
  });

  it('has three colon-separated segments', async () => {
    const key = await buildSendIdempotencyKeyFromFingerprint(makeFp());
    const parts = key.split(':');
    expect(parts).toHaveLength(3);
  });

  it('algo segment is s256 or fb1', async () => {
    const key = await buildSendIdempotencyKeyFromFingerprint(makeFp());
    const algo = key.split(':')[1];
    expect(['s256', 'fb1']).toContain(algo);
  });

  it('hash segment is 32 hex characters', async () => {
    const key = await buildSendIdempotencyKeyFromFingerprint(makeFp());
    const hash = key.split(':')[2];
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });
});

// ── buildSendIdempotencyKeyFromFingerprint — determinism ──────────────────────

describe('buildSendIdempotencyKeyFromFingerprint — determinism', () => {
  it('same fingerprint produces same key (idempotent)', async () => {
    const fp = makeFp();
    const k1 = await buildSendIdempotencyKeyFromFingerprint(fp);
    const k2 = await buildSendIdempotencyKeyFromFingerprint(fp);
    expect(k1).toBe(k2);
  });

  it('same content within same time bucket yields same key', async () => {
    // NOW_MS está 20s dentro de um bucket de 1min (resto de 20_000ms), então
    // +30s ainda cai no MESMO bucket.
    const fp1 = makeFp({ now: NOW_MS });
    const fp2 = makeFp({ now: NOW_MS + 30_000 }); // 30s later, same 1-min bucket
    const k1 = await buildSendIdempotencyKeyFromFingerprint(fp1);
    const k2 = await buildSendIdempotencyKeyFromFingerprint(fp2);
    expect(k1).toBe(k2);
  });

  it('same content in different bucket yields different key', async () => {
    const fp1 = makeFp({ now: NOW_MS });
    const fp2 = makeFp({ now: NOW_MS + BUCKET_MS }); // next bucket
    const k1 = await buildSendIdempotencyKeyFromFingerprint(fp1);
    const k2 = await buildSendIdempotencyKeyFromFingerprint(fp2);
    expect(k1).not.toBe(k2);
  });
});

// ── buildSendIdempotencyKeyFromFingerprint — field sensitivity ────────────────

describe('buildSendIdempotencyKeyFromFingerprint — field sensitivity', () => {
  it('different contactId yields different key', async () => {
    const k1 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ contactId: 'a' }));
    const k2 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ contactId: 'b' }));
    expect(k1).not.toBe(k2);
  });

  it('different content yields different key', async () => {
    const k1 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ content: 'Hello' }));
    const k2 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ content: 'World' }));
    expect(k1).not.toBe(k2);
  });

  it('different messageType yields different key', async () => {
    const k1 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ messageType: 'text' }));
    const k2 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ messageType: 'image' }));
    expect(k1).not.toBe(k2);
  });

  it('different mediaUrl yields different key', async () => {
    const k1 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ mediaUrl: null }));
    const k2 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ mediaUrl: 'https://example.com/img.jpg' }));
    expect(k1).not.toBe(k2);
  });

  it('leading/trailing whitespace in content is trimmed before hashing', async () => {
    const k1 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ content: 'Hello' }));
    const k2 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ content: '  Hello  ' }));
    expect(k1).toBe(k2);
  });

  it('null and empty string mediaUrl are treated identically', async () => {
    const k1 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ mediaUrl: null }));
    const k2 = await buildSendIdempotencyKeyFromFingerprint(makeFp({ mediaUrl: '' }));
    expect(k1).toBe(k2);
  });
});

// ── buildSendIdempotencyKeyFromFingerprint — bucket defaults ──────────────────

describe('buildSendIdempotencyKeyFromFingerprint — bucket defaults', () => {
  it('uses 1-minute bucket when bucketMs is not provided', async () => {
    // NOW_MS está 20s dentro de um bucket de 1min, então +30s permanece no
    // mesmo bucket; +60s cairia no próximo.
    const fp1: SendFingerprint = {
      contactId: 'c',
      messageType: 'text',
      content: 'hi',
      now: NOW_MS,
    };
    const fp2: SendFingerprint = {
      contactId: 'c',
      messageType: 'text',
      content: 'hi',
      now: NOW_MS + 30_000, // 30s later — inside the same 1-min bucket
    };
    const k1 = await buildSendIdempotencyKeyFromFingerprint(fp1);
    const k2 = await buildSendIdempotencyKeyFromFingerprint(fp2);
    expect(k1).toBe(k2);
  });

  it('treats bucketMs=0 as invalid and falls back to 1-minute default', async () => {
    const fp1 = makeFp({ bucketMs: 0, now: NOW_MS });
    const fp2 = makeFp({ bucketMs: undefined, now: NOW_MS });
    const k1 = await buildSendIdempotencyKeyFromFingerprint(fp1);
    const k2 = await buildSendIdempotencyKeyFromFingerprint(fp2);
    expect(k1).toBe(k2);
  });
});
