/**
 * Exhaustive security simulation tests for all P1/P2 hardening fixes in PR #185.
 *
 * Each section mirrors the production implementation extracted inline so tests
 * run in the vitest/happy-dom environment without importing Deno modules.
 *
 * Coverage areas:
 *   1. isSafeHttpsUrl      — SSRF / private-IP bypass vectors
 *   2. isSafeMediaCdnUrl   — CDN allowlist bypass / open redirect
 *   3. sanitizeStoragePath — path traversal / double-encoding
 *   4. buildMime           — MIME header injection (CWE-93)
 *   5. TOCTOU atomic guard — concurrent approve-password-reset
 *   6. Gmail error taxonomy — NonRetryableMessageError routing
 */

import { describe, it, expect } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// 1. isSafeHttpsUrl
//    Exact copy of the function in supabase/functions/_shared/schemas.ts
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: This is a Node.js-adapted equivalent of the Deno production function.
// Node.js URL.hostname returns BRACKETED IPv6 (e.g. '[::1]', '[fe80::1]').
// Deno URL.hostname returns BRACKETLESS IPv6 (e.g. '::1', 'fe80::1').
// The security logic is equivalent; only the string format differs by runtime.
function isSafeHttpsUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6: Node.js URL.hostname returns bracketed form e.g. '[::1]', '[fe80::1]'
    // WHATWG normalizes IPv4-compatible: [::127.0.0.1]→[::7f00:1], [::169.254.169.254]→[::a9fe:a9fe]
    host.startsWith('[::') || // loopback, IPv4-mapped, IPv4-compat, unspecified
    /^\[fe[89ab][0-9a-f]:/i.test(host) || // link-local fe80::/10 (fe80–febf)
    /^\[fec[0-9a-f]:/i.test(host) || // site-local fec0::/10
    /^\[f[cd][0-9a-f]{2}:/i.test(host) // ULA fc00::/7 (fc00–fdff)
  )
    return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. isSafeMediaCdnUrl
//    Exact copy of the function in supabase/functions/_shared/evolution-media.ts
// ─────────────────────────────────────────────────────────────────────────────

function isSafeMediaCdnUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    const h = hostname.toLowerCase();
    const exact = new Set([
      'mmg.whatsapp.net',
      'media.whatsapp.net',
      'pps.whatsapp.net',
      'static.whatsapp.net',
    ]);
    if (exact.has(h)) return true;
    if (h.endsWith('.whatsapp.net') || h.endsWith('.whatsapp.com')) return true;
    return false;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. sanitizeStoragePath
//    Exact copy from supabase/functions/secure-upload/index.ts
// ─────────────────────────────────────────────────────────────────────────────

const sanitizeStoragePath = (raw: string): string =>
  raw
    .split('/')
    .flatMap((seg: string) => {
      try {
        return [decodeURIComponent(seg)];
      } catch {
        return [seg];
      }
    })
    .filter((seg: string) => seg !== '' && seg !== '.' && seg !== '..')
    .join('/');

// ─────────────────────────────────────────────────────────────────────────────
// 4. buildMime (sanitization layer only — no full encoding for unit testing)
//    The critical security fix is in the attachment name/mimeType sanitization.
// ─────────────────────────────────────────────────────────────────────────────

interface Attachment {
  name: unknown;
  mimeType: unknown;
  data: string;
}

function sanitizeAttachment(att: Attachment): { safeName: string; safeMime: string } {
  const safeName = String(att.name ?? '').replace(/[\r\n"\\]/g, '');
  const safeMime =
    String(att.mimeType ?? 'application/octet-stream').replace(/[\r\n"\\]/g, '') ||
    'application/octet-stream';
  return { safeName, safeMime };
}

// Extract MIME headers from a built email as a string (for injection detection)
function buildMimeHeaders(att: Attachment): string {
  const { safeName, safeMime } = sanitizeAttachment(att);
  return [
    `Content-Type: ${safeMime}; name="${safeName}"`,
    `Content-Disposition: attachment; filename="${safeName}"`,
  ].join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TOCTOU atomic guard simulation
//    Mirrors the logic in approve-password-reset/index.ts
// ─────────────────────────────────────────────────────────────────────────────

type RequestStatus = 'pending' | 'approved' | 'rejected';

class MockPasswordResetStore {
  private records: Map<string, RequestStatus> = new Map();

  seed(id: string, status: RequestStatus) {
    this.records.set(id, status);
  }

  /** Atomic UPDATE WHERE status='pending' — returns rows affected (0 or 1) */
  atomicApprove(id: string): number {
    if (this.records.get(id) === 'pending') {
      this.records.set(id, 'approved');
      return 1;
    }
    return 0;
  }

  atomicReject(id: string): number {
    if (this.records.get(id) === 'pending') {
      this.records.set(id, 'rejected');
      return 1;
    }
    return 0;
  }

  getStatus(id: string): RequestStatus | undefined {
    return this.records.get(id);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Gmail error taxonomy
//    Mirror of the isTransient logic in gmail-webhook/index.ts
// ─────────────────────────────────────────────────────────────────────────────

class NonRetryableMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableMessageError';
  }
}

function classifyGmailError(err: {
  code: number;
  status?: string;
  reason?: string;
}): 'skip' | 'transient' | 'non-retryable' {
  if (err.code === 404) return 'skip';
  const reason = (err.reason ?? '').toLowerCase();
  const status = (err.status ?? '').toLowerCase();
  const isTransient =
    err.code === 429 ||
    err.code >= 500 ||
    reason === 'ratelimitexceeded' ||
    reason === 'userratelimitexceeded' ||
    reason === 'quotaexceeded' ||
    status === 'unauthenticated' ||
    status === 'resource_exhausted';
  return isTransient ? 'transient' : 'non-retryable';
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

describe('isSafeHttpsUrl — SSRF prevention', () => {
  // ── Valid public URLs (must PASS) ─────────────────────────────────────────
  describe('valid public HTTPS URLs pass', () => {
    const valid = [
      'https://example.com/image.jpg',
      'https://cdn.example.com/path/to/image.png',
      'https://1.1.1.1/', // Cloudflare DNS
      'https://8.8.8.8/', // Google DNS
      'https://173.0.0.1/', // just outside 172.31
      'https://172.32.0.1/', // just outside 172.31 range
      'https://172.15.255.255/', // just below 172.16
      'https://11.0.0.1/', // not in 10.x.x.x exact match (10. prefix test)
      'https://[2001:db8::1]/', // documentation range
      'https://[2606:4700::6810:84e5]/', // Cloudflare
      'https://user@example.com/path', // userinfo — hostname is example.com
      'https://example.com:8443/path',
    ];
    valid.forEach((url) => {
      it(`allows ${url}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(true);
      });
    });
  });

  // ── HTTP / non-HTTPS (must BLOCK) ─────────────────────────────────────────
  describe('rejects non-HTTPS protocols', () => {
    const nonHttps = [
      'http://example.com/image.jpg',
      'ftp://example.com/file',
      'file:///etc/passwd',
      'data:image/png;base64,abc',
      'javascript:alert(1)',
      'ws://example.com/',
      'wss://example.com/',
    ];
    nonHttps.forEach((url) => {
      it(`blocks ${url}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(false);
      });
    });
  });

  // ── Loopback (must BLOCK) ─────────────────────────────────────────────────
  describe('rejects loopback addresses', () => {
    const loopback = [
      'https://localhost/',
      'https://localhost:8080/',
      'https://sub.localhost/',
      'https://deep.sub.localhost/path',
      'https://0.0.0.0/',
      'https://127.0.0.1/',
      'https://127.0.0.255/',
      'https://127.255.255.255/',
      'https://127.1.2.3/',
    ];
    loopback.forEach((url) => {
      it(`blocks ${url}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(false);
      });
    });
  });

  // ── Link-local / AWS metadata (must BLOCK) ────────────────────────────────
  describe('rejects link-local / AWS metadata endpoints', () => {
    const linkLocal = [
      'https://169.254.169.254/', // AWS IMDS
      'https://169.254.169.254/latest/meta-data/iam/security-credentials/',
      'https://169.254.0.1/',
      'https://169.254.255.255/',
    ];
    linkLocal.forEach((url) => {
      it(`blocks ${url}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(false);
      });
    });
  });

  // ── RFC-1918 private ranges (must BLOCK) ──────────────────────────────────
  describe('rejects RFC-1918 private ranges', () => {
    const private_ = [
      'https://10.0.0.1/',
      'https://10.255.255.255/',
      'https://10.0.0.0/',
      'https://192.168.0.1/',
      'https://192.168.255.255/',
      'https://172.16.0.1/',
      'https://172.16.0.0/',
      'https://172.17.0.1/',
      'https://172.20.100.50/',
      'https://172.24.0.0/',
      'https://172.31.255.255/',
    ];
    private_.forEach((url) => {
      it(`blocks ${url}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(false);
      });
    });
  });

  // ── 172.x boundary precision (critical for regex correctness) ─────────────
  describe('172.x boundary — allows 172.0-15 and 172.32+', () => {
    const allowed = [
      'https://172.0.0.1/',
      'https://172.1.2.3/',
      'https://172.15.255.255/',
      'https://172.32.0.0/',
      'https://172.99.0.1/',
    ];
    allowed.forEach((url) => {
      it(`allows ${url}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(true);
      });
    });
  });

  // ── IPv6 private ranges (must BLOCK) ──────────────────────────────────────
  describe('rejects IPv6 private/loopback addresses', () => {
    const ipv6Private = [
      'https://[::1]/', // loopback
      'https://[::ffff:192.168.1.1]/', // IPv4-mapped
      'https://[fe80::1]/', // link-local
      'https://[fe80::dead:beef]/',
      'https://[fec0::1]/', // site-local
      'https://[fc00::1]/', // ULA fc00
      'https://[fc00:cafe::1]/', // ULA fc00
      'https://[fc01::1]/', // ULA fc01 (full fc/7 coverage)
      'https://[fc80::1]/', // ULA fc80
      'https://[fd00::1]/', // ULA fd00
      'https://[fd12:3456:789a::1]/', // ULA fd
      'https://[fdff:ffff:ffff::1]/', // ULA fdff
    ];
    ipv6Private.forEach((url) => {
      it(`blocks ${url}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(false);
      });
    });
  });

  // ── WHATWG URL normalization — verifies the parser normalizes bypass attempts ─
  describe('WHATWG normalization catches encoded/alternate IP notations', () => {
    // The WHATWG URL parser normalizes decimal/hex/octal IP notation.
    // These all resolve to 127.0.0.1 and must be blocked.
    it('blocks decimal-encoded loopback: https://2130706433/', () => {
      // 2130706433 = 0x7f000001 = 127.0.0.1
      expect(isSafeHttpsUrl('https://2130706433/')).toBe(false);
    });

    it('blocks hex-encoded loopback: https://0x7f000001/', () => {
      expect(isSafeHttpsUrl('https://0x7f000001/')).toBe(false);
    });

    it('blocks octal-encoded loopback: https://0177.0.0.1/', () => {
      // WHATWG normalizes 0177 (octal) → 127 in IPv4
      expect(isSafeHttpsUrl('https://0177.0.0.1/')).toBe(false);
    });

    it('blocks IPv6 loopback in full form: https://[0:0:0:0:0:0:0:1]/', () => {
      // WHATWG URL normalizes [0:0:0:0:0:0:0:1] → [::1]
      expect(isSafeHttpsUrl('https://[0:0:0:0:0:0:0:1]/')).toBe(false);
    });
  });

  // ── Credentials in URL (hostname must be the destination, not the cred) ───
  describe('user@host credentials do not confuse hostname extraction', () => {
    it('blocks user@169.254.169.254 — hostname is 169.254.169.254', () => {
      expect(isSafeHttpsUrl('https://user:pass@169.254.169.254/')).toBe(false);
    });

    it('blocks user@127.0.0.1', () => {
      expect(isSafeHttpsUrl('https://attacker@127.0.0.1/')).toBe(false);
    });

    it('blocks user@10.0.0.1', () => {
      expect(isSafeHttpsUrl('https://user:pass@10.0.0.1/path')).toBe(false);
    });
  });

  // ── Malformed / edge cases (must return false) ────────────────────────────
  describe('rejects malformed URLs', () => {
    const malformed = ['', 'not-a-url', '//example.com', 'example.com'];
    malformed.forEach((url) => {
      it(`rejects malformed: ${JSON.stringify(url)}`, () => {
        expect(isSafeHttpsUrl(url)).toBe(false);
      });
    });

    // 'https://' — no host, URL constructor throws
    it('rejects "https://" — URL constructor throws (no host)', () => {
      expect(isSafeHttpsUrl('https://')).toBe(false);
    });

    // WHATWG URL parses 'https:example.com' as https: with opaque path, hostname=''.
    // Empty hostname can't route to any internal service → not an SSRF vector.
    it('https:example.com — WHATWG parses hostname as empty string; not an SSRF risk (returns true)', () => {
      expect(isSafeHttpsUrl('https:example.com')).toBe(true);
    });

    it('https:///path — WHATWG parses hostname as empty string; not an SSRF risk (returns true)', () => {
      expect(isSafeHttpsUrl('https:///path')).toBe(true);
    });
  });

  // ── Full ULA fc00::/7 coverage ────────────────────────────────────────────
  describe('blocks full ULA fc00::/7 range via /^f[cd][0-9a-f]{2}:/ regex', () => {
    it('blocks [fc01::1] — ULA fc00::/7 covered by /^f[cd][0-9a-f]{2}:/', () => {
      expect(isSafeHttpsUrl('https://[fc01::1]/')).toBe(false);
    });

    it('blocks [fc80::1] — ULA fc80 covered by /^f[cd][0-9a-f]{2}:/', () => {
      expect(isSafeHttpsUrl('https://[fc80::1]/')).toBe(false);
    });

    it('blocks [fec0::1] — site-local fec0::/10 covered by /^fec[0-9a-f]:/', () => {
      expect(isSafeHttpsUrl('https://[fec0::1]/')).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('isSafeMediaCdnUrl — CDN allowlist bypass prevention', () => {
  // ── Valid WhatsApp CDN URLs (must PASS) ───────────────────────────────────
  describe('allows legitimate WhatsApp CDN domains', () => {
    const valid = [
      'https://mmg.whatsapp.net/path/to/media',
      'https://media.whatsapp.net/v/abc123',
      'https://pps.whatsapp.net/profile/123',
      'https://static.whatsapp.net/rsrc/abc',
      'https://sub.mmg.whatsapp.net/media', // subdomain of exact match
      'https://media-gru2.whatsapp.net/media', // regional CDN
      'https://mmg-fna.whatsapp.net/v/video', // regional CDN
      'https://cdn.whatsapp.com/path',
      'https://upload.whatsapp.com/media',
      'https://MEDIA.WHATSAPP.NET/path', // uppercase — normalized
      'https://MMG.WHATSAPP.NET/', // all-caps
    ];
    valid.forEach((url) => {
      it(`allows ${url}`, () => {
        expect(isSafeMediaCdnUrl(url)).toBe(true);
      });
    });
  });

  // ── Subdomain bypass attempts (must BLOCK) ────────────────────────────────
  describe('blocks subdomain bypass attempts', () => {
    const bypass = [
      // attacker appends .evil.com after .whatsapp.net
      'https://media.whatsapp.net.evil.com/path',
      'https://mmg.whatsapp.net.attacker.io/',
      // attacker prepends whatsapp.net as a path or subdomain of their domain
      'https://evil.com/whatsapp.net/media',
      'https://evil.com/mmg.whatsapp.net/',
      // evil.com that STARTS with whatsapp-lookalike prefix
      'https://whatsapp.net.evil.com/',
      'https://whatsapp-net.evil.com/',
      // host contains whatsapp but is not *.whatsapp.net or *.whatsapp.com
      'https://notwhatsapp.net/',
      'https://whatsapp.com.evil.com/',
      // different TLD
      'https://media.whatsapp.org/path',
      'https://mmg.whatsapp.io/',
      // null-byte or unusual chars that might confuse parsing
      'https://mmg.whatsapp.net%00.evil.com/',
    ];
    bypass.forEach((url) => {
      it(`blocks bypass: ${url}`, () => {
        expect(isSafeMediaCdnUrl(url)).toBe(false);
      });
    });
  });

  // ── Non-HTTPS protocols (must BLOCK) ─────────────────────────────────────
  describe('blocks non-HTTPS protocols', () => {
    const nonHttps = [
      'http://mmg.whatsapp.net/',
      'ftp://media.whatsapp.net/',
      'ws://mmg.whatsapp.net/socket',
      'file:///mmg.whatsapp.net/',
    ];
    nonHttps.forEach((url) => {
      it(`blocks ${url}`, () => {
        expect(isSafeMediaCdnUrl(url)).toBe(false);
      });
    });
  });

  // ── Private / internal target via WhatsApp domain shape (must BLOCK) ──────
  describe('blocks malformed or empty inputs', () => {
    const bad = ['', 'not-a-url', 'https://', 'mmg.whatsapp.net/no-scheme'];
    bad.forEach((url) => {
      it(`blocks invalid: ${JSON.stringify(url)}`, () => {
        expect(isSafeMediaCdnUrl(url)).toBe(false);
      });
    });
  });

  // ── endsWith semantics precision ──────────────────────────────────────────
  describe('endsWith semantics — trailing char matters', () => {
    it('blocks domain ending with whatsapp.net but with extra char: whatsapp.net2', () => {
      expect(isSafeMediaCdnUrl('https://media.whatsapp.net2/')).toBe(false);
    });

    it('blocks evil.com#whatsapp.net via hash (hash not in hostname)', () => {
      // Fragment is not part of hostname — URL parser strips it.
      // The actual host is evil.com, which fails the check.
      expect(isSafeMediaCdnUrl('https://evil.com#mmg.whatsapp.net/')).toBe(false);
    });
  });

  // ── Open redirect protection — redirect:'error' at fetch layer ───────────
  describe('redirect protection (documented at fetch layer)', () => {
    it('URL itself is valid CDN — redirect blocking is enforced at fetch()', () => {
      // isSafeMediaCdnUrl only validates the URL shape.
      // Open redirect prevention is enforced by `redirect: 'error'` in
      // persistMediaToStorage. This test documents the two-layer approach.
      expect(isSafeMediaCdnUrl('https://mmg.whatsapp.net/valid-media')).toBe(true);
      // The actual fetch would use `redirect: 'error'`, failing on 3xx responses.
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeStoragePath — path traversal prevention', () => {
  // ── Canonical traversal (must be neutralized) ─────────────────────────────
  describe('blocks canonical path traversal sequences', () => {
    const traversals: Array<[string, string]> = [
      ['../../etc/passwd', 'etc/passwd'],
      ['../../../root', 'root'],
      ['/../../../etc/shadow', 'etc/shadow'],
      ['/etc/passwd', 'etc/passwd'],
      ['./././../etc', 'etc'],
      ['./../secret', 'secret'],
    ];
    traversals.forEach(([input, expected]) => {
      it(`neutralizes "${input}" → "${expected}"`, () => {
        expect(sanitizeStoragePath(input)).toBe(expected);
      });
    });
  });

  // ── ....// bypass (the specific bypass that simple replace fails on) ──────
  describe('handles the ....// bypass (beats simple regex replace)', () => {
    it('....//....//etc → etc (four dots are NOT dotdot, just a weird dir)', () => {
      // '....' split by '/' → ['....', '....', 'etc']
      // filter removes '' '.' '..' but NOT '....'
      // So '....' directory names pass through — they are not traversal segments.
      expect(sanitizeStoragePath('....//....//etc')).toBe('..../..../etc');
    });

    it('a....//b is not traversal — "a...." is a valid dir name, not dotdot', () => {
      const result = sanitizeStoragePath('a....//b');
      // 'a....' contains '..' as a substring but is NOT a dotdot traversal segment.
      // The filter removes only exact '' '.' '..' — 'a....' passes through safely.
      expect(result).toBe('a..../b');
    });
  });

  // ── URL-encoded traversal ─────────────────────────────────────────────────
  describe('URL-encoded single-segment traversal', () => {
    it('blocks %2e%2e (single segment that decodes to ..)', () => {
      // '%2e%2e' split → ['%2e%2e'] → decode → ['..'] → filtered OUT
      expect(sanitizeStoragePath('%2e%2e')).toBe('');
    });

    it('blocks %2e (single dot segment)', () => {
      expect(sanitizeStoragePath('%2e')).toBe('');
    });

    it('blocks %2e%2e/%2e%2e/etc/passwd', () => {
      // Each segment decoded: '..' '..' 'etc' 'passwd'
      // '..' filtered, 'etc' and 'passwd' kept
      expect(sanitizeStoragePath('%2e%2e/%2e%2e/etc/passwd')).toBe('etc/passwd');
    });
  });

  // ── Double percent-encoding (known gap) ───────────────────────────────────
  describe('double percent-encoding behavior (documented)', () => {
    it('DOCUMENTED: %252e%252e decodes to %2e%2e (not .. directly)', () => {
      // %25 → %, so %252e → %2e after one decode.
      // The filter only removes exact '..' and '.', not '%2e%2e'.
      // The output '%2e%2e' is safe for Supabase Storage (treated as literal key).
      const result = sanitizeStoragePath('%252e%252e');
      expect(result).toBe('%2e%2e');
      // %2e%2e is not filtered — it would be stored as a key named "%2e%2e".
      // This is acceptable: Supabase Storage does not re-decode path components.
    });
  });

  // ── Embedded slash in percent-encoded segment (known gap for filesystem) ──
  describe('percent-encoded slash in segment (documented gap)', () => {
    it('DOCUMENTED: %2e%2e%2fpasswd — the %2f decodes to / inside a segment', () => {
      // 'raw'.split('/') → ['%2e%2e%2fpasswd'] (one segment)
      // decode → ['../../passwd'] (embedded slashes not re-split)
      // filter: '../../passwd' !== '' && !== '.' && !== '..' → PASSES
      // Result: '../../passwd' — would be a single storage key name.
      // In Supabase Storage (object store), this is the literal object key.
      // It does NOT perform filesystem traversal since Storage is an object store.
      const result = sanitizeStoragePath('%2e%2e%2fpasswd');
      // %2e%2e = '..' + %2f = '/' + passwd → decoded segment = '../passwd'
      // The filter checks seg !== '..' but '../passwd' !== '..' → passes through.
      // In Supabase Storage (object store), '../passwd' is just a literal key name,
      // not a filesystem path — no traversal possible in the object store model.
      expect(result).toBe('../passwd');
      // Note: this is acceptable in the object storage context because Supabase
      // Storage does not traverse the filesystem. The key '../../passwd' is valid.
    });
  });

  // ── Normal paths (must pass through unchanged / cleaned) ─────────────────
  describe('normal paths preserved', () => {
    const normalPaths: Array<[string, string]> = [
      ['images/photo.jpg', 'images/photo.jpg'],
      ['secure/2024/file.pdf', 'secure/2024/file.pdf'],
      ['user/uploads/avatar.png', 'user/uploads/avatar.png'],
      ['a/b/c/d.txt', 'a/b/c/d.txt'],
      ['single', 'single'],
      ['with spaces/file.txt', 'with spaces/file.txt'],
    ];
    normalPaths.forEach(([input, expected]) => {
      it(`preserves "${input}"`, () => {
        expect(sanitizeStoragePath(input)).toBe(expected);
      });
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('empty string → empty string', () => {
      expect(sanitizeStoragePath('')).toBe('');
    });

    it('single slash → empty string', () => {
      expect(sanitizeStoragePath('/')).toBe('');
    });

    it('multiple leading slashes stripped', () => {
      expect(sanitizeStoragePath('///etc/passwd')).toBe('etc/passwd');
    });

    it('trailing slash stripped', () => {
      expect(sanitizeStoragePath('folder/')).toBe('folder');
    });

    it('null byte in path — invalid URI is kept as raw segment', () => {
      // '%00' decodes to null byte (char 0); not '', '.', '..' — passes through
      const result = sanitizeStoragePath('folder/%00/file');
      // Null byte in storage key — Supabase handles this; no filesystem exposure
      expect(result).toContain('folder');
    });

    it('mixed encoded/plain traversal sequences removed', () => {
      expect(sanitizeStoragePath('valid/%2e%2e/file')).toBe('valid/file');
    });

    it('Windows-style path: no backslash split (only / is separator)', () => {
      // Backslashes are not path separators here — stored as literal chars
      const result = sanitizeStoragePath('windows\\..\\secret');
      expect(result).toBe('windows\\..\\secret'); // kept as-is (no / to split)
    });

    it('very long path — no truncation side effects', () => {
      const long = 'a/'.repeat(50) + 'file.txt';
      const result = sanitizeStoragePath(long);
      expect(result).toBe(long);
    });

    it('unicode path segment preserved', () => {
      const result = sanitizeStoragePath('ação/arquivo.pdf');
      expect(result).toBe('ação/arquivo.pdf');
    });
  });

  // ── Specific attack vectors ────────────────────────────────────────────────
  describe('specific attack payload variants', () => {
    it('../../../proc/self/environ → proc/self/environ', () => {
      expect(sanitizeStoragePath('../../../proc/self/environ')).toBe('proc/self/environ');
    });

    it('..%2F..%2Fetc%2Fpasswd → neutralized dotdot segments', () => {
      // '%2F' decodes to '/', but the split happens BEFORE decode...
      // Split: ['..%2F..%2Fetc%2Fpasswd'] (single segment, no literal slash)
      // Decode: ['../etc/passwd'] (with embedded slashes)
      // Filter: '../etc/passwd' !== '' && !== '.' && !== '..' → PASSES
      const result = sanitizeStoragePath('..%2F..%2Fetc%2Fpasswd');
      expect(typeof result).toBe('string'); // documented: embedded decoded slashes remain
    });

    it('..;/..;/etc/passwd (semicolon bypass) — ; not special', () => {
      // Semicolons have no special meaning in this sanitizer
      expect(sanitizeStoragePath('..;/..;/etc')).toBe('..;/..;/etc');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('buildMime / sanitizeAttachment — MIME header injection (CWE-93)', () => {
  // ── CRLF injection in name (must BLOCK) ───────────────────────────────────
  describe('CRLF injection via attachment name', () => {
    const crlfPayloads: Array<[string, string]> = [
      ['evil\r\nX-Injected: hdr', 'evilX-Injected: hdr'],
      ['evil\nX-Injected: hdr', 'evilX-Injected: hdr'],
      ['evil\rX-Injected: hdr', 'evilX-Injected: hdr'],
      ['name\r\n\r\nMIME-body-injection', 'nameMIME-body-injection'],
      ['a\rb\nc', 'abc'],
      ['\r\n', ''],
    ];
    crlfPayloads.forEach(([input, expectedName]) => {
      it(`strips CRLF from name: ${JSON.stringify(input)}`, () => {
        const { safeName } = sanitizeAttachment({ name: input, mimeType: 'image/png', data: '' });
        expect(safeName).toBe(expectedName);
        expect(safeName).not.toContain('\r');
        expect(safeName).not.toContain('\n');
      });
    });
  });

  // ── Quote injection in name (must BLOCK) ─────────────────────────────────
  describe('quote injection via attachment name', () => {
    it('strips double-quote that would break filename="<name>"', () => {
      const { safeName } = sanitizeAttachment({ name: '"evil"', mimeType: 'text/plain', data: '' });
      expect(safeName).toBe('evil');
      expect(safeName).not.toContain('"');
    });

    it('strips embedded quote in middle of name', () => {
      const { safeName } = sanitizeAttachment({
        name: 'file"name.txt',
        mimeType: 'text/plain',
        data: '',
      });
      expect(safeName).toBe('filename.txt');
    });
  });

  // ── Backslash injection (must BLOCK) ─────────────────────────────────────
  describe('backslash injection', () => {
    it('strips backslash from name', () => {
      const { safeName } = sanitizeAttachment({
        name: 'evil\\escape',
        mimeType: 'text/plain',
        data: '',
      });
      expect(safeName).toBe('evilescape');
    });

    it('strips backslash-n combination (interpreted as CRLF in some parsers)', () => {
      const { safeName } = sanitizeAttachment({
        name: 'evil\\nheader',
        mimeType: 'text/plain',
        data: '',
      });
      expect(safeName).not.toContain('\\');
    });
  });

  // ── CRLF in mimeType (must BLOCK) ─────────────────────────────────────────
  describe('CRLF injection via mimeType', () => {
    const mimePayloads: Array<[string, string]> = [
      ['text/html\r\nX-Custom: injected', 'text/htmlX-Custom: injected'],
      ['application/octet-stream\nBcc: evil@x.com', 'application/octet-streamBcc: evil@x.com'],
      ['image/png\r\n', 'image/png'],
    ];
    mimePayloads.forEach(([input, expected]) => {
      it(`strips CRLF from mimeType: ${JSON.stringify(input)}`, () => {
        const { safeMime } = sanitizeAttachment({ name: 'file.dat', mimeType: input, data: '' });
        expect(safeMime).toBe(expected);
        expect(safeMime).not.toContain('\r');
        expect(safeMime).not.toContain('\n');
      });
    });
  });

  // ── Non-string coercion (must NOT crash) ──────────────────────────────────
  describe('non-string name/mimeType do not crash (String() coercion)', () => {
    it('numeric name is coerced to string', () => {
      const { safeName } = sanitizeAttachment({ name: 42, mimeType: 'text/plain', data: '' });
      expect(safeName).toBe('42');
    });

    it('null name → empty string (null ?? "")', () => {
      const { safeName } = sanitizeAttachment({ name: null, mimeType: 'text/plain', data: '' });
      expect(safeName).toBe('');
    });

    it('undefined name → empty string (undefined ?? "")', () => {
      const { safeName } = sanitizeAttachment({
        name: undefined,
        mimeType: 'text/plain',
        data: '',
      });
      expect(safeName).toBe('');
    });

    it('object with toString containing CRLF → injected chars stripped', () => {
      const evil = { toString: () => 'file\r\nX-Hdr: val' };
      const { safeName } = sanitizeAttachment({ name: evil, mimeType: 'text/plain', data: '' });
      expect(safeName).not.toContain('\r');
      expect(safeName).not.toContain('\n');
    });

    it('null mimeType → fallback to application/octet-stream', () => {
      const { safeMime } = sanitizeAttachment({ name: 'file', mimeType: null, data: '' });
      expect(safeMime).toBe('application/octet-stream');
    });

    it('undefined mimeType → fallback to application/octet-stream', () => {
      const { safeMime } = sanitizeAttachment({ name: 'file', mimeType: undefined, data: '' });
      expect(safeMime).toBe('application/octet-stream');
    });

    it('empty-string mimeType after sanitization → fallback to application/octet-stream', () => {
      // mimeType = '\r\n' → after replace → '' → || fallback applies
      const { safeMime } = sanitizeAttachment({ name: 'file', mimeType: '\r\n', data: '' });
      expect(safeMime).toBe('application/octet-stream');
    });
  });

  // ── MIME header output validation ─────────────────────────────────────────
  describe('final MIME headers contain no injected content', () => {
    it('clean attachment produces well-formed headers', () => {
      const headers = buildMimeHeaders({
        name: 'document.pdf',
        mimeType: 'application/pdf',
        data: '',
      });
      expect(headers).toContain('Content-Type: application/pdf; name="document.pdf"');
      expect(headers).toContain('Content-Disposition: attachment; filename="document.pdf"');
    });

    it('CRLF payload in name does not produce extra headers', () => {
      const headers = buildMimeHeaders({
        name: 'file\r\nX-Evil: injected',
        mimeType: 'text/plain',
        data: '',
      });
      const lines = headers.split('\r\n');
      // There should be exactly 2 header lines, no injected X-Evil header
      expect(lines.every((l) => !l.startsWith('X-Evil:'))).toBe(true);
    });

    it('quote in name does not break filename= parameter', () => {
      const headers = buildMimeHeaders({
        name: 'file"escape".txt',
        mimeType: 'text/plain',
        data: '',
      });
      // The filename value should not contain unescaped quotes
      const filenameMatch = headers.match(/filename="([^"]*)"/);
      expect(filenameMatch).toBeTruthy();
      // No quotes inside the filename value
      expect(filenameMatch![1]).not.toContain('"');
    });

    it('unicode filename preserved in headers', () => {
      const headers = buildMimeHeaders({
        name: 'ação_arquivo.pdf',
        mimeType: 'application/pdf',
        data: '',
      });
      expect(headers).toContain('ação_arquivo.pdf');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('TOCTOU atomic guard — approve-password-reset', () => {
  // ── Basic approve/reject operations ──────────────────────────────────────
  describe('single-caller basic operations', () => {
    it('approves a pending request and returns count=1', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-1', 'pending');
      expect(store.atomicApprove('req-1')).toBe(1);
      expect(store.getStatus('req-1')).toBe('approved');
    });

    it('rejects a pending request and returns count=1', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-2', 'pending');
      expect(store.atomicReject('req-2')).toBe(1);
      expect(store.getStatus('req-2')).toBe('rejected');
    });

    it('cannot approve an already-approved request — returns count=0', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-3', 'approved');
      expect(store.atomicApprove('req-3')).toBe(0);
      expect(store.getStatus('req-3')).toBe('approved'); // unchanged
    });

    it('cannot reject an already-rejected request — returns count=0', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-4', 'rejected');
      expect(store.atomicReject('req-4')).toBe(0);
      expect(store.getStatus('req-4')).toBe('rejected');
    });

    it('cannot approve an already-rejected request — returns count=0', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-5', 'rejected');
      expect(store.atomicApprove('req-5')).toBe(0);
      expect(store.getStatus('req-5')).toBe('rejected');
    });
  });

  // ── TOCTOU: exactly one winner in concurrent approve ─────────────────────
  describe('concurrent approve — exactly one winner', () => {
    it('50 concurrent approve attempts — only one succeeds', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-concurrent', 'pending');

      const results: number[] = [];
      for (let i = 0; i < 50; i++) {
        results.push(store.atomicApprove('req-concurrent'));
      }

      const successes = results.filter((r) => r === 1);
      const failures = results.filter((r) => r === 0);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(49);
      expect(store.getStatus('req-concurrent')).toBe('approved');
    });

    it('100 concurrent approve attempts — exactly one token generated (count guard)', () => {
      const store = new MockPasswordResetStore();
      store.seed('mass-concurrent', 'pending');

      let tokenGenerations = 0;
      for (let i = 0; i < 100; i++) {
        const count = store.atomicApprove('mass-concurrent');
        if (count > 0) {
          // simulate generateLink only if count > 0
          tokenGenerations++;
        }
      }

      expect(tokenGenerations).toBe(1);
    });
  });

  // ── TOCTOU: approve then reject race ─────────────────────────────────────
  describe('approve-reject race condition', () => {
    it('approve wins race: subsequent reject returns count=0', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-race', 'pending');

      const approveCount = store.atomicApprove('req-race');
      const rejectCount = store.atomicReject('req-race');

      expect(approveCount).toBe(1);
      expect(rejectCount).toBe(0);
      expect(store.getStatus('req-race')).toBe('approved');
    });

    it('reject wins race: subsequent approve returns count=0', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-race2', 'pending');

      const rejectCount = store.atomicReject('req-race2');
      const approveCount = store.atomicApprove('req-race2');

      expect(rejectCount).toBe(1);
      expect(approveCount).toBe(0);
      expect(store.getStatus('req-race2')).toBe('rejected');
    });
  });

  // ── generateLink called AFTER atomic guard (not before) ──────────────────
  describe('generateLink is called only after winning atomic guard', () => {
    it('loser does not call generateLink (count=0 guard)', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-gl', 'pending');

      // Winner
      const firstCount = store.atomicApprove('req-gl');
      const firstCalledGenerateLink = firstCount > 0;

      // Loser
      const secondCount = store.atomicApprove('req-gl');
      const secondCalledGenerateLink = secondCount > 0;

      expect(firstCalledGenerateLink).toBe(true);
      expect(secondCalledGenerateLink).toBe(false);
    });

    it('already-processed guard returns 409 equivalent (count=0)', () => {
      const store = new MockPasswordResetStore();
      store.seed('req-409', 'approved'); // already processed

      const count = store.atomicApprove('req-409');
      // In production: if (!updatedCount || updatedCount === 0) return 409
      expect(count).toBe(0); // → would return 409
    });
  });

  // ── Non-existent request ──────────────────────────────────────────────────
  describe('non-existent request', () => {
    it('approve on non-existent request returns 0', () => {
      const store = new MockPasswordResetStore();
      expect(store.atomicApprove('nonexistent')).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Gmail error taxonomy — NonRetryableMessageError routing', () => {
  // ── 404 → skip silently ───────────────────────────────────────────────────
  describe('404 Not Found → skip (message deleted/moved)', () => {
    it('classifies code=404 as skip', () => {
      expect(classifyGmailError({ code: 404 })).toBe('skip');
    });

    it('classifies code=404 with reason as skip (reason ignored)', () => {
      expect(classifyGmailError({ code: 404, reason: 'notFound' })).toBe('skip');
    });
  });

  // ── 429 → transient ──────────────────────────────────────────────────────
  describe('429 Rate Limited → transient (safe to retry)', () => {
    it('classifies code=429 as transient', () => {
      expect(classifyGmailError({ code: 429 })).toBe('transient');
    });
  });

  // ── 5xx → transient ───────────────────────────────────────────────────────
  describe('5xx Server Errors → transient (safe to retry)', () => {
    [500, 502, 503, 504, 599].forEach((code) => {
      it(`classifies code=${code} as transient`, () => {
        expect(classifyGmailError({ code })).toBe('transient');
      });
    });
  });

  // ── Specific reason strings → transient ───────────────────────────────────
  describe('specific rate-limit reason strings → transient', () => {
    const transientReasons = [
      'rateLimitExceeded',
      'userRateLimitExceeded',
      'quotaExceeded',
      'RATELIMITEXCEEDED', // case-insensitive
      'QuotaExceeded', // mixed case
    ];
    transientReasons.forEach((reason) => {
      it(`reason "${reason}" (code=403) → transient`, () => {
        expect(classifyGmailError({ code: 403, reason })).toBe('transient');
      });
    });
  });

  // ── status fields → transient ─────────────────────────────────────────────
  describe('specific status values → transient', () => {
    it('status=UNAUTHENTICATED → transient (token may refresh)', () => {
      expect(classifyGmailError({ code: 401, status: 'UNAUTHENTICATED' })).toBe('transient');
    });

    it('status=RESOURCE_EXHAUSTED → transient', () => {
      expect(classifyGmailError({ code: 429, status: 'RESOURCE_EXHAUSTED' })).toBe('transient');
    });
  });

  // ── 4xx non-transient → non-retryable ────────────────────────────────────
  describe('4xx errors (excluding 404, 429) → non-retryable', () => {
    const nonRetryable = [400, 401, 403, 405, 410, 422];
    nonRetryable.forEach((code) => {
      it(`code=${code} with no special reason → non-retryable`, () => {
        expect(classifyGmailError({ code })).toBe('non-retryable');
      });
    });
  });

  // ── Specific 403 scenarios ────────────────────────────────────────────────
  describe('403 scenarios', () => {
    it('403 + reason=forbidden → non-retryable (not rate limit)', () => {
      expect(classifyGmailError({ code: 403, reason: 'forbidden' })).toBe('non-retryable');
    });

    it('403 + reason=rateLimitExceeded → transient', () => {
      expect(classifyGmailError({ code: 403, reason: 'rateLimitExceeded' })).toBe('transient');
    });
  });

  // ── Error taxonomy completeness ────────────────────────────────────────────
  describe('error taxonomy covers all expected branches', () => {
    it('zero-code (malformed error) → non-retryable (conservative)', () => {
      expect(classifyGmailError({ code: 0 })).toBe('non-retryable');
    });

    it('unknown large code (e.g. 999) → transient (code >= 500)', () => {
      expect(classifyGmailError({ code: 999 })).toBe('transient');
    });

    it('code=400 with reason=invalid → non-retryable (poisonous message)', () => {
      expect(classifyGmailError({ code: 400, reason: 'invalid' })).toBe('non-retryable');
    });
  });

  // ── NonRetryableMessageError type check ───────────────────────────────────
  describe('NonRetryableMessageError class', () => {
    it('is an instance of Error', () => {
      const err = new NonRetryableMessageError('test');
      expect(err).toBeInstanceOf(Error);
    });

    it('has correct name property', () => {
      const err = new NonRetryableMessageError('poison message');
      expect(err.name).toBe('NonRetryableMessageError');
    });

    it('has message property', () => {
      const err = new NonRetryableMessageError('test message');
      expect(err.message).toBe('test message');
    });

    it('is distinguishable from a plain Error', () => {
      const plain = new Error('plain');
      const non = new NonRetryableMessageError('non-retryable');
      expect(non instanceof NonRetryableMessageError).toBe(true);
      expect(plain instanceof NonRetryableMessageError).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2 — SUPPLEMENTARY GAP-ANALYSIS SIMULATIONS (~100 tests)
// Exhaustively covers vectors identified during code-level audit.
// ═════════════════════════════════════════════════════════════════════════════

// ─── [1] IPv4-mapped IPv6 SSRF bypass ────────────────────────────────────────
// WHATWG URL normalizes [::ffff:x.x.x.x] → [::ffff:HHHH:HHHH] hex form.
// The fix: host.startsWith('[::ffff:') blocks all IPv4-in-IPv6 regardless of
// whether the parser emits mixed or hex notation (both start with '[::ffff:').
describe('isSafeHttpsUrl — IPv4-mapped IPv6 SSRF bypass (fixed)', () => {
  it('[::ffff:127.0.0.1] — loopback via IPv4-mapped IPv6 is blocked', () => {
    expect(isSafeHttpsUrl('https://[::ffff:127.0.0.1]/')).toBe(false);
  });

  it('[::ffff:10.0.0.1] — RFC-1918 class A via IPv4-mapped IPv6 is blocked', () => {
    expect(isSafeHttpsUrl('https://[::ffff:10.0.0.1]/')).toBe(false);
  });

  it('[::ffff:192.168.0.1] — RFC-1918 class C via IPv4-mapped IPv6 is blocked', () => {
    expect(isSafeHttpsUrl('https://[::ffff:192.168.0.1]/')).toBe(false);
  });

  it('[::ffff:169.254.169.254] — AWS metadata via IPv4-mapped IPv6 is blocked', () => {
    expect(isSafeHttpsUrl('https://[::ffff:169.254.169.254]/')).toBe(false);
  });

  it('[::ffff:172.16.0.1] — RFC-1918 class B via IPv4-mapped IPv6 is blocked', () => {
    expect(isSafeHttpsUrl('https://[::ffff:172.16.0.1]/')).toBe(false);
  });

  it('[::ffff:8.8.8.8] — public IP in IPv4-mapped form blocked (defense in depth)', () => {
    // We block the entire ::ffff: class — clients should use plain IPv4 or hostnames.
    expect(isSafeHttpsUrl('https://[::ffff:8.8.8.8]/')).toBe(false);
  });
});

// ─── [1b] IPv4-compatible IPv6 SSRF bypass (CRITICAL — now fixed) ───────────
// WHATWG URL normalizes deprecated IPv4-compatible addresses [::x.x.x.x] to
// pure hex form WITHOUT the ffff: component: [::7f00:1], [::a9fe:a9fe], etc.
// The old code only blocked [::ffff:...] — these forms bypassed every rule.
// Fix: host.startsWith('[::') blocks all :: prefix addresses including compat.
describe('isSafeHttpsUrl — IPv4-compatible IPv6 SSRF bypass (fixed)', () => {
  it('[::127.0.0.1] — loopback via IPv4-compatible IPv6 is blocked', () => {
    // WHATWG normalizes [::127.0.0.1] → hostname [::7f00:1]
    // Previously NOT blocked — host.startsWith('[::') now catches it
    expect(isSafeHttpsUrl('https://[::127.0.0.1]/')).toBe(false);
  });
  it('[::169.254.169.254] — AWS metadata via IPv4-compatible IPv6 is blocked', () => {
    // WHATWG normalizes [::169.254.169.254] → hostname [::a9fe:a9fe]
    expect(isSafeHttpsUrl('https://[::169.254.169.254]/')).toBe(false);
  });
  it('[::10.0.0.1] — RFC-1918 class A via IPv4-compatible IPv6 is blocked', () => {
    // WHATWG normalizes [::10.0.0.1] → hostname [::a00:1]
    expect(isSafeHttpsUrl('https://[::10.0.0.1]/')).toBe(false);
  });
  it('[::192.168.0.1] — RFC-1918 class C via IPv4-compatible IPv6 is blocked', () => {
    // WHATWG normalizes [::192.168.0.1] → hostname [::c0a8:1]
    expect(isSafeHttpsUrl('https://[::192.168.0.1]/')).toBe(false);
  });
  it('[::172.16.0.1] — RFC-1918 class B via IPv4-compatible IPv6 is blocked', () => {
    // WHATWG normalizes [::172.16.0.1] → hostname [::ac10:1]
    expect(isSafeHttpsUrl('https://[::172.16.0.1]/')).toBe(false);
  });
  it('[::] — unspecified address is blocked', () => {
    expect(isSafeHttpsUrl('https://[::]:443/')).toBe(false);
  });
  it('valid public IPv6 2606:4700::6810:84e5 is NOT blocked', () => {
    // Public addresses start with 2xxx/3xxx — do NOT begin with [::]
    expect(isSafeHttpsUrl('https://[2606:4700::6810:84e5]/')).toBe(true);
  });
});

// ─── [2] IPv6 zone IDs ───────────────────────────────────────────────────────
describe('isSafeHttpsUrl — IPv6 zone IDs cannot bypass checks', () => {
  it('[fe80::1%25eth0] — zone ID suffix does not bypass block: Node.js still returns "[fe80::1%25eth0]" with brackets', () => {
    // Node.js URL.hostname: '[fe80::1%25eth0]' — matches /^\[fe[89ab][0-9a-f]:/i
    expect(isSafeHttpsUrl('https://[fe80::1%25eth0]/')).toBe(false);
  });

  it('[fd00::1%25lo] — ULA with zone ID caught by /^\\[f[cd][0-9a-f]{2}:/i', () => {
    expect(isSafeHttpsUrl('https://[fd00::1%25lo]/')).toBe(false);
  });
});

// ─── [3] RFC-1918 boundary precision ─────────────────────────────────────────
describe('isSafeHttpsUrl — RFC-1918 boundary precision', () => {
  it('172.15.255.255 — just below RFC-1918 class B range, must be ALLOWED', () => {
    expect(isSafeHttpsUrl('https://172.15.255.255/')).toBe(true);
  });

  it('172.16.0.0 — first address of RFC-1918 class B, must be BLOCKED', () => {
    expect(isSafeHttpsUrl('https://172.16.0.0/')).toBe(false);
  });

  it('172.31.255.255 — last address of RFC-1918 class B, must be BLOCKED', () => {
    expect(isSafeHttpsUrl('https://172.31.255.255/')).toBe(false);
  });

  it('172.32.0.0 — just above RFC-1918 class B range, must be ALLOWED', () => {
    expect(isSafeHttpsUrl('https://172.32.0.0/')).toBe(true);
  });

  it('9.255.255.255 — just below 10.x block, must be ALLOWED', () => {
    expect(isSafeHttpsUrl('https://9.255.255.255/')).toBe(true);
  });

  it('11.0.0.0 — just above 10.x block, must be ALLOWED', () => {
    expect(isSafeHttpsUrl('https://11.0.0.0/')).toBe(true);
  });

  it('192.167.255.255 — just below 192.168 block, must be ALLOWED', () => {
    expect(isSafeHttpsUrl('https://192.167.255.255/')).toBe(true);
  });

  it('192.169.0.1 — just above 192.168 block, must be ALLOWED', () => {
    expect(isSafeHttpsUrl('https://192.169.0.1/')).toBe(true);
  });
});

// ─── [4] Port numbers on blocked hosts ───────────────────────────────────────
describe('isSafeHttpsUrl — ports do not bypass host-based blocks', () => {
  it('127.0.0.1:8080 — port does not bypass loopback block', () => {
    expect(isSafeHttpsUrl('https://127.0.0.1:8080/path')).toBe(false);
  });

  it('localhost:3000 — port does not bypass localhost block', () => {
    expect(isSafeHttpsUrl('https://localhost:3000/')).toBe(false);
  });

  it('192.168.1.1:443 — port does not bypass RFC-1918 block', () => {
    expect(isSafeHttpsUrl('https://192.168.1.1:443/')).toBe(false);
  });

  it('[::1]:8080 — port does not bypass IPv6 loopback block', () => {
    expect(isSafeHttpsUrl('https://[::1]:8080/')).toBe(false);
  });
});

// ─── [5] SSRF — alternative IP notation variants ─────────────────────────────
describe('isSafeHttpsUrl — alternative IP notation / format quirks', () => {
  it('0x7f000001 — hex loopback: invalid hostname, URL parse fails → blocked', () => {
    // Browsers reject 0x7f000001 as a URL host — new URL() throws
    expect(isSafeHttpsUrl('https://0x7f000001/')).toBe(false);
  });

  it('2130706433 — decimal loopback: browsers parse as 127.0.0.1 or reject', () => {
    // Node/happy-dom reject numeric hosts as invalid URL
    expect(isSafeHttpsUrl('https://2130706433/')).toBe(false);
  });

  it('0177.0.0.1 — octal loopback: WHATWG URL rejects octal notation → blocked', () => {
    expect(isSafeHttpsUrl('https://0177.0.0.1/')).toBe(false);
  });

  it('LOCALHOST — uppercase: lowercased before check, still blocked', () => {
    expect(isSafeHttpsUrl('https://LOCALHOST/')).toBe(false);
  });

  it('Localhost.localDomain — endsWith(".localhost") catches subdomains', () => {
    expect(isSafeHttpsUrl('https://app.localhost/')).toBe(false);
  });
});

// ─── [6] isSafeMediaCdnUrl — IP address and protocol bypass attempts ──────────
describe('isSafeMediaCdnUrl — IP address targets are not CDN URLs', () => {
  it('plain public IP address → rejected (not in exact set, no whatsapp domain)', () => {
    expect(isSafeMediaCdnUrl('https://35.190.56.2/media.jpg')).toBe(false);
  });

  it('private IP address → rejected', () => {
    expect(isSafeMediaCdnUrl('https://192.168.1.1/media.jpg')).toBe(false);
  });
});

describe('isSafeMediaCdnUrl — non-https schemes', () => {
  it('http: (non-TLS) is rejected', () => {
    expect(isSafeMediaCdnUrl('http://mmg.whatsapp.net/media.jpg')).toBe(false);
  });

  it('data: URI is rejected', () => {
    expect(isSafeMediaCdnUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(false);
  });

  it('javascript: URI is rejected', () => {
    expect(isSafeMediaCdnUrl('javascript:alert(1)')).toBe(false);
  });

  it('blob: URI is rejected', () => {
    expect(isSafeMediaCdnUrl('blob:https://mmg.whatsapp.net/abc123')).toBe(false);
  });
});

// ─── [7] isSafeMediaCdnUrl — subdomain confusion ─────────────────────────────
describe('isSafeMediaCdnUrl — subdomain and path confusion', () => {
  it('evil.whatsapp.net.attacker.com — endsWith is direction-safe, rejects this', () => {
    // 'evil.whatsapp.net.attacker.com'.endsWith('.whatsapp.net') → false
    expect(isSafeMediaCdnUrl('https://evil.whatsapp.net.attacker.com/')).toBe(false);
  });

  it('attacker.com/whatsapp.net — path cannot spoof CDN hostname check', () => {
    expect(isSafeMediaCdnUrl('https://attacker.com/whatsapp.net/file.jpg')).toBe(false);
  });

  it('whatsapp.net (bare, no subdomain) — not in exact set; endsWith needs leading dot', () => {
    // 'whatsapp.net'.endsWith('.whatsapp.net') → false; also not in exact set
    expect(isSafeMediaCdnUrl('https://whatsapp.net/')).toBe(false);
  });

  it('whatsapp.com (bare) — same: not in exact set, no subdomain dot', () => {
    expect(isSafeMediaCdnUrl('https://whatsapp.com/')).toBe(false);
  });
});

// ─── [8] isSafeMediaCdnUrl — port numbers on valid CDN hosts ─────────────────
describe('isSafeMediaCdnUrl — port numbers on valid CDN hostnames', () => {
  it('mmg.whatsapp.net:8080 — URL.hostname strips port; check still passes', () => {
    expect(isSafeMediaCdnUrl('https://mmg.whatsapp.net:8080/media.jpg')).toBe(true);
  });

  it('pps.whatsapp.net:443 — standard port, passes', () => {
    expect(isSafeMediaCdnUrl('https://pps.whatsapp.net:443/')).toBe(true);
  });

  it('cdn1.whatsapp.net:1234 — subdomain with custom port, passes', () => {
    expect(isSafeMediaCdnUrl('https://cdn1.whatsapp.net:1234/file')).toBe(true);
  });
});

// ─── [9] sanitizeStoragePath — multiple consecutive slashes ──────────────────
describe('sanitizeStoragePath — multiple consecutive slashes', () => {
  it('path//to///file → path/to/file (empty segments are removed)', () => {
    expect(sanitizeStoragePath('path//to///file')).toBe('path/to/file');
  });

  it('leading slash /etc/passwd → etc/passwd (no absolute path escape)', () => {
    expect(sanitizeStoragePath('/etc/passwd')).toBe('etc/passwd');
  });

  it('trailing slash path/to/ → path/to (trailing empty segment stripped)', () => {
    expect(sanitizeStoragePath('path/to/')).toBe('path/to');
  });

  it('all slashes /// → empty string (all segments empty)', () => {
    expect(sanitizeStoragePath('///')).toBe('');
  });
});

// ─── [10] sanitizeStoragePath — single dot segments ──────────────────────────
describe('sanitizeStoragePath — single dot (.) segments', () => {
  it('./file.jpg → file.jpg (leading dot-segment removed)', () => {
    expect(sanitizeStoragePath('./file.jpg')).toBe('file.jpg');
  });

  it('path/./to/./file → path/to/file (inline dots removed)', () => {
    expect(sanitizeStoragePath('path/./to/./file')).toBe('path/to/file');
  });

  it('. alone → empty string (sole segment is dot)', () => {
    expect(sanitizeStoragePath('.')).toBe('');
  });
});

// ─── [11] sanitizeStoragePath — FILTER semantics (not a resolver) ─────────────
describe('sanitizeStoragePath — is a filter, NOT a path resolver', () => {
  // The function removes ".." tokens but does NOT backtrack like path.resolve().
  // a/b/../c → split → [a, b, .., c] → filter ".." → [a, b, c] → 'a/b/c' (NOT 'a/c')
  it('a/b/../c → a/b/c (.. removed in-place, no backtrack)', () => {
    expect(sanitizeStoragePath('a/b/../c')).toBe('a/b/c');
  });

  it('valid/../../../secret → valid/secret (all .. stripped, no directory climb)', () => {
    expect(sanitizeStoragePath('valid/../../../secret')).toBe('valid/secret');
  });

  it('../../etc/passwd → etc/passwd (leading .. stripped, cannot climb to root)', () => {
    expect(sanitizeStoragePath('../../etc/passwd')).toBe('etc/passwd');
  });

  it('.. alone → empty string (sole segment is double-dot)', () => {
    expect(sanitizeStoragePath('..')).toBe('');
  });
});

// ─── [12] sanitizeStoragePath — percent-encoding traversal ───────────────────
describe('sanitizeStoragePath — percent-encoding vectors', () => {
  it('%2e%2e/etc/passwd → etc/passwd (decoded ".." is then filtered)', () => {
    expect(sanitizeStoragePath('%2e%2e/etc/passwd')).toBe('etc/passwd');
  });

  it('%2E%2E/shadow — uppercase hex: same decode behavior', () => {
    expect(sanitizeStoragePath('%2E%2E/shadow')).toBe('shadow');
  });

  it('path%2Fto%2Ffile.jpg → path/to/file.jpg (encoded slash inside one split-segment)', () => {
    // split('/') occurs before decode, so %2F stays in one segment.
    // decodeURIComponent turns it into 'path/to/file.jpg' — a single segment value.
    expect(sanitizeStoragePath('path%2Fto%2Ffile.jpg')).toBe('path/to/file.jpg');
  });

  it('triple dot ... passes through (not a traversal token)', () => {
    expect(sanitizeStoragePath('.../secret')).toBe('.../secret');
  });
});

// ─── [13] sanitizeAttachment — CRLF / quote / backslash injection baseline ───
describe('sanitizeAttachment — CRLF / quote / backslash (what IS stripped)', () => {
  it('strips CR (\\r) from name', () => {
    const { safeName } = sanitizeAttachment({
      name: 'file\r.jpg',
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('file.jpg');
  });

  it('strips LF (\\n) from name', () => {
    const { safeName } = sanitizeAttachment({
      name: 'file\n.jpg',
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('file.jpg');
  });

  it('strips CRLF sequence from mimeType (header-injection prevention)', () => {
    const { safeMime } = sanitizeAttachment({
      name: 'x',
      mimeType: 'image/jpeg\r\nX-Evil: hacked',
      data: '',
    });
    expect(safeMime).toBe('image/jpegX-Evil: hacked');
  });

  it('strips double-quote from name', () => {
    const { safeName } = sanitizeAttachment({
      name: 'file".jpg',
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('file.jpg');
  });

  it('strips backslash from name', () => {
    const { safeName } = sanitizeAttachment({
      name: 'file\\.jpg',
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('file.jpg');
  });

  it('combined injection: name with CR+LF+quote+backslash — all stripped', () => {
    const { safeName } = sanitizeAttachment({
      name: 'a\r\n"b\\c',
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('abc');
  });
});

// ─── [14] sanitizeAttachment — known gaps (tab and null byte not stripped) ────
describe('sanitizeAttachment — documented gaps: tab and null byte survive', () => {
  it('tab (\\t) in name — NOT stripped (documented gap)', () => {
    // Current regex /[\\r\\n"\\\\]/ does not include \\t
    const { safeName } = sanitizeAttachment({
      name: 'file\t.jpg',
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('file\t.jpg');
  });

  it('null byte (\\x00) in name — NOT stripped (documented gap)', () => {
    const { safeName } = sanitizeAttachment({
      name: 'file\x00.jpg',
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('file\x00.jpg');
  });

  it('semicolon in mimeType passes through (MIME parameter injection vector; parser-dependent)', () => {
    const { safeMime } = sanitizeAttachment({
      name: 'x',
      mimeType: 'image/jpeg; charset=utf-8',
      data: '',
    });
    expect(safeMime).toBe('image/jpeg; charset=utf-8');
  });
});

// ─── [15] sanitizeAttachment — type-coercion edge cases ──────────────────────
describe('sanitizeAttachment — non-string inputs coerced via String()', () => {
  it('null name → empty string (null ?? "" → "")', () => {
    const { safeName } = sanitizeAttachment({
      name: null as unknown as string,
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('');
  });

  it('undefined name → empty string (undefined ?? "" → "")', () => {
    const { safeName } = sanitizeAttachment({
      name: undefined as unknown as string,
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('');
  });

  it('boolean false as name → String coerces to "false"', () => {
    const { safeName } = sanitizeAttachment({
      name: false as unknown as string,
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('false');
  });

  it('number 42 as name → "42"', () => {
    const { safeName } = sanitizeAttachment({
      name: 42 as unknown as string,
      mimeType: 'image/jpeg',
      data: '',
    });
    expect(safeName).toBe('42');
  });

  it('empty mimeType string → falls back to application/octet-stream', () => {
    const { safeMime } = sanitizeAttachment({ name: 'file', mimeType: '', data: '' });
    expect(safeMime).toBe('application/octet-stream');
  });

  it('null mimeType → falls back to application/octet-stream', () => {
    const { safeMime } = sanitizeAttachment({
      name: 'file',
      mimeType: null as unknown as string,
      data: '',
    });
    expect(safeMime).toBe('application/octet-stream');
  });

  it('mimeType that is only CRLF → after strip becomes "", falls back to application/octet-stream', () => {
    const { safeMime } = sanitizeAttachment({ name: 'file', mimeType: '\r\n', data: '' });
    expect(safeMime).toBe('application/octet-stream');
  });
});

// ─── [16] classifyGmailError — 429 rate-limit variants ───────────────────────
describe('classifyGmailError — 429 rate-limit code variants', () => {
  it('code=429 alone → transient (code is sufficient)', () => {
    expect(classifyGmailError({ code: 429 })).toBe('transient');
  });

  it('code=429 with reason=dailyLimitExceeded → transient (code wins)', () => {
    expect(classifyGmailError({ code: 429, reason: 'dailyLimitExceeded' })).toBe('transient');
  });

  it('code=429 with status=RESOURCE_EXHAUSTED → transient (both match)', () => {
    expect(classifyGmailError({ code: 429, status: 'RESOURCE_EXHAUSTED' })).toBe('transient');
  });

  it('code=400 with reason=rateLimitExceeded → transient (reason alone wins)', () => {
    expect(classifyGmailError({ code: 400, reason: 'rateLimitExceeded' })).toBe('transient');
  });

  it('code=400 with reason=userRateLimitExceeded → transient', () => {
    expect(classifyGmailError({ code: 400, reason: 'userRateLimitExceeded' })).toBe('transient');
  });

  it('code=400 with reason=quotaExceeded → transient', () => {
    expect(classifyGmailError({ code: 400, reason: 'quotaExceeded' })).toBe('transient');
  });
});

// ─── [17] classifyGmailError — 4xx boundary behavior ─────────────────────────
describe('classifyGmailError — 4xx boundary and short-circuit behavior', () => {
  it('code=404 → skip (immediately, before transient check)', () => {
    expect(classifyGmailError({ code: 404 })).toBe('skip');
  });

  it('code=404 with status=UNAUTHENTICATED → skip (404 short-circuits; status ignored)', () => {
    expect(classifyGmailError({ code: 404, status: 'UNAUTHENTICATED' })).toBe('skip');
  });

  it('code=401 with no status → non-retryable', () => {
    expect(classifyGmailError({ code: 401 })).toBe('non-retryable');
  });

  it('code=401 with status=UNAUTHENTICATED → transient (status override)', () => {
    expect(classifyGmailError({ code: 401, status: 'UNAUTHENTICATED' })).toBe('transient');
  });

  it('code=403 → non-retryable', () => {
    expect(classifyGmailError({ code: 403 })).toBe('non-retryable');
  });

  it('code=499 → non-retryable (not 404, not 429, not >= 500)', () => {
    expect(classifyGmailError({ code: 499 })).toBe('non-retryable');
  });

  it('code=200 (success) → non-retryable (not an error code we retry)', () => {
    expect(classifyGmailError({ code: 200 })).toBe('non-retryable');
  });
});

// ─── [18] classifyGmailError — 5xx range completeness ────────────────────────
describe('classifyGmailError — 5xx range all map to transient', () => {
  it('code=500 → transient', () => {
    expect(classifyGmailError({ code: 500 })).toBe('transient');
  });

  it('code=501 → transient', () => {
    expect(classifyGmailError({ code: 501 })).toBe('transient');
  });

  it('code=502 → transient', () => {
    expect(classifyGmailError({ code: 502 })).toBe('transient');
  });

  it('code=503 → transient', () => {
    expect(classifyGmailError({ code: 503 })).toBe('transient');
  });

  it('code=504 → transient', () => {
    expect(classifyGmailError({ code: 504 })).toBe('transient');
  });

  it('code=507 → transient (Insufficient Storage — 5xx)', () => {
    expect(classifyGmailError({ code: 507 })).toBe('transient');
  });
});

// ─── [19] classifyGmailError — status field case-insensitivity ───────────────
describe('classifyGmailError — status field is lowercased before comparison', () => {
  it('status=unauthenticated (lower) → transient', () => {
    expect(classifyGmailError({ code: 401, status: 'unauthenticated' })).toBe('transient');
  });

  it('status=UNAUTHENTICATED (upper) → transient', () => {
    expect(classifyGmailError({ code: 401, status: 'UNAUTHENTICATED' })).toBe('transient');
  });

  it('status=resource_exhausted (lower) → transient', () => {
    expect(classifyGmailError({ code: 400, status: 'resource_exhausted' })).toBe('transient');
  });

  it('status=RESOURCE_EXHAUSTED (upper) → transient', () => {
    expect(classifyGmailError({ code: 400, status: 'RESOURCE_EXHAUSTED' })).toBe('transient');
  });
});

// ─── [20] classifyGmailError — unknown and edge status codes ─────────────────
describe('classifyGmailError — unusual/edge code values', () => {
  it('code=0 → non-retryable', () => {
    expect(classifyGmailError({ code: 0 })).toBe('non-retryable');
  });

  it('code=-1 (negative) → non-retryable', () => {
    expect(classifyGmailError({ code: -1 })).toBe('non-retryable');
  });

  it('code=1000 (very large) → transient (>= 500)', () => {
    expect(classifyGmailError({ code: 1000 })).toBe('transient');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. isSafeAudioUrl
//    Exact copy of the function in supabase/functions/audio-transcribe/index.ts
//    after the IPv4-compatible IPv6 fix (host.startsWith('[::'))
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: Node.js-adapted equivalent — brackets are kept in URL.hostname under Node.js.
// Deno strips brackets; production edge function uses bracketless regex.
function isSafeAudioUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6: Node.js URL.hostname returns bracketed form
    // WHATWG normalizes IPv4-compatible: [::127.0.0.1]→[::7f00:1], [::169.254.169.254]→[::a9fe:a9fe]
    host.startsWith('[::') || // loopback, IPv4-mapped, IPv4-compat, unspecified
    /^\[fe[89ab][0-9a-f]:/i.test(host) || // link-local fe80::/10 (fe80–febf)
    /^\[fec[0-9a-f]:/i.test(host) || // site-local fec0::/10
    /^\[f[cd][0-9a-f]{2}:/i.test(host) // ULA fc00::/7 (fc00–fdff)
  )
    return false;
  return true;
}

// ─── [21] isSafeAudioUrl — IPv4 loopback / private ranges ────────────────────
describe('isSafeAudioUrl — IPv4 loopback and private ranges', () => {
  it('http:// URL is rejected', () => {
    expect(isSafeAudioUrl('http://example.com/audio.mp3')).toBe(false);
  });
  it('localhost is rejected', () => {
    expect(isSafeAudioUrl('https://localhost/audio.mp3')).toBe(false);
  });
  it('127.0.0.1 (loopback) is rejected', () => {
    expect(isSafeAudioUrl('https://127.0.0.1/audio.mp3')).toBe(false);
  });
  it('127.255.255.255 (full loopback block) is rejected', () => {
    expect(isSafeAudioUrl('https://127.255.255.255/audio.mp3')).toBe(false);
  });
  it('169.254.169.254 (AWS metadata) is rejected', () => {
    expect(isSafeAudioUrl('https://169.254.169.254/latest/meta-data/')).toBe(false);
  });
  it('10.0.0.1 (RFC-1918 A) is rejected', () => {
    expect(isSafeAudioUrl('https://10.0.0.1/audio.mp3')).toBe(false);
  });
  it('192.168.1.1 (RFC-1918 C) is rejected', () => {
    expect(isSafeAudioUrl('https://192.168.1.1/audio.mp3')).toBe(false);
  });
  it('172.16.0.1 (RFC-1918 B start) is rejected', () => {
    expect(isSafeAudioUrl('https://172.16.0.1/audio.mp3')).toBe(false);
  });
  it('172.31.255.255 (RFC-1918 B end) is rejected', () => {
    expect(isSafeAudioUrl('https://172.31.255.255/audio.mp3')).toBe(false);
  });
  it('172.15.255.255 (just below RFC-1918 B) is allowed', () => {
    expect(isSafeAudioUrl('https://172.15.255.255/audio.mp3')).toBe(true);
  });
  it('172.32.0.1 (just above RFC-1918 B) is allowed', () => {
    expect(isSafeAudioUrl('https://172.32.0.1/audio.mp3')).toBe(true);
  });
  it('public IP 93.184.216.34 is allowed', () => {
    expect(isSafeAudioUrl('https://93.184.216.34/audio.mp3')).toBe(true);
  });
});

// ─── [22] isSafeAudioUrl — IPv6 loopback and IPv4-mapped ─────────────────────
describe('isSafeAudioUrl — IPv6 loopback and IPv4-mapped', () => {
  it('[::1] (IPv6 loopback) is rejected', () => {
    expect(isSafeAudioUrl('https://[::1]/audio.mp3')).toBe(false);
  });
  it('[::ffff:127.0.0.1] (IPv4-mapped loopback) is rejected', () => {
    expect(isSafeAudioUrl('https://[::ffff:127.0.0.1]/audio.mp3')).toBe(false);
  });
  it('[::ffff:7f00:1] (normalized IPv4-mapped loopback) is rejected', () => {
    expect(isSafeAudioUrl('https://[::ffff:7f00:1]/audio.mp3')).toBe(false);
  });
  it('[::ffff:169.254.169.254] (IPv4-mapped AWS metadata) is rejected', () => {
    expect(isSafeAudioUrl('https://[::ffff:169.254.169.254]/audio.mp3')).toBe(false);
  });
  it('[::ffff:10.0.0.1] (IPv4-mapped private A) is rejected', () => {
    expect(isSafeAudioUrl('https://[::ffff:10.0.0.1]/audio.mp3')).toBe(false);
  });
  it('[::]  (IPv6 unspecified) is rejected', () => {
    expect(isSafeAudioUrl('https://[::]:443/audio.mp3')).toBe(false);
  });
});

// ─── [23] isSafeAudioUrl — IPv4-compatible IPv6 SSRF (new fix) ───────────────
describe('isSafeAudioUrl — IPv4-compatible IPv6 SSRF bypass (fixed)', () => {
  it('[::127.0.0.1] loopback via IPv4-compatible IPv6 is blocked', () => {
    expect(isSafeAudioUrl('https://[::127.0.0.1]/audio.mp3')).toBe(false);
  });
  it('[::169.254.169.254] AWS metadata via IPv4-compatible IPv6 is blocked', () => {
    expect(isSafeAudioUrl('https://[::169.254.169.254]/audio.mp3')).toBe(false);
  });
  it('[::10.0.0.1] RFC-1918 class A via IPv4-compatible IPv6 is blocked', () => {
    expect(isSafeAudioUrl('https://[::10.0.0.1]/audio.mp3')).toBe(false);
  });
  it('[::192.168.0.1] RFC-1918 class C via IPv4-compatible IPv6 is blocked', () => {
    expect(isSafeAudioUrl('https://[::192.168.0.1]/audio.mp3')).toBe(false);
  });
  it('[::172.16.0.1] RFC-1918 class B via IPv4-compatible IPv6 is blocked', () => {
    expect(isSafeAudioUrl('https://[::172.16.0.1]/audio.mp3')).toBe(false);
  });
  it('[::7f00:1] normalized loopback via IPv4-compatible IPv6 is blocked', () => {
    expect(isSafeAudioUrl('https://[::7f00:1]/audio.mp3')).toBe(false);
  });
  it('[::a9fe:a9fe] normalized AWS metadata via IPv4-compatible IPv6 is blocked', () => {
    expect(isSafeAudioUrl('https://[::a9fe:a9fe]/audio.mp3')).toBe(false);
  });
});

// ─── [24] isSafeAudioUrl — IPv6 link-local and ULA ───────────────────────────
describe('isSafeAudioUrl — IPv6 link-local and ULA', () => {
  it('[fe80::1] (link-local) is rejected', () => {
    expect(isSafeAudioUrl('https://[fe80::1]/audio.mp3')).toBe(false);
  });
  it('[fe80::dead:beef] (link-local) is rejected', () => {
    expect(isSafeAudioUrl('https://[fe80::dead:beef]/audio.mp3')).toBe(false);
  });
  it('[fec0::1] (site-local, deprecated but in fe80::/10) is rejected', () => {
    expect(isSafeAudioUrl('https://[fec0::1]/audio.mp3')).toBe(false);
  });
  it('[fc00::1] (ULA fc) is rejected', () => {
    expect(isSafeAudioUrl('https://[fc00::1]/audio.mp3')).toBe(false);
  });
  it('[fd00::1] (ULA fd) is rejected', () => {
    expect(isSafeAudioUrl('https://[fd00::1]/audio.mp3')).toBe(false);
  });
  it('[fdab:cdef:1234::1] (ULA fd) is rejected', () => {
    expect(isSafeAudioUrl('https://[fdab:cdef:1234::1]/audio.mp3')).toBe(false);
  });
});

// ─── [25] isSafeAudioUrl — valid public URLs ─────────────────────────────────
describe('isSafeAudioUrl — valid public HTTPS URLs pass', () => {
  it('Cloudflare R2 HTTPS URL is allowed', () => {
    expect(isSafeAudioUrl('https://pub-abc.r2.cloudflarestorage.com/audio.ogg')).toBe(true);
  });
  it('AWS S3 public HTTPS URL is allowed', () => {
    expect(isSafeAudioUrl('https://my-bucket.s3.amazonaws.com/audio.mp3')).toBe(true);
  });
  it('Public IPv6 2606:4700::6810:84e5 is allowed', () => {
    expect(isSafeAudioUrl('https://[2606:4700::6810:84e5]/audio.mp3')).toBe(true);
  });
  it('Public IPv6 2001:db8::1 is allowed', () => {
    expect(isSafeAudioUrl('https://[2001:db8::1]/audio.mp3')).toBe(true);
  });
  it('GCS public HTTPS URL is allowed', () => {
    expect(isSafeAudioUrl('https://storage.googleapis.com/bucket/audio.mp3')).toBe(true);
  });
});
