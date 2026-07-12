/**
 * Stable idempotency key per outbound message.
 *
 * Why this exists
 * ---------------
 * The Evolution proxy uses the `Idempotency-Key` header to deduplicate sends
 * server-side. We therefore need a key that:
 *
 *   1. Is **stable across automatic retries** of the same logical send
 *      (network glitch in `invokeEvolutionWithRetry`, DLQ reprocess from
 *      cron). The original message row id satisfies this trivially because
 *      retries reuse the same row.
 *
 *   2. Is **stable across manual resends** of the same logical content. The
 *      "Reenviar" button in `MessageBubble.tsx` creates a NEW `messages`
 *      row, so a row-id-only key would let the same WhatsApp message be
 *      delivered twice if the original had actually arrived but the proxy
 *      reported failure. To collapse those, we hash the content + recipient
 *      + a coarse time bucket and prefer that key when the caller supplies
 *      a fingerprint.
 *
 *   3. Is **distinct across different logical sends** — same agent, same
 *      contact, different text must produce different keys. The hash + the
 *      time bucket guarantee that without leaking content into logs.
 *
 * Format
 * ------
 *   - Without fingerprint: `msg:<row-id>` (back-compat with existing call sites and DLQ).
 *   - With fingerprint:    `mfp:<algo>:<short-hash>` — `algo` is `s256` (SHA-256, hex, first 32 chars).
 *
 * Both forms fit comfortably inside Evolution's 8–200 char window.
 */

/** Fingerprint of a logical send, used to dedupe manual resends. */
export interface SendFingerprint {
  contactId: string;
  /** Normalized message type, e.g. 'text' | 'image' | 'audio' | 'video' | 'document' | 'location'. */
  messageType: string;
  /** The exact content payload that will be transmitted. Trimmed before hashing. */
  content: string;
  /** Optional media URL when applicable. */
  mediaUrl?: string | null;
  /**
   * Time bucket size in milliseconds. Two sends with identical content within
   * the same bucket collapse to the same key; in different buckets they get
   * different keys (so an agent can intentionally re-send the same text 10
   * minutes later and have it actually go through). Default: 5 minutes.
   */
  bucketMs?: number;
  /** Now() override for tests. */
  now?: number;
}

const DEFAULT_BUCKET_MS = 5 * 60 * 1000;

/**
 * SHA-256 → hex (first 32 chars) for compact, log-safe fingerprinting.
 * Falls back to a deterministic non-cryptographic hash when SubtleCrypto is
 * unavailable (older browsers, SSR). The fallback is still stable per input
 * but should not be relied upon for collision-resistance — Evolution's
 * server-side dedupe window is small enough that this is acceptable.
 */
async function sha256Hex(input: string): Promise<{ algo: 's256' | 'fb1'; hash: string }> {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle?.digest === 'function' &&
    typeof TextEncoder !== 'undefined'
  ) {
    try {
      const buf = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return { algo: 's256', hash: hex.slice(0, 32) };
    } catch {
      // crypto.subtle unavailable (Node/Jest/non-secure context) — FNV-1a fallback below
    }
  }
  // Deterministic fallback: FNV-1a 32-bit, repeated to widen.
  const fnv = (s: string, seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  const hash = (
    fnv(input, 0x811c9dc5) +
    fnv(input, 0xdeadbeef) +
    fnv(input, 0x1b873593) +
    fnv(input, 0x6a88c5b1)
  ).slice(0, 32);
  return { algo: 'fb1', hash };
}

/**
 * Back-compat synchronous form: builds a key from the row id alone.
 *
 * Use this when there's no fingerprint available (DLQ replay where only the
 * row id is known, or any legacy call site that wasn't updated). All existing
 * tests and the DLQ reprocessor continue to use this path.
 */
export function buildSendIdempotencyKey(messageRowId: string): string {
  return `msg:${messageRowId}`;
}

/**
 * Async, content-aware key. Prefer this in `messageSender.ts` so that:
 *
 *  - A duplicated tab request that re-sends the same row gets `msg:<id>`
 *    (handled by the row-id form via cross-tab dedupe).
 *  - A "Reenviar" click that creates a fresh row but for IDENTICAL content
 *    still produces the same key, letting Evolution dedupe on its side.
 */
export async function buildSendIdempotencyKeyFromFingerprint(fp: SendFingerprint): Promise<string> {
  const bucketMs = fp.bucketMs && fp.bucketMs > 0 ? fp.bucketMs : DEFAULT_BUCKET_MS;
  const now = typeof fp.now === 'number' ? fp.now : Date.now();
  const bucket = Math.floor(now / bucketMs);

  // Normalize inputs so trivial whitespace differences don't dodge the dedupe.
  const normalized = JSON.stringify({
    c: fp.contactId,
    t: fp.messageType,
    x: (fp.content ?? '').trim(),
    m: fp.mediaUrl ?? '',
    b: bucket,
  });

  const { algo, hash } = await sha256Hex(normalized);
  return `mfp:${algo}:${hash}`;
}
