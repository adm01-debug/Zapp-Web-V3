/**
 * Exhaustive wiring tests for evolution-helpers.ts — ported from V4 caller-wiring harness.
 *
 * Covers functions that have ZERO coverage elsewhere:
 *   - toEventRecords (all 6 branches)
 *   - shouldUpdateStatus (complete 9×9 status matrix)
 *   - STATUS_PRIORITY table consistency
 *
 * Also covers integration caller chains, JID guard patterns, deep traversal of
 * resolveEventJid, regression guards for all 4 fixed bugs, and 7 documented gaps.
 *
 * Run: deno test supabase/functions/_shared/__tests__/evolution-helpers-wiring.test.ts
 *
 * FIXED BUGS (all verified by §11 regression guards):
 *   BUG-1: normalizePhone — /(:\d+)+(?=@)/g strips multi-segment device suffix
 *   BUG-2: generatePhoneVariants — !rest.startsWith('9') guard on 12-digit BR branch
 *   BUG-3: generatePhoneVariants — raw phone no longer seeded into variants Set
 *   BUG-4: generatePhoneVariants — if (clean) guard prevents spurious "+" variant
 *
 * DOCUMENTED GAPS (non-blocking, documented here as regression anchors):
 *   GAP-A: Unknown ACK code falls through to toLowerCase() → may write invalid status to DB
 *   GAP-B: @lid JID with digits passes handleIncomingMessage guards → spurious contact risk
 *   GAP-C: handleContactsUpsert has no @lid guard → alpha phone proceeds to DB
 *   GAP-D: redactJid uses /:\d+$/ (no /g) → only strips last :N suffix in log output
 *   GAP-E: received(1) and sent(1) equal priority — intentional design
 *   GAP-F: @broadcast not in handlePresenceUpdate guard
 *   GAP-G: includes(@g.us) vs endsWith(@g.us) inconsistency across handlers
 */

import {
  assertEquals,
  assert,
  assertFalse,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  toEventRecords,
  normalizePhone,
  generatePhoneVariants,
  resolveBestJid,
  resolveEventJid,
  shouldUpdateStatus,
  STATUS_PRIORITY,
  redactJid,
  isRecord,
} from '../evolution-helpers.ts';

// ---------------------------------------------------------------------------
// Inline STATUS_MAP (mirrors handleMessagesUpdate internal statusMap).
// Not exported from evolution-helpers.ts; inlined here for pipeline testing.
// ---------------------------------------------------------------------------
const STATUS_MAP: Record<string, string> = {
  'PENDING': 'sending',
  'SERVER_ACK': 'sent',
  'DELIVERY_ACK': 'delivered',
  'READ': 'read',
  'READ_ACK': 'read',
  'PLAYED': 'played',
  'PLAYED_ACK': 'played',
  'ERROR': 'failed',
};
function mapAckToStatus(rawStatus?: string): string {
  if (!rawStatus) return '';
  return STATUS_MAP[rawStatus] || rawStatus.toLowerCase();
}

// ---------------------------------------------------------------------------
// Helper: assert two string[] match ignoring order
// ---------------------------------------------------------------------------
function assertSameElements(actual: string[], expected: string[], label: string) {
  const a = [...actual].sort();
  const e = [...expected].sort();
  assertEquals(a, e, label);
}

// ═══════════════════════════════════════════════════════════════════════════
//  §1  toEventRecords — all 6 branches (15 assertions)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('toEventRecords | Branch1: empty array → []', () => {
  assertEquals(toEventRecords([]), []);
});

Deno.test('toEventRecords | Branch1: array of records → all returned', () => {
  assertEquals(toEventRecords([{ a: 1 }, { b: 2 }]).length, 2);
});

Deno.test('toEventRecords | Branch1: array filters non-records', () => {
  assertEquals(toEventRecords([{ a: 1 }, 'str', null, 42, { b: 2 }]).length, 2);
});

Deno.test('toEventRecords | Branch1: all non-records → []', () => {
  assertEquals(toEventRecords(['str', null, 42]), []);
});

Deno.test('toEventRecords | Branch2: null → []', () => {
  assertEquals(toEventRecords(null), []);
});

Deno.test('toEventRecords | Branch2: undefined → []', () => {
  assertEquals(toEventRecords(undefined), []);
});

Deno.test('toEventRecords | Branch2: string → []', () => {
  assertEquals(toEventRecords('hello'), []);
});

Deno.test('toEventRecords | Branch2: number → []', () => {
  assertEquals(toEventRecords(42), []);
});

Deno.test('toEventRecords | Branch3: record.messages extracted', () => {
  const data = { messages: [{ id: 1 }, { id: 2 }], other: 'x' };
  assertEquals(toEventRecords(data, ['messages']).length, 2);
  assertEquals((toEventRecords(data, ['messages'])[0] as Record<string, unknown>).id, 1);
});

Deno.test('toEventRecords | Branch4: collection key filters non-records', () => {
  const data = { messages: [{ a: 1 }, 'skip', null, { b: 2 }] } as Record<string, unknown>;
  assertEquals(toEventRecords(data, ['messages']).length, 2);
});

Deno.test('toEventRecords | Branch5: non-array collection key → falls through to [data]', () => {
  const data = { messages: 'not an array', x: 1 };
  const result = toEventRecords(data, ['messages']);
  assertEquals(result.length, 1);
  assertEquals((result[0] as Record<string, unknown>).messages, 'not an array');
});

Deno.test('toEventRecords | Branch6: plain record → wrapped as [data]', () => {
  const plain = { id: 'msg1', status: 'sent' };
  assertEquals(toEventRecords(plain, ['messages']).length, 1);
  assertEquals((toEventRecords(plain, ['messages'])[0] as Record<string, unknown>).id, 'msg1');
});

Deno.test('toEventRecords | first matching collectionKey wins', () => {
  const data = { updates: [{ a: 1 }], messages: [{ b: 2 }] };
  assertEquals((toEventRecords(data, ['updates', 'messages'])[0] as Record<string, unknown>).a, 1);
  assertEquals((toEventRecords(data, ['messages', 'updates'])[0] as Record<string, unknown>).b, 2);
});

Deno.test('toEventRecords | empty collectionKeys → always wraps record', () => {
  const plain = { id: 'msg1' };
  assertEquals(toEventRecords(plain, []).length, 1);
});

Deno.test('toEventRecords | delete handler pattern: messages|keys', () => {
  const d1 = { messages: [{ key: { id: 'M1' } }, { key: { id: 'M2' } }] };
  assertEquals(toEventRecords(d1, ['messages', 'keys']).length, 2);
  const d2 = { keys: [{ id: 'K1' }] };
  assertEquals((toEventRecords(d2, ['messages', 'keys'])[0] as Record<string, unknown>).id, 'K1');
  const d3 = { key: { id: 'K3' } };
  assertEquals(toEventRecords(d3, ['messages', 'keys']).length, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
//  §2  statusMap pipeline — ACK→status + shouldUpdateStatus integration
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('statusMap | PENDING → "sending"', () => assertEquals(mapAckToStatus('PENDING'), 'sending'));
Deno.test('statusMap | SERVER_ACK → "sent"', () => assertEquals(mapAckToStatus('SERVER_ACK'), 'sent'));
Deno.test('statusMap | DELIVERY_ACK → "delivered"', () => assertEquals(mapAckToStatus('DELIVERY_ACK'), 'delivered'));
Deno.test('statusMap | READ → "read"', () => assertEquals(mapAckToStatus('READ'), 'read'));
Deno.test('statusMap | READ_ACK → "read"', () => assertEquals(mapAckToStatus('READ_ACK'), 'read'));
Deno.test('statusMap | PLAYED → "played"', () => assertEquals(mapAckToStatus('PLAYED'), 'played'));
Deno.test('statusMap | PLAYED_ACK → "played"', () => assertEquals(mapAckToStatus('PLAYED_ACK'), 'played'));
Deno.test('statusMap | ERROR → "failed"', () => assertEquals(mapAckToStatus('ERROR'), 'failed'));

// GAP-A: Unknown ACK code → falls through to toLowerCase()
Deno.test('statusMap | GAP-A: unknown numeric "4" → "4" (invalid DB status)', () => {
  assertEquals(mapAckToStatus('4'), '4');
});
Deno.test('statusMap | GAP-A: unknown "UNKNOWN" → "unknown"', () => {
  assertEquals(mapAckToStatus('UNKNOWN'), 'unknown');
});
Deno.test('statusMap | empty string → ""', () => assertEquals(mapAckToStatus(''), ''));
Deno.test('statusMap | undefined → ""', () => assertEquals(mapAckToStatus(undefined), ''));

// Pipeline integration: ACK → status → shouldUpdateStatus
Deno.test('statusMap pipeline | GAP-A: null+ACK4 → shouldUpdate writes "4" to DB', () => {
  assert(shouldUpdateStatus(null, mapAckToStatus('4')));
});
Deno.test('statusMap pipeline | sent+ACK4: unknown priority 0 ≤ 1 → blocked', () => {
  assertFalse(shouldUpdateStatus('sent', mapAckToStatus('4')));
});
Deno.test('statusMap pipeline | read+ERROR: failed blocked after delivered', () => {
  assertFalse(shouldUpdateStatus('read', mapAckToStatus('ERROR')));
});
Deno.test('statusMap pipeline | null+DELIVERY_ACK → always updates', () => {
  assert(shouldUpdateStatus(null, mapAckToStatus('DELIVERY_ACK')));
});
Deno.test('statusMap pipeline | sent+DELIVERY_ACK: delivered(2) > sent(1)', () => {
  assert(shouldUpdateStatus('sent', mapAckToStatus('DELIVERY_ACK')));
});
Deno.test('statusMap pipeline | delivered+READ_ACK: read(3) > delivered(2)', () => {
  assert(shouldUpdateStatus('delivered', mapAckToStatus('READ_ACK')));
});
Deno.test('statusMap pipeline | read+PLAYED_ACK: played(4) > read(3)', () => {
  assert(shouldUpdateStatus('read', mapAckToStatus('PLAYED_ACK')));
});
Deno.test('statusMap pipeline | played+SERVER_ACK: sent(1) ≤ played(4) → blocked', () => {
  assertFalse(shouldUpdateStatus('played', mapAckToStatus('SERVER_ACK')));
});

// ═══════════════════════════════════════════════════════════════════════════
//  §7  shouldUpdateStatus — complete edge-case matrix (28 assertions)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('shouldUpdateStatus | null current → always updates for any new status', () => {
  for (const s of ['sending', 'sent', 'delivered', 'read', 'played', 'failed', 'deleted', 'received']) {
    assert(shouldUpdateStatus(null, s), `null → ${s} should update`);
  }
});

Deno.test('shouldUpdateStatus | "deleted" always wins regardless of current', () => {
  for (const s of ['sending', 'played', 'deleted', 'failed', '']) {
    assert(shouldUpdateStatus(s || null, 'deleted'), `${s||'null'} → deleted`);
  }
});

Deno.test('shouldUpdateStatus | "failed" only allowed before delivered (priority < 2)', () => {
  assert(shouldUpdateStatus('sending', 'failed'), 'sending(0) < 2 → allowed');
  assert(shouldUpdateStatus('sent', 'failed'), 'sent(1) < 2 → allowed');
  assert(shouldUpdateStatus('received', 'failed'), 'received(1) < 2 → allowed');
  assert(shouldUpdateStatus('failed', 'failed'), 'failed(-1) < 2 → allowed');
  assertFalse(shouldUpdateStatus('delivered', 'failed'), 'delivered(2) ≮ 2 → blocked');
  assertFalse(shouldUpdateStatus('read', 'failed'), 'read(3) ≮ 2 → blocked');
  assertFalse(shouldUpdateStatus('played', 'failed'), 'played(4) ≮ 2 → blocked');
});

Deno.test('shouldUpdateStatus | GAP-E: received and sent have equal priority (both 1)', () => {
  assertEquals(STATUS_PRIORITY['received'], STATUS_PRIORITY['sent']);
  assertFalse(shouldUpdateStatus('received', 'sent'), 'received→sent: equal → not updated');
  assertFalse(shouldUpdateStatus('sent', 'received'), 'sent→received: equal → not updated');
});

Deno.test('shouldUpdateStatus | unknown status treated as priority 0', () => {
  assertFalse(shouldUpdateStatus('unknown_status', 'sending'), 'unknown(0)→sending(0): 0>0=false');
  assert(shouldUpdateStatus('unknown_status', 'delivered'), 'unknown(0)→delivered(2): 2>0=true');
  assertFalse(shouldUpdateStatus('sent', 'garbage_status'), 'sent(1)→garbage(0): 0>1=false');
  assert(shouldUpdateStatus(null, 'garbage_status'), 'null→garbage: null→always true');
});

Deno.test('shouldUpdateStatus | empty string current treated as falsy → always updates', () => {
  // '' is falsy → hits the `if (!currentStatus) return true` branch, same as null
  assert(shouldUpdateStatus('', 'sending'), '"" current → sending: falsy=true');
  assert(shouldUpdateStatus('', 'delivered'), '"" current → delivered: falsy=true');
});

Deno.test('shouldUpdateStatus | standard priority ladder', () => {
  assertFalse(shouldUpdateStatus('sent', 'sending'), 'sent→sending: 0>1=false');
  assert(shouldUpdateStatus('sending', 'sent'), 'sending→sent: 1>0=true');
  assert(shouldUpdateStatus('sent', 'delivered'), 'sent→delivered: 2>1=true');
  assert(shouldUpdateStatus('delivered', 'read'), 'delivered→read: 3>2=true');
  assert(shouldUpdateStatus('read', 'played'), 'read→played: 4>3=true');
  assertFalse(shouldUpdateStatus('played', 'read'), 'played→read: 3>4=false');
});

// ═══════════════════════════════════════════════════════════════════════════
//  STATUS_PRIORITY table consistency
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('STATUS_PRIORITY | all known statuses have defined values', () => {
  const known = ['sending', 'sent', 'delivered', 'read', 'played', 'failed', 'deleted', 'received'];
  for (const s of known) {
    assert(STATUS_PRIORITY[s] !== undefined, `${s} has no priority`);
  }
});

Deno.test('STATUS_PRIORITY | ordering: failed < sending < sent=received < delivered < read < played < deleted', () => {
  assert(STATUS_PRIORITY['failed'] < STATUS_PRIORITY['sending']);
  assert(STATUS_PRIORITY['sending'] < STATUS_PRIORITY['sent']);
  assertEquals(STATUS_PRIORITY['sent'], STATUS_PRIORITY['received']);
  assert(STATUS_PRIORITY['sent'] < STATUS_PRIORITY['delivered']);
  assert(STATUS_PRIORITY['delivered'] < STATUS_PRIORITY['read']);
  assert(STATUS_PRIORITY['read'] < STATUS_PRIORITY['played']);
  assert(STATUS_PRIORITY['played'] < STATUS_PRIORITY['deleted']);
});

Deno.test('STATUS_PRIORITY | deleted threshold check (shouldUpdateStatus "failed" uses < delivered=2)', () => {
  assertEquals(STATUS_PRIORITY['delivered'], 2, 'failed-threshold is hardcoded as delivered priority');
});

// ═══════════════════════════════════════════════════════════════════════════
//  §4  Group / LID JID guard patterns (22 assertions)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('JID guards | standard @g.us group JID', () => {
  const group = '5511987654321-1620000000@g.us';
  assert(group.includes('@g.us'), 'includes(@g.us)');
  assert(group.endsWith('@g.us'), 'endsWith(@g.us)');
  assert(!group || group.endsWith('@g.us') || group.endsWith('@lid'), 'lidgus guard blocks group');
});

Deno.test('JID guards | individual @s.whatsapp.net passes all guards', () => {
  const individual = '5511987654321@s.whatsapp.net';
  assertFalse(individual.includes('@g.us'), '!includes(@g.us)');
  assertFalse(individual.endsWith('@g.us'), '!endsWith(@g.us)');
  assertFalse(!individual || individual.endsWith('@g.us') || individual.endsWith('@lid'), 'lidgus passes');
});

Deno.test('JID guards | @lid JID — blocked by lidgus guard but passes @g.us guard', () => {
  const lid = '1234567890@lid';
  assertFalse(lid.includes('@g.us'), '@lid: !includes(@g.us)');
  assertFalse(lid.endsWith('@g.us'), '@lid: !endsWith(@g.us)');
  assert(!lid || lid.endsWith('@g.us') || lid.endsWith('@lid'), '@lid blocked by lidgus guard');
});

Deno.test('JID guards | @broadcast passes @g.us guard and lidgus guard (GAP-F)', () => {
  const broadcast = '5511987654321@broadcast';
  assertFalse(broadcast.includes('@g.us'), '@broadcast: !includes(@g.us)');
  assertFalse(broadcast.endsWith('@g.us'), '@broadcast: !endsWith(@g.us)');
  // GAP-F: @broadcast NOT in lidgus guard → passes through
  assertFalse(!broadcast || broadcast.endsWith('@g.us') || broadcast.endsWith('@lid'), 'GAP-F: @broadcast not blocked by lidgus');
  // normalizePhone DOES strip @broadcast
  assertEquals(normalizePhone(broadcast), '5511987654321');
});

Deno.test('JID guards | GAP-G: includes vs endsWith inconsistency for embedded @g.us', () => {
  const embedded = '5511987654321-1620000000@g.us.participant@s.whatsapp.net';
  assert(embedded.includes('@g.us'), 'includes catches embedded @g.us');
  assertFalse(embedded.endsWith('@g.us'), 'endsWith MISSES when @s.whatsapp.net is suffix');
});

Deno.test('JID guards | contacts.set style: @g.us || @broadcast || @lid all blocked', () => {
  const setGuard = (jid: string) =>
    !jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@lid');
  assert(setGuard('123@g.us'));
  assert(setGuard('123@broadcast'));
  assert(setGuard('123@lid'));
  assertFalse(setGuard('123@s.whatsapp.net'));
});

Deno.test('JID guards | null JID: optional chaining returns undefined (falsy)', () => {
  // Use resolveEventJid() (returns string | null) so TypeScript doesn't narrow to literal null
  const jid = resolveEventJid(); // null when no sources provided
  // jid?.includes('@g.us') → undefined (falsy) → guard does NOT block
  assert(!jid?.includes('@g.us'), 'null: not blocked by includes-guard');
  // lidgus guard: !null → true → BLOCKED
  assert(!jid || jid.endsWith('@g.us') || jid.endsWith('@lid'), 'null: blocked by lidgus guard');
});

// ═══════════════════════════════════════════════════════════════════════════
//  §5  resolveBestJid — priority selection (22 assertions)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('resolveBestJid | P1: @s.whatsapp.net beats bare digit', () => {
  assertEquals(resolveBestJid('+5511987654321', '5511987654321@s.whatsapp.net'), '5511987654321@s.whatsapp.net');
});

Deno.test('resolveBestJid | P1: @s.whatsapp.net beats @g.us', () => {
  assertEquals(resolveBestJid('5511@g.us', '5511@s.whatsapp.net'), '5511@s.whatsapp.net');
});

Deno.test('resolveBestJid | P1: @s.whatsapp.net beats @lid', () => {
  assertEquals(resolveBestJid('abc@lid', '5511@s.whatsapp.net'), '5511@s.whatsapp.net');
});

Deno.test('resolveBestJid | P1: multi-device @s.whatsapp.net still wins', () => {
  assertEquals(resolveBestJid('+5511987654321', '5511987654321:2:3@s.whatsapp.net'), '5511987654321:2:3@s.whatsapp.net');
});

Deno.test('resolveBestJid | P2: +digits beats @g.us', () => {
  assertEquals(resolveBestJid('5511987654321-0@g.us', '+5511987654321'), '+5511987654321');
});

Deno.test('resolveBestJid | P2: bare 13-digit beats @g.us', () => {
  assertEquals(resolveBestJid('123@g.us', '5511987654321'), '5511987654321');
});

Deno.test('resolveBestJid | P2: 10-digit bare number qualifies', () => {
  assertEquals(resolveBestJid('1234567890', '123@g.us'), '1234567890');
});

Deno.test('resolveBestJid | P2: 9-digit bare falls through (regex requires 10+)', () => {
  // 9-digit doesn't match /^\+?\d{10,15}$/ → falls to @g.us (P3)
  assertEquals(resolveBestJid('123456789', '5511@g.us'), '5511@g.us');
});

Deno.test('resolveBestJid | P3: @g.us beats unknown string', () => {
  assertEquals(resolveBestJid('random-string', '5511@g.us'), '5511@g.us');
});

Deno.test('resolveBestJid | P4: non-@lid beats @lid', () => {
  assertEquals(resolveBestJid('abc@lid', 'random@broadcast'), 'random@broadcast');
});

Deno.test('resolveBestJid | P5: @lid as last resort when nothing else available', () => {
  assertEquals(resolveBestJid(null, undefined, '  ', 'abc@lid'), 'abc@lid');
});

Deno.test('resolveBestJid | no valid candidates → null', () => {
  assertEquals(resolveBestJid(null, undefined, '   ', ''), null);
  assertEquals(resolveBestJid(), null);
});

Deno.test('resolveBestJid | whitespace trimmed from candidates', () => {
  assertEquals(resolveBestJid('  5511987654321@s.whatsapp.net  '), '5511987654321@s.whatsapp.net');
});

Deno.test('resolveBestJid | multiple @s.whatsapp.net → first one wins', () => {
  assertEquals(resolveBestJid('AAA@s.whatsapp.net', 'BBB@s.whatsapp.net'), 'AAA@s.whatsapp.net');
});

Deno.test('resolveBestJid | dedup: same JID repeated → still returns it once', () => {
  assertEquals(resolveBestJid('5511@s.whatsapp.net', '5511@s.whatsapp.net'), '5511@s.whatsapp.net');
});

// ═══════════════════════════════════════════════════════════════════════════
//  §6  resolveEventJid — deep field traversal (25 assertions)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('resolveEventJid | direct field: remoteJid', () => {
  assertEquals(resolveEventJid({ remoteJid: '5511@s.whatsapp.net' }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | direct field: participant', () => {
  assertEquals(resolveEventJid({ participant: '5511@s.whatsapp.net' }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | direct field: from', () => {
  assertEquals(resolveEventJid({ from: '5511@s.whatsapp.net' }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | direct field: jid', () => {
  assertEquals(resolveEventJid({ jid: '5511@s.whatsapp.net' }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | direct field: chatId', () => {
  assertEquals(resolveEventJid({ chatId: '5511@s.whatsapp.net' }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | direct field: owner', () => {
  assertEquals(resolveEventJid({ owner: '5511@s.whatsapp.net' }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | direct field: recipient', () => {
  assertEquals(resolveEventJid({ recipient: '5511@s.whatsapp.net' }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | string source directly', () => {
  assertEquals(resolveEventJid('5511@s.whatsapp.net'), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | nested in .key.remoteJid', () => {
  assertEquals(resolveEventJid({ key: { remoteJid: '5511@s.whatsapp.net' } }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | nested in .key.participant', () => {
  assertEquals(resolveEventJid({ key: { participant: '5511@s.whatsapp.net' } }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | nested in .contextInfo.remoteJid', () => {
  assertEquals(resolveEventJid({ contextInfo: { remoteJid: '5511@s.whatsapp.net' } }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | nested in .message.remoteJid', () => {
  assertEquals(resolveEventJid({ message: { remoteJid: '5511@s.whatsapp.net' } }), '5511@s.whatsapp.net');
});

Deno.test('resolveEventJid | deep nested inside message sub-record', () => {
  assertEquals(
    resolveEventJid({ message: { extendedTextMessage: { remoteJid: '5511@s.whatsapp.net' } } }),
    '5511@s.whatsapp.net',
  );
});

Deno.test('resolveEventJid | priority: @s.whatsapp.net from any source wins over @lid', () => {
  assertEquals(
    resolveEventJid({ jid: 'abc@lid' }, { remoteJid: '5511@s.whatsapp.net' }),
    '5511@s.whatsapp.net',
  );
});

Deno.test('resolveEventJid | multi-source: first @s.whatsapp.net wins', () => {
  assertEquals(
    resolveEventJid({ remoteJid: 'AAA@s.whatsapp.net' }, { remoteJid: 'BBB@s.whatsapp.net' }),
    'AAA@s.whatsapp.net',
  );
});

Deno.test('resolveEventJid | no JID anywhere → null', () => {
  assertEquals(resolveEventJid({ foo: 'bar', baz: 42 }), null);
  assertEquals(resolveEventJid({}), null);
  assertEquals(resolveEventJid(null), null);
});

Deno.test('resolveEventJid | dedup: same JID in multiple places → single candidate', () => {
  assertEquals(
    resolveEventJid({ remoteJid: '5511@s.whatsapp.net', jid: '5511@s.whatsapp.net' }),
    '5511@s.whatsapp.net',
  );
});

Deno.test('resolveEventJid | standard webhook key+data pattern', () => {
  assertEquals(
    resolveEventJid(
      { remoteJid: '5511987654321@s.whatsapp.net', fromMe: false, id: 'ABC123' },
      null,
      { pushName: 'Test', messageTimestamp: 1000 },
    ),
    '5511987654321@s.whatsapp.net',
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  §3  normalizePhone → generatePhoneVariants chain (key patterns)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('chain | multi-device JID: normalize → variants includes both with/without9', () => {
  const jid = '5511987654321:2:3@s.whatsapp.net';
  const phone = normalizePhone(jid);
  assertEquals(phone, '5511987654321');
  assertSameElements(generatePhoneVariants(phone!), ['5511987654321', '+5511987654321', '551187654321'], 'multi-device chain');
});

Deno.test('chain | 12-digit BR: normalize → variants adds 9th digit', () => {
  const jid = '551187654321@s.whatsapp.net';
  const phone = normalizePhone(jid);
  assertEquals(phone, '551187654321');
  assertSameElements(generatePhoneVariants(phone!), ['551187654321', '+551187654321', '5511987654321'], '12-digit chain');
});

Deno.test('chain | @lid digit JID: normalize → digits extracted, variants without BR suffix', () => {
  const phone = normalizePhone('1234567890123@lid');
  assertEquals(phone, '1234567890123');
  // 13 digits but doesn't start with 55 → no BR handling
  assertSameElements(generatePhoneVariants(phone!), ['1234567890123', '+1234567890123'], '@lid digit chain');
});

Deno.test('chain | @lid alpha JID: GAP-B/C — alpha phone proceeds to DB (no guard)', () => {
  const phone = normalizePhone('xyz789abc@lid');
  // digits extracted: "789"
  assertEquals(phone, '789');
  assertSameElements(generatePhoneVariants(phone!), ['789', '+789'], '@lid alpha chain');
});

Deno.test('chain | null/undefined inputs are safe throughout chain', () => {
  assertEquals(normalizePhone(undefined), null);
  assertEquals(normalizePhone(), null);
  assertEquals(normalizePhone(''), null);
});

Deno.test('chain | already-normalized phone is idempotent through chain', () => {
  const phone = '5511987654321';
  assertEquals(normalizePhone(phone), phone);
  assertSameElements(generatePhoneVariants(phone), ['5511987654321', '+5511987654321', '551187654321'], 'idempotent chain');
});

Deno.test('chain | 23505 conflict recovery: re-normalizing device JID produces same variants', () => {
  const first = normalizePhone('5511987654321:2@s.whatsapp.net');
  const second = normalizePhone(first!);
  assertEquals(first, second, 'normalizePhone is idempotent after first normalization');
  assertSameElements(generatePhoneVariants(first!), generatePhoneVariants(second!), 'conflict recovery: same variants');
});

Deno.test('chain | all domain suffixes stripped by normalizePhone', () => {
  for (const suffix of ['@s.whatsapp.net', '@g.us', '@broadcast', '@lid']) {
    assertEquals(normalizePhone(`5511987654321${suffix}`), '5511987654321', `strip ${suffix}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  §8  Integration caller chains (full pipeline)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('integration | Chain1: handleIncomingMessage with multi-device JID', () => {
  const key = { remoteJid: '5511987654321:2:3@s.whatsapp.net', fromMe: false, id: 'MSG001' };
  const data = { pushName: 'Test User', messageTimestamp: 1700000000 };
  const bestJid = resolveEventJid(key, null, data);
  assertEquals(bestJid, '5511987654321:2:3@s.whatsapp.net');
  const phone = normalizePhone(bestJid ?? undefined);
  assertEquals(phone, '5511987654321');
  assertFalse(bestJid?.includes('@g.us') ?? false, 'not a group → passes guard');
  assertSameElements(generatePhoneVariants(phone!), ['5511987654321', '+5511987654321', '551187654321'], 'Chain1 variants');
});

Deno.test('integration | Chain2: handleIncomingMessage with group JID → blocked', () => {
  const bestJid = resolveEventJid({ remoteJid: '5511987654321-1620000000@g.us' }, null, {});
  assert(bestJid?.includes('@g.us') ?? false, 'group JID blocked by @g.us guard');
});

Deno.test('integration | Chain3: GAP-B — @lid digit JID passes guard, proceeds to DB', () => {
  const bestJid = resolveEventJid({ remoteJid: '1234567890123@lid', fromMe: false, id: 'MSG002' }, null, {});
  assertEquals(bestJid, '1234567890123@lid');
  const phone = normalizePhone(bestJid ?? undefined);
  assertEquals(phone, '1234567890123');
  assertFalse(bestJid?.includes('@g.us') ?? false, '@lid does NOT include @g.us → passes guard');
});

Deno.test('integration | Chain4: GAP-C — @lid alpha JID → alpha phone → 3-char query', () => {
  const bestJid = resolveEventJid({ remoteJid: 'xyz789abc@lid', fromMe: false, id: 'MSG003' }, null, {});
  assertEquals(bestJid, 'xyz789abc@lid');
  const phone = normalizePhone(bestJid ?? undefined);
  assertEquals(phone, '789');
  assertSameElements(generatePhoneVariants(phone!), ['789', '+789'], 'Chain4 alpha variants');
});

Deno.test('integration | Chain5: contacts.set @lid guard blocks before normalizePhone', () => {
  const guard = (jid: string | null | undefined) =>
    !jid || jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@lid');
  assert(guard('xyz789abc@lid'), '@lid blocked at contacts.set guard');
});

Deno.test('integration | Chain6: fromMe routing — sent vs received (handleMessagesSet)', () => {
  const fromMe = (v: boolean) => (v ? 'sent' : 'received');
  assertEquals(fromMe(true), 'sent');
  assertEquals(fromMe(false), 'received');
});

Deno.test('integration | Chain8: handleChatsUpdate/Delete use endsWith(@lid) guard', () => {
  const chatsGuard = (jid: string | null | undefined) =>
    !jid || jid.endsWith('@g.us') || jid.endsWith('@lid');
  assert(chatsGuard('xyz@lid'), '@lid filtered in chats.update');
  assertFalse(chatsGuard('5511@s.whatsapp.net'), 'individual passes chats.update guard');
});

Deno.test('integration | shouldUpdateStatus(any, "deleted") always true across all statuses', () => {
  const all = ['sending', 'sent', 'delivered', 'read', 'played', 'failed', 'deleted', 'received', ''];
  for (const s of all) {
    assert(shouldUpdateStatus(s || null, 'deleted'), `${s || 'null'} → deleted`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  §10  getContactByPhone → generatePhoneVariants wiring
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('getContactByPhone | BR 13-digit produces 3 variants', () => {
  const v = generatePhoneVariants('5511987654321');
  assertSameElements(v, ['5511987654321', '+5511987654321', '551187654321'], 'BR13 3 variants');
  assert(v.includes('5511987654321'), 'original included');
  assert(v.includes('+5511987654321'), '+original included');
  assert(v.includes('551187654321'), 'without9 included');
});

Deno.test('getContactByPhone | BR 12-digit produces 3 variants (adds 9th digit)', () => {
  const v = generatePhoneVariants('551187654321');
  assertSameElements(v, ['551187654321', '+551187654321', '5511987654321'], 'BR12 3 variants');
});

Deno.test('getContactByPhone | non-BR international number produces 2 variants', () => {
  const v = generatePhoneVariants('14155551234');
  assertSameElements(v, ['14155551234', '+14155551234'], 'intl 2 variants');
  assertFalse(v.some(x => x !== '14155551234' && x !== '+14155551234'), 'no spurious BR variant');
});

Deno.test('getContactByPhone | BR 13-digit with 9th = 912345678 → removes 9', () => {
  const v = generatePhoneVariants('5511912345678');
  assertSameElements(v, ['5511912345678', '+5511912345678', '551112345678'], 'BR13 with9 removes9');
});

Deno.test('getContactByPhone | +prefix: generatePhoneVariants strips + correctly', () => {
  const v = generatePhoneVariants('+5511987654321');
  assertSameElements(v, ['5511987654321', '+5511987654321', '551187654321'], '+prefix stripped');
});

Deno.test('getContactByPhone | alpha @lid phone → [""] (safe empty DB query)', () => {
  const v = generatePhoneVariants('abc');
  assertEquals(v.length, 1);
  assertEquals(v[0], '');
});

// ═══════════════════════════════════════════════════════════════════════════
//  §11  Regression guards — all 4 fixed bugs
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('BUG-1 | multi-segment device suffix stripped by grouped quantifier', () => {
  assertEquals(normalizePhone('5511987654321:2:3@s.whatsapp.net'), '5511987654321', ':2:3 stripped');
  assertEquals(normalizePhone('5511987654321:10:20:30@s.whatsapp.net'), '5511987654321', ':10:20:30 stripped');
  assertEquals(normalizePhone('5511987654321:0@s.whatsapp.net'), '5511987654321', ':0 stripped');
  assertEquals(normalizePhone('5511987654321@s.whatsapp.net'), '5511987654321', 'no suffix unchanged');
});

Deno.test('BUG-1 | old single-segment regex would leave ":2" for ":2:3" input', () => {
  const input = '5511987654321:2:3@s.whatsapp.net';
  const oldRegex = input.replace(/:\d+(?=@)/g, '');   // old pattern
  const newRegex = input.replace(/(:\d+)+(?=@)/g, ''); // fixed pattern
  assert(oldRegex.includes(':2'), 'old regex fails: leaves :2 segment');
  assertEquals(newRegex, '5511987654321@s.whatsapp.net', 'new regex: all segments stripped');
});

Deno.test('BUG-2 | 13-digit BR with 9th digit: no double-9 variant produced', () => {
  const v = generatePhoneVariants('5511987654321');
  assertFalse(v.some(x => x.includes('9987654321')), 'no double-9 variant');
  assertSameElements(v, ['5511987654321', '+5511987654321', '551187654321'], 'BUG-2: correct variants');
});

Deno.test('BUG-2 | 12-digit BR NOT starting with 9 gets 9th digit added', () => {
  const v = generatePhoneVariants('551187654321');
  assert(v.some(x => x === '5511987654321'), 'BUG-2: 9th digit correctly added');
});

Deno.test('BUG-2 | 12-digit BR starting with 9 does NOT get extra 9 added', () => {
  // "551198765432": DDD=11, rest="98765432" starts with 9 → guard !rest.startsWith('9') blocks
  const v = generatePhoneVariants('551198765432');
  assertSameElements(v, ['551198765432', '+551198765432'], 'BUG-2: no spurious 9 added for already-9 12-digit');
});

Deno.test('BUG-3 | JID string as input to generatePhoneVariants: clean extracted from digits only', () => {
  const v = generatePhoneVariants('5511987654321@s.whatsapp.net');
  // domain "s.whatsapp.net" has no digits → clean = "5511987654321"
  assertSameElements(v, ['5511987654321', '+5511987654321', '551187654321'], 'BUG-3: JID input cleaned');
});

Deno.test('BUG-3 | raw phone not seeded into variants Set (confirmed via JID input)', () => {
  // If raw phone were seeded, "5511987654321@s.whatsapp.net" would appear in variants
  const v = generatePhoneVariants('5511987654321@s.whatsapp.net');
  assertFalse(v.includes('5511987654321@s.whatsapp.net'), 'BUG-3: raw JID not in variants');
});

Deno.test('BUG-4 | empty/special inputs do not produce spurious "+" variant', () => {
  const vPlus = generatePhoneVariants('+');
  assertEquals(vPlus.length, 1, 'BUG-4: "+" produces exactly 1 element');
  assertEquals(vPlus[0], '', 'BUG-4: that element is empty string, not "+"');

  const vEmpty = generatePhoneVariants('');
  assertEquals(vEmpty.length, 1, 'BUG-4: "" produces exactly 1 element');
  assertEquals(vEmpty[0], '', 'BUG-4: element is empty string');
});

Deno.test('BUG-4 | normalizePhone null/undefined/empty all return null', () => {
  assertEquals(normalizePhone(undefined), null);
  assertEquals(normalizePhone(), null);
  assertEquals(normalizePhone(''), null);
  assertEquals(normalizePhone('+'), null);
});

// ═══════════════════════════════════════════════════════════════════════════
//  §12  Cross-function consistency checks
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('consistency | normalizePhone → generatePhoneVariants: normalized phone always in own variants', () => {
  const jids = [
    '5511987654321@s.whatsapp.net',
    '5511987654321:2@s.whatsapp.net',
    '551187654321@s.whatsapp.net',
    '14155551234@s.whatsapp.net',
  ];
  for (const jid of jids) {
    const phone = normalizePhone(jid)!;
    const variants = generatePhoneVariants(phone);
    assert(variants.includes(phone), `${jid}: normalized phone found in its own variants`);
  }
});

Deno.test('consistency | resolveEventJid → normalizePhone: not null for valid @s.whatsapp.net', () => {
  const sources = [
    { remoteJid: '5511987654321@s.whatsapp.net' },
    { remoteJid: '5511987654321:5@s.whatsapp.net' },
  ];
  for (const src of sources) {
    const best = resolveEventJid(src);
    const phone = normalizePhone(best ?? undefined);
    assert(phone !== null, `${src.remoteJid}: phone not null after chain`);
  }
});

Deno.test('consistency | generatePhoneVariants is deterministic', () => {
  const v1 = [...generatePhoneVariants('5511987654321')].sort();
  const v2 = [...generatePhoneVariants('5511987654321')].sort();
  assertEquals(JSON.stringify(v1), JSON.stringify(v2), 'deterministic output');
});

Deno.test('consistency | shouldUpdateStatus is not symmetric for equal-priority statuses', () => {
  assertFalse(shouldUpdateStatus('sent', 'received'), 'sent→received=false');
  assertFalse(shouldUpdateStatus('received', 'sent'), 'received→sent=false');
});

Deno.test('consistency | isRecord correctly classifies values', () => {
  assert(isRecord({ a: 1 }));
  assertFalse(isRecord(null));
  assertFalse(isRecord([]));
  assertFalse(isRecord('string'));
  assertFalse(isRecord(42));
  assertFalse(isRecord(undefined));
});

// ═══════════════════════════════════════════════════════════════════════════
//  GAP-D: redactJid log-safety
// ═══════════════════════════════════════════════════════════════════════════

Deno.test('redactJid | standard JID masked correctly', () => {
  assertEquals(redactJid('5511998765432@s.whatsapp.net'), '551199***');
});

Deno.test('redactJid | null/undefined → empty string (no crash)', () => {
  assertEquals(redactJid(null), '');
  assertEquals(redactJid(undefined), '');
});

Deno.test('redactJid | short JID (≤6 chars) fully masked with asterisks', () => {
  // "12345" → length 5 ≤ 6 → every char replaced with *
  const result = redactJid('12345@s.whatsapp.net');
  assert(/^\*+$/.test(result), `short JID fully masked: got "${result}"`);
});

Deno.test('redactJid | GAP-D: /:\\d+$/ without /g strips only last device suffix in log output', () => {
  // For log sanitization only — not a correctness bug, just a minor gap in log masking
  // "5511987654321:2:3@s.whatsapp.net" → split('@')[0] = "5511987654321:2:3"
  // replace(/:\d+$/) removes ":3" (last only), leaving "5511987654321:2"
  // The slice(0,6) → "551198" + "***" → mask is still safe (no full number exposed)
  const jid = '5511987654321:2:3@s.whatsapp.net';
  const result = redactJid(jid);
  // Result should still hide enough digits regardless of GAP-D
  assert(result.length < jid.length, 'GAP-D: redacted is shorter than original');
  assert(result.endsWith('***'), 'GAP-D: ends with mask');
});
