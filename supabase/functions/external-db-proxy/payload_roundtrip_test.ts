/**
 * Defesa em profundidade — formato de payload do external-db-proxy.
 *
 * Cenário: caso o useMessageStatus seja migrado futuramente para usar a
 * external-db-proxy (em vez do client supabase direto do self-hosted),
 * é crítico que os campos `error_code` e `error_reason` da tabela
 * `messages` sobrevivam ao roundtrip JSON pelo proxy sem perda.
 *
 * O proxy faz `new Response(JSON.stringify({ data, count, cid, rid }))` —
 * estes testes simulam fixtures da DB e validam que após o
 * stringify/parse os campos chegam idênticos do outro lado.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'

interface MessageRow {
  id: string
  status: string
  status_updated_at: string
  error_code: string | null
  error_reason: string | null
}

const FAILED_AUTH_FIXTURE: MessageRow = {
  id: 'wa-001',
  status: 'failed_auth',
  status_updated_at: '2024-08-10T12:00:00.000Z',
  error_code: 'AUTH_401',
  error_reason: 'Invalid Evolution API key',
}

const FAILED_RETRIES_FIXTURE: MessageRow = {
  id: 'wa-002',
  status: 'failed_retries',
  status_updated_at: '2024-08-10T12:01:00.000Z',
  error_code: 'RETRIES_EXHAUSTED',
  error_reason: 'Max 5 attempts reached after upstream timeouts',
}

const NULL_ERROR_FIXTURE: MessageRow = {
  id: 'wa-003',
  status: 'sent',
  status_updated_at: '2024-08-10T12:02:00.000Z',
  error_code: null,
  error_reason: null,
}

/** Reproduz o que o external-db-proxy faz na resposta de um SELECT. */
function buildProxyResponse(rows: MessageRow[], cid = 'cid123', rid = 'rid456'): Response {
  return new Response(
    JSON.stringify({
      data: rows,
      count: rows.length,
      cid,
      rid,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  )
}

Deno.test('proxy roundtrip: failed_auth row preserves error_code and error_reason', async () => {
  const resp = buildProxyResponse([FAILED_AUTH_FIXTURE])
  const body = await resp.json()

  assert(Array.isArray(body.data))
  assertEquals(body.data.length, 1)
  const row = body.data[0]
  assertEquals(row.id, 'wa-001')
  assertEquals(row.status, 'failed_auth')
  assertEquals(row.error_code, 'AUTH_401')
  assertEquals(row.error_reason, 'Invalid Evolution API key')
})

Deno.test('proxy roundtrip: failed_retries row preserves error_code and error_reason', async () => {
  const resp = buildProxyResponse([FAILED_RETRIES_FIXTURE])
  const body = await resp.json()

  const row = body.data[0]
  assertEquals(row.status, 'failed_retries')
  assertEquals(row.error_code, 'RETRIES_EXHAUSTED')
  assertEquals(row.error_reason, 'Max 5 attempts reached after upstream timeouts')
})

Deno.test('proxy roundtrip: null error fields stay null (not stripped, not undefined-stringified)', async () => {
  const resp = buildProxyResponse([NULL_ERROR_FIXTURE])
  const body = await resp.json()

  const row = body.data[0]
  // JSON.stringify converte `undefined` em ausência de chave; null permanece null.
  // Garantimos que o proxy não está convertendo null → undefined → ausência.
  assert('error_code' in row, 'error_code key must survive stringify when value is null')
  assert('error_reason' in row, 'error_reason key must survive stringify when value is null')
  assertEquals(row.error_code, null)
  assertEquals(row.error_reason, null)
})

Deno.test('proxy roundtrip: mixed batch — every row keeps its own error fields', async () => {
  const resp = buildProxyResponse([
    FAILED_AUTH_FIXTURE,
    FAILED_RETRIES_FIXTURE,
    NULL_ERROR_FIXTURE,
  ])
  const body = await resp.json()

  assertEquals(body.data.length, 3)
  // Cross-check: nenhum vazamento entre linhas (bug clássico de loop com referência mutável)
  assertEquals(body.data[0].error_code, 'AUTH_401')
  assertEquals(body.data[1].error_code, 'RETRIES_EXHAUSTED')
  assertEquals(body.data[2].error_code, null)

  assertEquals(body.data[0].error_reason, 'Invalid Evolution API key')
  assertEquals(body.data[1].error_reason, 'Max 5 attempts reached after upstream timeouts')
  assertEquals(body.data[2].error_reason, null)
})

Deno.test('proxy roundtrip: cid and rid are present alongside data (correlation contract)', async () => {
  const resp = buildProxyResponse([FAILED_AUTH_FIXTURE], 'mycid', 'myrid')
  const body = await resp.json()
  assertEquals(body.cid, 'mycid')
  assertEquals(body.rid, 'myrid')
  // E os dados continuam intactos junto
  assertEquals(body.data[0].error_code, 'AUTH_401')
})

Deno.test('proxy roundtrip: long error_reason is not truncated by stringify', async () => {
  const longReason = 'X'.repeat(2000)
  const fixture: MessageRow = {
    ...FAILED_RETRIES_FIXTURE,
    id: 'wa-long',
    error_reason: longReason,
  }
  const resp = buildProxyResponse([fixture])
  const body = await resp.json()
  assertEquals(body.data[0].error_reason.length, 2000)
  assertEquals(body.data[0].error_reason, longReason)
})

Deno.test('proxy roundtrip: special characters in error_reason survive (quotes, newlines, unicode)', async () => {
  const tricky = 'Erro: "401" \nUnauthorized — token revogado 🚫'
  const fixture: MessageRow = {
    ...FAILED_AUTH_FIXTURE,
    id: 'wa-tricky',
    error_reason: tricky,
  }
  const resp = buildProxyResponse([fixture])
  const body = await resp.json()
  assertEquals(body.data[0].error_reason, tricky)
})
