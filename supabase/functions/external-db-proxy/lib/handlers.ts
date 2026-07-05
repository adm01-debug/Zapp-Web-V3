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
      const pgRes = res.data as { data: unknown; error: { message: string; code?: string } | null } | null;
      rpcData = pgRes?.data ?? null
      error = pgRes?.error ?? null
      timeoutFired = res.timeoutFired
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'proxy_timeout') {
        timeoutFired = true
        break
      }
      error = { message: e instanceof Error ? e.message : String(e) }
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

type DynamicQueryBuilder = Record<string, (col: string, val: unknown) => DynamicQueryBuilder>

export async function handleQuery(
  client: SupabaseClient,
  action: 'select' | 'update',
  table: string,
  body: Record<string, unknown>,
  ctx: QueryLogContext,
  headers: Record<string, string>
): Promise<Response> {
  const queryStart = Date.now()

  if (!table) {
    return new Response(JSON.stringify({ error: 'Table name is required', cid: ctx.cid, rid: ctx.rid }), { status: 400, headers })
  }

  let query: PromiseLike<unknown> & DynamicQueryBuilder

  if (action === 'select') {
    query = client.from(table).select((body.select as string) || '*', {
      count: (body.countMode as 'exact' | 'planned' | 'estimated' | undefined) ?? null,
    }) as unknown as typeof query
  } else if (action === 'update') {
    query = client.from(table)
      .update((body.data as Record<string, unknown>) || {})
      .match((body.match as Record<string, unknown>) || {}) as unknown as typeof query
  } else {
    return new Response(JSON.stringify({ error: `Unsupported action: ${action}`, cid: ctx.cid, rid: ctx.rid }), { status: 400, headers })
  }

  const ALLOWED_FILTER_OPERATORS = new Set([
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike', 'is', 'in', 'contains',
    'containedBy', 'overlaps', 'textSearch',
    'not', 'or', 'filter',
  ]);

  if (Array.isArray(body.filters)) {
    for (const f of body.filters as ProxyFilter[]) {
      if (!ALLOWED_FILTER_OPERATORS.has(f.operator)) {
        return new Response(JSON.stringify({ error: `Unsupported filter operator: ${f.operator}`, cid: ctx.cid, rid: ctx.rid }), { status: 400, headers });
      }
      query = (query as DynamicQueryBuilder)[f.operator](f.column, f.value) as unknown as typeof query
    }
  }

  if (body.order) {
    const order = body.order as { column: string; ascending?: boolean }
    query = (query as unknown as ReturnType<typeof client.from>)
      .order(order.column, { ascending: !!order.ascending }) as unknown as typeof query
  }

  if (typeof body.limit === 'number') {
    query = (query as unknown as ReturnType<typeof client.from>).limit(body.limit) as unknown as typeof query
  }
  if (typeof body.offset === 'number') {
    query = (query as unknown as ReturnType<typeof client.from>)
      .range(body.offset, body.offset + ((body.limit as number) || 10) - 1) as unknown as typeof query
  }

  let queryData: unknown = null
  let error: { message: string; code?: string } | null = null
  let count: number | null = null
  let schemaRetries = 0
  let timeoutFired = false

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await withTimeout(query)
      const pgRes = res.data as { data: unknown; error: { message: string; code?: string } | null; count?: number | null } | null
      queryData = pgRes?.data ?? null
      error = pgRes?.error ?? null
      count = pgRes?.count ?? null
      timeoutFired = res.timeoutFired
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'proxy_timeout') {
        timeoutFired = true
        break
      }
      error = { message: e instanceof Error ? e.message : String(e) }
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
