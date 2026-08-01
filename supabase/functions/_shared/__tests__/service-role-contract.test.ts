/**
 * Contract tests: the DLQ pipeline only ever writes to `failed_messages`
 * with the **service role** key — never with anon/JWT — and uses INSERT
 * (enqueue) + UPDATE (reprocess) exclusively against that table.
 *
 * These are static source-level tests; they don't hit Postgres. The goal is
 * to prevent regressions where someone accidentally swaps the service-role
 * client for an authenticated one (which RLS would block) or starts mutating
 * `failed_messages` from another path that doesn't have the right key.
 *
 * Run: deno test supabase/functions/_shared/__tests__/service-role-contract.test.ts
 */
import { assert, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { readSourceFrom } from '../test-helpers.ts';

const ENQUEUE = await readSourceFrom(import.meta.url, '../enqueue-failed-message.ts');
const REPROCESS = await readSourceFrom(
  import.meta.url,
  '../../reprocess-failed-messages/index.ts',
);

Deno.test('enqueue helper: builds client with SERVICE_ROLE_KEY (not anon/JWT)', () => {
  assertMatch(ENQUEUE, /SUPABASE_SERVICE_ROLE_KEY/);
  // Defensive: must NOT fall back to anon/publishable key for writes.
  assert(!/SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY/.test(ENQUEUE),
    'enqueue must not use anon/publishable key — RLS blocks INSERT for non-admins');
  // Session persistence off — we are not impersonating any user.
  assertMatch(ENQUEUE, /persistSession:\s*false/);
});

Deno.test('enqueue helper: INSERTs into failed_messages with required fields', () => {
  assertMatch(ENQUEUE, /\.from\('failed_messages'\)/);
  assertMatch(ENQUEUE, /\.insert\(\{/);
  // Required surface: status='pending', payload (with __path), retry bookkeeping.
  assertMatch(ENQUEUE, /status:\s*'pending'/);
  assertMatch(ENQUEUE, /__path:\s*input\.path/);
  assertMatch(ENQUEUE, /retry_count:\s*0/);
  assertMatch(ENQUEUE, /max_retries:\s*MAX_RETRIES/);
  assertMatch(ENQUEUE, /next_attempt_at:/);
});

Deno.test('enqueue helper: never UPDATEs/DELETEs failed_messages (insert-only path)', () => {
  // The enqueue path is strictly insert. Updates belong to the reprocess worker.
  const fmBlock = ENQUEUE.slice(ENQUEUE.indexOf("from('failed_messages')"));
  assert(!/\.update\(/.test(fmBlock), 'enqueue helper must not UPDATE failed_messages');
  assert(!/\.delete\(/.test(fmBlock), 'enqueue helper must not DELETE failed_messages');
});

Deno.test('reprocess worker: builds client with SERVICE_ROLE_KEY (not anon/JWT)', () => {
  assertMatch(REPROCESS, /SUPABASE_SERVICE_ROLE_KEY/);
  assert(!/SUPABASE_ANON_KEY|SUPABASE_PUBLISHABLE_KEY/.test(REPROCESS),
    'reprocess worker must not use anon key — RLS blocks UPDATE for non-admins');
});

Deno.test('reprocess worker: UPDATEs failed_messages for all 3 outcomes (succeeded/abandoned/retrying)', () => {
  // All updates target the same table.
  const updates = REPROCESS.match(/\.from\('failed_messages'\)\s*\.update\(/g) ?? [];
  assert(updates.length >= 3, `expected ≥3 update() calls on failed_messages, got ${updates.length}`);

  // Each terminal/transient state must be present in an update payload.
  assertMatch(REPROCESS, /status:\s*'succeeded'/);
  assertMatch(REPROCESS, /status:\s*'abandoned'/);
  assertMatch(REPROCESS, /status:\s*'retrying'/);
});

Deno.test('reprocess worker: never INSERTs into failed_messages (worker only mutates)', () => {
  const fmBlock = REPROCESS.slice(REPROCESS.indexOf("from('failed_messages')"));
  // The worker selects + updates. Inserts come exclusively from the enqueue helper.
  assert(!/\.insert\(/.test(fmBlock),
    'reprocess worker must not INSERT into failed_messages — enqueue helper owns that path');
});
