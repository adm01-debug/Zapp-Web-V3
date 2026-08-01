import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildQueryLog, classifyUpstreamError } from './index.ts'

Deno.test('classifyUpstreamError: timeout flag wins → 504', () => {
  const r = classifyUpstreamError('whatever', true)
  assertEquals(r.status, 504)
  assertEquals(r.pgTimeout, false)
})

Deno.test('classifyUpstreamError: postgres statement timeout → 504 + pgTimeout', () => {
  const r = classifyUpstreamError('canceling statement due to statement timeout', false)
  assertEquals(r.status, 504)
  assertEquals(r.pgTimeout, true)
})

Deno.test('classifyUpstreamError: generic error → 400', () => {
  const r = classifyUpstreamError('null value violates not-null constraint', false)
  assertEquals(r.status, 400)
  assertEquals(r.pgTimeout, false)
})

Deno.test('classifyUpstreamError: no message → 400', () => {
  const r = classifyUpstreamError(undefined, false)
  assertEquals(r.status, 400)
})

Deno.test('buildQueryLog: includes cid, rid, op, target, ms, flags', () => {
  const log = buildQueryLog(
    { cid: 'cid123', rid: 'rid456', op: 'select', target: 'evolution_messages', startedAt: 0 },
    { ok: false, ms: 1234, status: 504, timeoutFired: true, pgTimeout: false, errMsg: 'proxy_timeout' },
  )
  assertEquals(log.phase, 'query')
  assertEquals(log.cid, 'cid123')
  assertEquals(log.rid, 'rid456')
  assertEquals(log.op, 'select')
  assertEquals(log.target, 'evolution_messages')
  assertEquals(log.ms, 1234)
  assertEquals(log.status, 504)
  assertEquals(log.timeout_fired, true)
  assertEquals(log.pg_timeout, false)
  assertEquals(log.err_msg, 'proxy_timeout')
})

Deno.test('buildQueryLog: defaults timeout flags to false', () => {
  const log = buildQueryLog(
    { cid: 'a', rid: 'b', op: 'rpc', target: 'rpc_list_contacts', startedAt: 0 },
    { ok: true, ms: 50, status: 200, rowCount: 10 },
  )
  assertEquals(log.timeout_fired, false)
  assertEquals(log.pg_timeout, false)
  assertEquals(log.row_count, 10)
})
