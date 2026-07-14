import { describe, it, expect } from 'vitest';
import { buildFileHash } from '@/lib/crypto';

// ── return type ───────────────────────────────────────────────────────────────

describe('buildFileHash — return type', () => {
  it('returns a string', async () => {
    const result = await buildFileHash('hello');
    expect(typeof result).toBe('string');
  });

  it('returns a 64-character hex string (SHA-256 = 32 bytes × 2 hex digits)', async () => {
    const result = await buildFileHash('hello');
    expect(result).toHaveLength(64);
  });

  it('output contains only lowercase hex characters', async () => {
    const result = await buildFileHash('hello world');
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── known SHA-256 vectors ────────────────────────────────────────────────────

describe('buildFileHash — known SHA-256 vectors', () => {
  it('hashes empty string to the canonical SHA-256 of ""', async () => {
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb924...
    const result = await buildFileHash('');
    expect(result).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('hashes "hello" to its known SHA-256 digest', async () => {
    // SHA-256('hello') = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c...
    const result = await buildFileHash('hello');
    expect(result).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('produces the same result as a direct SubtleCrypto.digest call', async () => {
    const input = 'cross-check input string';
    const raw = new TextEncoder().encode(input).buffer;
    const digestBuf = await crypto.subtle.digest('SHA-256', raw);
    const expected = Array.from(new Uint8Array(digestBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(await buildFileHash(input)).toBe(expected);
  });
});

// ── determinism ───────────────────────────────────────────────────────────────

describe('buildFileHash — determinism', () => {
  it('same string produces the same hash on repeated calls', async () => {
    const h1 = await buildFileHash('deterministic input');
    const h2 = await buildFileHash('deterministic input');
    expect(h1).toBe(h2);
  });

  it('different strings produce different hashes', async () => {
    const h1 = await buildFileHash('input A');
    const h2 = await buildFileHash('input B');
    expect(h1).not.toBe(h2);
  });

  it('appending a character changes the hash', async () => {
    const h1 = await buildFileHash('hello');
    const h2 = await buildFileHash('helloo');
    expect(h1).not.toBe(h2);
  });
});

// ── Blob support ──────────────────────────────────────────────────────────────

describe('buildFileHash — Blob input', () => {
  it('hashes a Blob containing "hello" to the same value as the string "hello"', async () => {
    const blob = new Blob(['hello'], { type: 'text/plain' });
    const stringHash = await buildFileHash('hello');
    const blobHash = await buildFileHash(blob);
    expect(blobHash).toBe(stringHash);
  });

  it('hashes an empty Blob to the SHA-256 of the empty string', async () => {
    const emptyBlob = new Blob([], { type: 'text/plain' });
    const result = await buildFileHash(emptyBlob);
    expect(result).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('hashes a Blob with binary data consistently', async () => {
    const bytes = new Uint8Array([0x01, 0x02, 0x03, 0xff]);
    const blob = new Blob([bytes]);
    const h1 = await buildFileHash(blob);
    const h2 = await buildFileHash(blob);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});
