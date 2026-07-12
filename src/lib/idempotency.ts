/**
 * Idempotency key utilities — stable hashing, sanitization and safe truncation
 * for use with HTTP `Idempotency-Key` headers and in-memory dedupe.
 */

/** Recursively stable JSON stringify — sorts object keys, preserves array order, drops undefined/functions. */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const walk = (v: unknown): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'undefined' || t === 'function' || t === 'symbol') return undefined;
    if (t === 'number') return Number.isFinite(v as number) ? v : null;
    if (t !== 'object') return v;

    if (seen.has(v as object)) return null;
    seen.add(v as object);

    if (Array.isArray(v)) return v.map((item) => walk(item) ?? null);

    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const w = walk(obj[k]);
      if (w !== undefined) out[k] = w;
    }
    return out;
  };

  return JSON.stringify(walk(value));
}

/** djb2 32-bit hash → 8-char hex. Sync fallback when crypto.subtle unavailable. */
function djb2Hex(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** SHA-256 hex digest. Falls back to djb2 when SubtleCrypto is unavailable (jsdom/SSR). */
export async function sha256Hex(input: string): Promise<string> {
  try {
    const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
    if (subtle) {
      const bytes = new TextEncoder().encode(input);
      const buf = await subtle.digest('SHA-256', bytes);
      const arr = Array.from(new Uint8Array(buf));
      return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // crypto.subtle unavailable (Node/Jest/non-secure context) — djb2 fallback below
  }
  // Deterministic fallback (NOT cryptographic) — repeat djb2 to fill 64 chars
  let out = '';
  let salt = input;
  while (out.length < 64) {
    const h = djb2Hex(salt);
    out += h;
    salt = h + salt;
  }
  return out.slice(0, 64);
}

const MAX_HEADER_LEN = 128;
const SAFE_CHAR_RE = /[^A-Za-z0-9._\-:+/=]/g;

/**
 * Sanitize a user-supplied idempotency key for use in an HTTP header.
 * - Trims; returns undefined if empty.
 * - Replaces non-ASCII-safe chars with `_`.
 * - Truncates to 128 chars; if truncated, appends `:h<12hex>` suffix to preserve uniqueness.
 */
export function normalizeIdempotencyKey(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const sanitized = trimmed.replace(SAFE_CHAR_RE, '_');
  if (!sanitized) return undefined;

  if (sanitized.length <= MAX_HEADER_LEN) return sanitized;

  // Truncate but preserve uniqueness via deterministic suffix derived from the original.
  const suffix = `:h${djb2Hex(trimmed)}${djb2Hex(trimmed + '#2')}`.slice(0, 14); // ~:h + 12 hex
  const head = sanitized.slice(0, MAX_HEADER_LEN - suffix.length);
  return head + suffix;
}

/** Derive a stable, short idempotency key from action + body. Prefixed with `auto_` to distinguish from user keys. */
export async function deriveIdempotencyKey(action: string, body: unknown): Promise<string> {
  const hash = await sha256Hex(stableStringify({ action, body: body ?? null }));
  return `auto_${hash.slice(0, 24)}`;
}
