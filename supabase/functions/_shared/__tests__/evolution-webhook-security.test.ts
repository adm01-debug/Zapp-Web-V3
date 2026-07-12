/**
 * Security-hardening regression tests for the Evolution webhook pipeline.
 *
 * Covers the 2026-07-12 audit fixes:
 *   C-1  unmarkEventProcessed — 429 rate-limit path rolls back the idempotency
 *        mark so a throttled event stays re-deliverable (no silent message loss).
 *   A-2  scrubWebhookSecrets + routeToDeadLetter — producer secrets (apikey/
 *        sender/token) are stripped before the payload is persisted to the DLQ.
 *
 * Run: deno test supabase/functions/_shared/__tests__/evolution-webhook-security.test.ts
 */
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  scrubWebhookSecrets,
  unmarkEventProcessed,
  routeToDeadLetter,
} from '../evolution-helpers.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Minimal chainable Supabase mock: records the last (table, op, filters, row).
// ─────────────────────────────────────────────────────────────────────────────
interface Recorded {
  table: string;
  op: 'insert' | 'delete' | null;
  eqField?: string;
  eqValue?: unknown;
  row?: Record<string, unknown>;
}
function makeSupabaseMock(insertError: unknown = null, deleteError: unknown = null) {
  const rec: Recorded = { table: '', op: null };
  const api = {
    _rec: rec,
    from(table: string) {
      rec.table = table;
      return {
        insert(row: Record<string, unknown>) {
          rec.op = 'insert';
          rec.row = row;
          return Promise.resolve({ error: insertError });
        },
        delete() {
          rec.op = 'delete';
          return {
            eq(field: string, value: unknown) {
              rec.eqField = field;
              rec.eqValue = value;
              return Promise.resolve({ error: deleteError });
            },
          };
        },
      };
    },
  };
  return api;
}

// ═══════════════════════════════════════════════════════════════════════════
//  A-2 · scrubWebhookSecrets — deep redaction of producer secrets
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('scrubWebhookSecrets | strips top-level apikey/sender, keeps other fields', () => {
  const input = { event: 'messages.upsert', instance: 'wpp2', apikey: 'SECRET-KEY', sender: '5511@s.whatsapp.net', data: { id: 'X1' } };
  const out = scrubWebhookSecrets(input) as Record<string, unknown>;
  assertEquals(out.apikey, '[REDACTED]');
  assertEquals(out.sender, '[REDACTED]');
  assertEquals(out.event, 'messages.upsert');
  assertEquals(out.instance, 'wpp2');
  assertEquals((out.data as Record<string, unknown>).id, 'X1');
});

Deno.test('scrubWebhookSecrets | redacts case-insensitively and nested keys (api_key, token, authorization)', () => {
  const input = { level1: { api_key: 'k', Authorization: 'Bearer z', TOKEN: 't', access_token: 'a', ok: 1 } };
  const out = scrubWebhookSecrets(input) as Record<string, Record<string, unknown>>;
  assertEquals(out.level1.api_key, '[REDACTED]');
  assertEquals(out.level1.Authorization, '[REDACTED]');
  assertEquals(out.level1.TOKEN, '[REDACTED]');
  assertEquals(out.level1.access_token, '[REDACTED]');
  assertEquals(out.level1.ok, 1);
});

Deno.test('scrubWebhookSecrets | traverses arrays of records', () => {
  const input = { messages: [{ id: 'A', apikey: 'k1' }, { id: 'B', apikey: 'k2' }] };
  const out = scrubWebhookSecrets(input) as { messages: Record<string, unknown>[] };
  assertEquals(out.messages[0].apikey, '[REDACTED]');
  assertEquals(out.messages[1].apikey, '[REDACTED]');
  assertEquals(out.messages[0].id, 'A');
  assertEquals(out.messages[1].id, 'B');
});

Deno.test('scrubWebhookSecrets | does not mutate the original payload', () => {
  const input = { apikey: 'SECRET', data: { nested: { token: 'T' } } };
  const out = scrubWebhookSecrets(input) as Record<string, unknown>;
  assertEquals(input.apikey, 'SECRET', 'original apikey untouched');
  assertEquals((input.data.nested as Record<string, unknown>).token, 'T', 'original nested token untouched');
  assert(out.apikey === '[REDACTED]', 'copy is redacted');
});

Deno.test('scrubWebhookSecrets | primitives and null pass through unchanged', () => {
  assertEquals(scrubWebhookSecrets(null), null);
  assertEquals(scrubWebhookSecrets('hello'), 'hello');
  assertEquals(scrubWebhookSecrets(42), 42);
});

Deno.test('scrubWebhookSecrets | recursion depth is bounded (no stack overflow on deep nesting)', () => {
  // Build a 50-deep object; scrub must not throw and must stop redacting past the cap.
  let deep: Record<string, unknown> = { apikey: 'leaf' };
  for (let i = 0; i < 50; i++) deep = { child: deep };
  const out = scrubWebhookSecrets(deep);
  assert(out !== undefined, 'returns a value without throwing');
});

// ═══════════════════════════════════════════════════════════════════════════
//  A-2 · routeToDeadLetter — persists a SCRUBBED payload
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('routeToDeadLetter | scrubs apikey/sender before insert into DLQ', async () => {
  const sb = makeSupabaseMock();
  await routeToDeadLetter(sb, {
    event_type: 'messages.upsert',
    instance: 'wpp2',
    payload: { apikey: 'GLOBAL-ADMIN-KEY', sender: '5511@s.whatsapp.net', data: { id: 'M1' } },
    error_message: 'boom',
  });
  assertEquals(sb._rec.table, 'evolution_webhook_dlq');
  assertEquals(sb._rec.op, 'insert');
  const stored = sb._rec.row!.payload as Record<string, unknown>;
  assertEquals(stored.apikey, '[REDACTED]', 'apikey must not be persisted in cleartext');
  assertEquals(stored.sender, '[REDACTED]', 'sender must not be persisted in cleartext');
  assertEquals((stored.data as Record<string, unknown>).id, 'M1', 'business data preserved');
});

Deno.test('routeToDeadLetter | null payload stays null (no crash)', async () => {
  const sb = makeSupabaseMock();
  await routeToDeadLetter(sb, { event_type: 'call', instance: 'wpp2', payload: null, error_message: 'x' });
  assertEquals(sb._rec.row!.payload, null);
});

// ═══════════════════════════════════════════════════════════════════════════
//  C-1 · unmarkEventProcessed — idempotency rollback on 429
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('unmarkEventProcessed | deletes the dedup row by event_id', async () => {
  const sb = makeSupabaseMock();
  await unmarkEventProcessed(sb, 'wpp2:messages.upsert:abcdef');
  assertEquals(sb._rec.table, 'webhook_events_processed');
  assertEquals(sb._rec.op, 'delete');
  assertEquals(sb._rec.eqField, 'event_id');
  assertEquals(sb._rec.eqValue, 'wpp2:messages.upsert:abcdef');
});

Deno.test('unmarkEventProcessed | never throws when the delete errors (fail-safe)', async () => {
  const sb = makeSupabaseMock(null, { message: 'delete failed', code: 'XX000' });
  // Must resolve without throwing — a failed rollback cannot change the 429 response.
  await unmarkEventProcessed(sb, 'wpp2:call:zzz');
  assertEquals(sb._rec.op, 'delete');
});
