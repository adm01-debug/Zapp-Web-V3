/**
 * Tests for `requireUser` fast-path selection by JWT `iss` claim.
 *
 * The helper validates the bearer token against one of two Supabase backends
 * (self-hosted or cloud) whose envs may both be configured simultaneously.
 * To avoid a mandatory extra round-trip per request, the helper sorts the
 * candidates by matching `iss` origin so the matching backend is tried first.
 *
 * These tests stub `globalThis.fetch` so `@supabase/supabase-js`'s
 * `auth.getUser()` becomes a deterministic in-process call, and assert:
 *   1. Fast-path: iss matches → matching backend is called first (single hop).
 *   2. Cloud-only token with only cloud envs configured → validated on cloud.
 *   3. Self-hosted token with only self-hosted envs → validated on self-host.
 *   4. Iss mismatches all candidates → helper still falls back and tries each.
 *   5. Missing bearer / anon-role token / no configured backends → 401/500.
 *
 * Run: deno test --allow-env --allow-net supabase/functions/_shared/__tests__/require-user-fast-path.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { requireUser } from '../auth.ts';

const SELF_URL = 'https://self.example.com';
const CLOUD_URL = 'https://cloud.supabase.co';

const ENV_KEYS = [
  'SELFHOSTED_SUPABASE_URL',
  'SELFHOSTED_SUPABASE_ANON_KEY',
  'EXTERNAL_SUPABASE_URL',
  'EXTERNAL_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
] as const;

function clearEnvs() {
  for (const k of ENV_KEYS) Deno.env.delete(k);
}

function b64url(obj: unknown): string {
  const json = JSON.stringify(obj);
  return btoa(json).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url(payload);
  // Signature is opaque to `requireUser` — the backend verifies it.
  return `${header}.${body}.sig`;
}

function makeReq(token?: string): Request {
  const headers = new Headers({ origin: 'http://localhost' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  return new Request('http://edge.local/fn', { method: 'POST', headers });
}

interface FetchCall { url: string; init?: RequestInit }

function installFetchStub(shouldSucceedFor: (url: string) => boolean): {
  calls: FetchCall[];
  restore: () => void;
} {
  const calls: FetchCall[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    calls.push({ url, init });
    if (shouldSucceedFor(url)) {
      return Promise.resolve(new Response(
        JSON.stringify({ id: 'user-123', email: 'u@example.com' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    }
    return Promise.resolve(new Response(
      JSON.stringify({ msg: 'invalid token', code: 401 }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    ));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

Deno.test('requireUser: 401 when Authorization header is missing', async () => {
  clearEnvs();
  const res = await requireUser(makeReq());
  assert(res instanceof Response);
  assertEquals(res.status, 401);
});

Deno.test('requireUser: 401 for anon-role tokens (no user session)', async () => {
  clearEnvs();
  Deno.env.set('SUPABASE_URL', CLOUD_URL);
  Deno.env.set('SUPABASE_ANON_KEY', 'anon-key');
  const jwt = makeJwt({ role: 'anon', sub: 'anon-sub', iss: `${CLOUD_URL}/auth/v1` });
  const res = await requireUser(makeReq(jwt));
  assert(res instanceof Response);
  assertEquals(res.status, 401);
});

Deno.test('requireUser: 500 when no auth backend is configured', async () => {
  clearEnvs();
  const jwt = makeJwt({ role: 'authenticated', sub: 'u1', iss: `${CLOUD_URL}/auth/v1` });
  const res = await requireUser(makeReq(jwt));
  assert(res instanceof Response);
  assertEquals(res.status, 500);
});

Deno.test('requireUser fast-path: self-hosted iss → self-hosted tried first', async () => {
  clearEnvs();
  Deno.env.set('SELFHOSTED_SUPABASE_URL', SELF_URL);
  Deno.env.set('SELFHOSTED_SUPABASE_ANON_KEY', 'self-anon');
  Deno.env.set('SUPABASE_URL', CLOUD_URL);
  Deno.env.set('SUPABASE_ANON_KEY', 'cloud-anon');

  const jwt = makeJwt({ role: 'authenticated', sub: 'u1', iss: `${SELF_URL}/auth/v1` });
  const stub = installFetchStub((url) => url.startsWith(SELF_URL));
  try {
    const res = await requireUser(makeReq(jwt));
    assert(!(res instanceof Response), 'expected authorized user');
    assertEquals(res.user.id, 'user-123');
    assertEquals(stub.calls.length, 1, 'fast-path should hit exactly one backend');
    assert(stub.calls[0].url.startsWith(SELF_URL));
  } finally {
    stub.restore();
  }
});

Deno.test('requireUser fast-path: cloud iss → cloud tried first even with self-hosted configured', async () => {
  clearEnvs();
  Deno.env.set('SELFHOSTED_SUPABASE_URL', SELF_URL);
  Deno.env.set('SELFHOSTED_SUPABASE_ANON_KEY', 'self-anon');
  Deno.env.set('SUPABASE_URL', CLOUD_URL);
  Deno.env.set('SUPABASE_ANON_KEY', 'cloud-anon');

  const jwt = makeJwt({ role: 'authenticated', sub: 'u2', iss: `${CLOUD_URL}/auth/v1` });
  const stub = installFetchStub((url) => url.startsWith(CLOUD_URL));
  try {
    const res = await requireUser(makeReq(jwt));
    assert(!(res instanceof Response), 'expected authorized user');
    assertEquals(stub.calls.length, 1, 'fast-path should hit exactly one backend');
    assert(stub.calls[0].url.startsWith(CLOUD_URL));
  } finally {
    stub.restore();
  }
});

Deno.test('requireUser: EXTERNAL_SUPABASE_URL alias populates the self-hosted candidate', async () => {
  clearEnvs();
  Deno.env.set('EXTERNAL_SUPABASE_URL', SELF_URL);
  Deno.env.set('EXTERNAL_SUPABASE_ANON_KEY', 'ext-anon');

  const jwt = makeJwt({ role: 'authenticated', sub: 'u3', iss: `${SELF_URL}/auth/v1` });
  const stub = installFetchStub((url) => url.startsWith(SELF_URL));
  try {
    const res = await requireUser(makeReq(jwt));
    assert(!(res instanceof Response));
    assertEquals(stub.calls[0].url.startsWith(SELF_URL), true);
  } finally {
    stub.restore();
  }
});

Deno.test('requireUser: PUBLISHABLE_KEY alias works when ANON_KEY is absent', async () => {
  clearEnvs();
  Deno.env.set('SUPABASE_URL', CLOUD_URL);
  Deno.env.set('SUPABASE_PUBLISHABLE_KEY', 'pub-anon');

  const jwt = makeJwt({ role: 'authenticated', sub: 'u4', iss: `${CLOUD_URL}/auth/v1` });
  const stub = installFetchStub((url) => url.startsWith(CLOUD_URL));
  try {
    const res = await requireUser(makeReq(jwt));
    assert(!(res instanceof Response));
    assertEquals(stub.calls.length, 1);
  } finally {
    stub.restore();
  }
});

Deno.test('requireUser: iss mismatch → falls back and tries every candidate', async () => {
  clearEnvs();
  Deno.env.set('SELFHOSTED_SUPABASE_URL', SELF_URL);
  Deno.env.set('SELFHOSTED_SUPABASE_ANON_KEY', 'self-anon');
  Deno.env.set('SUPABASE_URL', CLOUD_URL);
  Deno.env.set('SUPABASE_ANON_KEY', 'cloud-anon');

  const jwt = makeJwt({ role: 'authenticated', sub: 'u5', iss: 'https://unrelated.example.com/auth/v1' });
  // Only cloud will validate; self-hosted must be tried too.
  const stub = installFetchStub((url) => url.startsWith(CLOUD_URL));
  try {
    const res = await requireUser(makeReq(jwt));
    assert(!(res instanceof Response), 'expected authorized user via fallback');
    assertEquals(stub.calls.length, 2, 'both candidates should be attempted');
    const origins = stub.calls.map((c) => new URL(c.url).origin);
    assert(origins.includes(SELF_URL));
    assert(origins.includes(CLOUD_URL));
  } finally {
    stub.restore();
  }
});

Deno.test('requireUser: 401 when no candidate validates the token', async () => {
  clearEnvs();
  Deno.env.set('SUPABASE_URL', CLOUD_URL);
  Deno.env.set('SUPABASE_ANON_KEY', 'cloud-anon');

  const jwt = makeJwt({ role: 'authenticated', sub: 'u6', iss: `${CLOUD_URL}/auth/v1` });
  const stub = installFetchStub(() => false);
  try {
    const res = await requireUser(makeReq(jwt));
    assert(res instanceof Response);
    assertEquals(res.status, 401);
  } finally {
    stub.restore();
  }
});

Deno.test('requireUser: placeholder env values are ignored (treated as unconfigured)', async () => {
  clearEnvs();
  Deno.env.set('SUPABASE_URL', 'https://PLACEHOLDER.supabase.co');
  Deno.env.set('SUPABASE_ANON_KEY', 'REPLACE_ME');
  const jwt = makeJwt({ role: 'authenticated', sub: 'u7', iss: `${CLOUD_URL}/auth/v1` });
  const res = await requireUser(makeReq(jwt));
  assert(res instanceof Response);
  assertEquals(res.status, 500, 'placeholders must not count as a configured backend');
});
