import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { ProxyFilter, QueryLogContext } from './types.ts'
import {
  isSchemaCacheError,
  isSchemaNotExposed,
  classifyUpstreamError,
  logEvent,
  buildQueryLog,
  errorBody,
  corsHeaders
} from './utils.ts'

const HARD_TIMEOUT_MS = 14000

export async function withTimeout<T>(p: PromiseLike<T>): Promise<{ data: T | null; timeoutFired: boolean }> {
  let timer: number | undefined
  let timeoutFired = false
  const result = await Promise.race([
    Promise.resolve(p).then((v) => {
      if (timer !== undefined) clearTimeout(timer)
      return { data: v, timeoutFired: false }
    }),
    new Promise<{ data: null; timeoutFired: true }>((_, reject) => {
      timer = setTimeout(() => {
        timeoutFired = true
        reject(new Error('proxy_timeout'))
      }, HARD_TIMEOUT_MS) as unknown as number
    }),
  ])
  return result
}

export async function handleRpc(
  client: SupabaseClient,
  rpc: string,
  params: Record<string, unknown>,
  ctx: QueryLogContext,
  headers: Record<string, string>
): Promise<Response> {
  const queryStart = Date.now()
  const cleanParams = { ...params }
  delete cleanParams.__cid

  let rpcData: unknown = null
  let error: { message: string; code?: string } | null = null
  let schemaRetries = 0
  let timeoutFired = false

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await withTimeout(client.rpc(rpc, cleanParams))
      rpcData = (res.data as any).data
      error = (res.data as any).error
      timeoutFired = res.timeoutFired
    } catch (e: any) {
      if (e.message === 'proxy_timeout') {
        timeoutFired = true
        break
      }
      error = { message: e.message }
    }

    if (!isSchemaCacheError(error)) break
    schemaRetries++
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
  }

  const ms = Date.now() - queryStart

  if (timeoutFired) {
    logEvent(buildQueryLog(ctx, { ok: false, ms, status: 504, timeoutFired: true, errMsg: 'proxy_timeout' }))
    return new Response(
      JSON.stringify({ error: 'Query timed out.', cid: ctx.cid, rid: ctx.rid, timeout: 'proxy' }),
      { status: 504, headers }
    )
  }

  const cls = classifyUpstreamError(error?.message, false, error?.code)
  logEvent(buildQueryLog(
    ctx,
    {
      ok: !error,
      ms,
      status: error ? cls.status : 200,
      pgTimeout: cls.pgTimeout,
      errCode: error?.code,
      errMsg: error?.message,
      rowCount: Array.isArray(rpcData) ? rpcData.length : (rpcData == null ? 0 : 1),
      schemaRetries,
    }
  ))

  if (error) {
    if (isSchemaNotExposed(error)) {
      return new Response(
        JSON.stringify({ data: null, cid: ctx.cid, rid: ctx.rid, schema_unavailable: true }),
        { status: 200, headers }
      )
    }
    return new Response(JSON.stringify(errorBody(ctx.cid, ctx.rid, error)), { status: cls.status, headers })
  }

  return new Response(JSON.stringify({ data: rpcData, cid: ctx.cid, rid: ctx.rid }), { status: 200, headers })
}

export async function handleQuery(
  client: SupabaseClient,
  action: 'select' | 'update',
  table: string,
  body: any,
  ctx: QueryLogContext,
  headers: Record<string, string>
): Promise<Response> {
  const queryStart = Date.now()
  
  if (!table) {
    return new Response(JSON.stringify({ error: 'Table name is required', cid: ctx.cid, rid: ctx.rid }), { status: 400, headers })
  }

  let query: any

  if (action === 'select') {
    query = client.from(table).select((body.select as string) || '*', {
      count: (body.countMode as any) || null,
    })
  } else if (action === 'update') {
    query = client.from(table).update(body.data || {}).match(body.match || {})
  } else {
    return new Response(JSON.stringify({ error: `Unsupported action: ${action}`, cid: ctx.cid, rid: ctx.rid }), { status: 400, headers })
  }

  if (Array.isArray(body.filters)) {
    for (const f of body.filters as ProxyFilter[]) {
      (query as any)[f.operator](f.column, f.value)
    }
  }

  if (body.order) {
    query = query.order(body.order.column, { ascending: !!body.order.ascending })
  }

  if (typeof body.limit === 'number') query = query.limit(body.limit)
  if (typeof body.offset === 'number') query = query.range(body.offset, body.offset + (body.limit || 10) - 1)

  let queryData: unknown = null
  let error: { message: string; code?: string } | null = null
  let count: number | null = null
  let schemaRetries = 0
  let timeoutFired = false

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await withTimeout(query)
      queryData = (res.data as any).data
      error = (res.data as any).error
      count = (res.data as any).count
      timeoutFired = res.timeoutFired
    } catch (e: any) {
      if (e.message === 'proxy_timeout') {
        timeoutFired = true
        break
      }
      error = { message: e.message }
    }

    if (!isSchemaCacheError(error)) break
    schemaRetries++
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
  }

  const ms = Date.now() - queryStart

  if (timeoutFired) {
    logEvent(buildQueryLog(ctx, { ok: false, ms, status: 504, timeoutFired: true, errMsg: 'proxy_timeout' }))
    return new Response(
      JSON.stringify({ error: 'Query timed out.', cid: ctx.cid, rid: ctx.rid, timeout: 'proxy' }),
      { status: 504, headers }
    )
  }

  const cls = classifyUpstreamError(error?.message, false, error?.code)
  logEvent(buildQueryLog(
    ctx,
    {
      ok: !error,
      ms,
      status: error ? cls.status : 200,
      pgTimeout: cls.pgTimeout,
      errCode: error?.code,
      errMsg: error?.message,
      rowCount: Array.isArray(queryData) ? queryData.length : (queryData == null ? 0 : 1),
      schemaRetries,
    }
  ))

  if (error) {
    if (isSchemaNotExposed(error)) {
      return new Response(
        JSON.stringify({ data: null, cid: ctx.cid, rid: ctx.rid, schema_unavailable: true }),
        { status: 200, headers }
      )
    }
    return new Response(JSON.stringify(errorBody(ctx.cid, ctx.rid, error)), { status: cls.status, headers })
  }

  return new Response(
    JSON.stringify({ data: queryData, count, cid: ctx.cid, rid: ctx.rid }),
    { status: 200, headers }
  )
}
