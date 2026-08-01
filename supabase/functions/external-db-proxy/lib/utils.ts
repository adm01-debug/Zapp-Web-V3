import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { LogPayload, QueryLogContext, QueryOutcome, MetricSample } from './types.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
  'Access-Control-Expose-Headers': 'x-correlation-id, x-request-id, server-timing',
}

export function shortRid(): string {
  try {
    return crypto.randomUUID().slice(0, 8)
  } catch {
    return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')
  }
}

export function logEvent(base: LogPayload, extra: LogPayload = {}) {
  try {
    console.log(JSON.stringify({ fn: 'external-db-proxy', ts: new Date().toISOString(), ...base, ...extra }))
  } catch {
    // Never let logging crash the worker
  }
}

export function buildQueryLog(ctx: QueryLogContext, outcome: QueryOutcome): LogPayload {
  return {
    phase: 'query',
    cid: ctx.cid,
    rid: ctx.rid,
    op: ctx.op,
    target: ctx.target,
    ms: outcome.ms,
    ok: outcome.ok,
    status: outcome.status,
    timeout_fired: outcome.timeoutFired ?? false,
    pg_timeout: outcome.pgTimeout ?? false,
    err_code: outcome.errCode,
    err_msg: outcome.errMsg,
    row_count: outcome.rowCount,
    schema_retries: outcome.schemaRetries ?? 0,
  }
}

export function isSchemaCacheError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'PGRST002') return true
  const msg = err.message || ''
  return /schema cache/i.test(msg) && /PGRST002|could not query the database/i.test(msg)
}

export function isStatementTimeout(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === '57014') return true
  return /statement timeout|canceling statement/i.test(err.message || '')
}

export function isSchemaNotExposed(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  if (err.code === 'PGRST106') return true
  return /Invalid schema:/i.test(err.message || '')
}

export function classifyUpstreamError(
  message: string | undefined,
  timeoutFired: boolean,
  code?: string,
): { status: number; pgTimeout: boolean } {
  if (timeoutFired) return { status: 504, pgTimeout: false }
  if (!message) return { status: 400, pgTimeout: false }
  if (/statement timeout|canceling statement/i.test(message) || code === '57014') {
    return { status: 504, pgTimeout: true }
  }
  if (isSchemaCacheError({ message, code })) {
    return { status: 503, pgTimeout: false }
  }
  return { status: 400, pgTimeout: false }
}

let metricsClient: ReturnType<typeof createClient> | null = null
function getMetricsClient() {
  if (metricsClient) return metricsClient
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  metricsClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return metricsClient
}

export function recordMetric(sample: MetricSample) {
  const client = getMetricsClient()
  if (!client) return
  const errMsg = sample.err_msg ? sample.err_msg.slice(0, 500) : null
  Promise.resolve(
    client.from('proxy_metrics').insert({
      ...sample,
      err_msg: errMsg,
    })
  ).then((res) => {
    if (res?.error) {
      logEvent({ phase: 'metric_error', err: res.error.message })
    }
  }).catch((e: unknown) => {
    logEvent({ phase: 'metric_error', err: (e as Error)?.message })
  })
}

export function errorBody(
  cid: string,
  rid: string,
  err: { message: string; code?: string },
): Record<string, unknown> {
  const schemaCache = isSchemaCacheError(err)
  const stmtTimeout = isStatementTimeout(err)
  return {
    error: err.message,
    code: err.code,
    cid,
    rid,
    retryable: schemaCache,
    hint: stmtTimeout
      ? 'Query exceeded statement timeout. Add a more selective filter, reduce the page size, or paginate.'
      : schemaCache
        ? 'Upstream PostgREST is reloading its schema cache. Retry shortly.'
        : undefined,
  }
}
