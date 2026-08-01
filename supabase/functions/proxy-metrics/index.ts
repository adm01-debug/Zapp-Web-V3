// supabase/functions/proxy-metrics/index.ts
//
// Prometheus-compatible scrape endpoint for the `external-db-proxy`.
// Aggregates the last N minutes of rows from `public.proxy_metrics` and emits
// counters + summary-style gauges (count / p50 / p95 / p99 / avg latency).
//
// Auth model:
//   - Public scrape (Grafana / Prometheus) via shared bearer token in
//     `PROXY_METRICS_TOKEN` secret. Send `Authorization: Bearer <token>`.
//   - If the secret is unset, the endpoint refuses to serve (fail-closed).
//
// Query string:
//   ?window=5m   (1m | 5m | 15m | 60m, default 5m)
//
// Output: text/plain; version=0.0.4 (Prometheus exposition format).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { getCorsHeaders, mergeCsvHeaderValues } from '../_shared/validation.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SCRAPE_TOKEN = Deno.env.get('PROXY_METRICS_TOKEN') ?? ''

function getPromHeaders(req?: Request) {
  const shared = getCorsHeaders(req)
  return {
    ...shared,
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Headers': mergeCsvHeaderValues(
      shared['Access-Control-Allow-Headers'],
      'authorization, content-type',
    ),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

type MetricRow = {
  op: string
  target: string
  status: number
  ms: number
  ok: boolean
  timeout_fired: boolean
  pg_timeout: boolean
  err_code: string | null
}

type WindowKey = '1m' | '5m' | '15m' | '60m'
const WINDOW_SECONDS: Record<WindowKey, number> = { '1m': 60, '5m': 300, '15m': 900, '60m': 3600 }

function parseWindow(raw: string | null): WindowKey {
  if (raw && raw in WINDOW_SECONDS) return raw as WindowKey
  return '5m'
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1] ?? sorted[base]
  return sorted[base] + rest * (next - sorted[base])
}

/** Escape a Prometheus label value per exposition spec. */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function buildExposition(rows: MetricRow[], windowKey: WindowKey, generatedAtMs: number): string {
  const lines: string[] = []

  lines.push(`# HELP proxy_metrics_window_seconds Aggregation window in seconds for this scrape.`)
  lines.push(`# TYPE proxy_metrics_window_seconds gauge`)
  lines.push(`proxy_metrics_window_seconds ${WINDOW_SECONDS[windowKey]}`)

  lines.push(`# HELP proxy_metrics_scrape_timestamp_seconds Unix timestamp when this scrape was generated.`)
  lines.push(`# TYPE proxy_metrics_scrape_timestamp_seconds gauge`)
  lines.push(`proxy_metrics_scrape_timestamp_seconds ${(generatedAtMs / 1000).toFixed(3)}`)

  // Group rows by (op, target)
  type Bucket = {
    op: string
    target: string
    total: number
    ok: number
    err: number
    timeoutFired: number
    pgTimeout: number
    statusCounts: Map<number, number>
    errCodeCounts: Map<string, number>
    latencies: number[]
  }
  const buckets = new Map<string, Bucket>()
  for (const r of rows) {
    const key = `${r.op}|${r.target}`
    let b = buckets.get(key)
    if (!b) {
      b = {
        op: r.op,
        target: r.target,
        total: 0,
        ok: 0,
        err: 0,
        timeoutFired: 0,
        pgTimeout: 0,
        statusCounts: new Map(),
        errCodeCounts: new Map(),
        latencies: [],
      }
      buckets.set(key, b)
    }
    b.total++
    if (r.ok) b.ok++
    else b.err++
    if (r.timeout_fired) b.timeoutFired++
    if (r.pg_timeout) b.pgTimeout++
    b.statusCounts.set(r.status, (b.statusCounts.get(r.status) ?? 0) + 1)
    if (r.err_code) {
      b.errCodeCounts.set(r.err_code, (b.errCodeCounts.get(r.err_code) ?? 0) + 1)
    }
    b.latencies.push(r.ms)
  }

  // Counters
  lines.push(`# HELP proxy_requests_total Total proxy requests in window, by op and target.`)
  lines.push(`# TYPE proxy_requests_total counter`)
  for (const b of buckets.values()) {
    lines.push(`proxy_requests_total{op="${esc(b.op)}",target="${esc(b.target)}"} ${b.total}`)
  }

  lines.push(`# HELP proxy_requests_ok_total Successful proxy requests in window.`)
  lines.push(`# TYPE proxy_requests_ok_total counter`)
  for (const b of buckets.values()) {
    lines.push(`proxy_requests_ok_total{op="${esc(b.op)}",target="${esc(b.target)}"} ${b.ok}`)
  }

  lines.push(`# HELP proxy_requests_error_total Failed proxy requests in window (any non-ok).`)
  lines.push(`# TYPE proxy_requests_error_total counter`)
  for (const b of buckets.values()) {
    lines.push(`proxy_requests_error_total{op="${esc(b.op)}",target="${esc(b.target)}"} ${b.err}`)
  }

  lines.push(`# HELP proxy_requests_timeout_fired_total Proxy hard-timeout (14s wrapper) fires.`)
  lines.push(`# TYPE proxy_requests_timeout_fired_total counter`)
  for (const b of buckets.values()) {
    lines.push(`proxy_requests_timeout_fired_total{op="${esc(b.op)}",target="${esc(b.target)}"} ${b.timeoutFired}`)
  }

  lines.push(`# HELP proxy_requests_pg_timeout_total Postgres statement timeouts (57014) seen.`)
  lines.push(`# TYPE proxy_requests_pg_timeout_total counter`)
  for (const b of buckets.values()) {
    lines.push(`proxy_requests_pg_timeout_total{op="${esc(b.op)}",target="${esc(b.target)}"} ${b.pgTimeout}`)
  }

  // Status code breakdown
  lines.push(`# HELP proxy_requests_status_total Proxy requests broken down by HTTP status.`)
  lines.push(`# TYPE proxy_requests_status_total counter`)
  for (const b of buckets.values()) {
    for (const [status, count] of b.statusCounts) {
      lines.push(
        `proxy_requests_status_total{op="${esc(b.op)}",target="${esc(b.target)}",status="${status}"} ${count}`,
      )
    }
  }

  // Error code breakdown (PGRST002, 57014, etc.)
  lines.push(`# HELP proxy_error_codes_total Upstream error codes seen (e.g. PGRST002, 57014).`)
  lines.push(`# TYPE proxy_error_codes_total counter`)
  for (const b of buckets.values()) {
    for (const [code, count] of b.errCodeCounts) {
      lines.push(
        `proxy_error_codes_total{op="${esc(b.op)}",target="${esc(b.target)}",code="${esc(code)}"} ${count}`,
      )
    }
  }

  // Latency summary (computed quantiles, exposed as gauges)
  lines.push(`# HELP proxy_request_duration_ms Latency quantiles in milliseconds (computed over window).`)
  lines.push(`# TYPE proxy_request_duration_ms gauge`)
  for (const b of buckets.values()) {
    if (b.latencies.length === 0) continue
    const sorted = [...b.latencies].sort((a, z) => a - z)
    const sum = sorted.reduce((acc, v) => acc + v, 0)
    const avg = sum / sorted.length
    const p50 = quantile(sorted, 0.5)
    const p95 = quantile(sorted, 0.95)
    const p99 = quantile(sorted, 0.99)
    const max = sorted[sorted.length - 1]
    const labels = `op="${esc(b.op)}",target="${esc(b.target)}"`
    lines.push(`proxy_request_duration_ms{${labels},quantile="0.5"} ${p50.toFixed(2)}`)
    lines.push(`proxy_request_duration_ms{${labels},quantile="0.95"} ${p95.toFixed(2)}`)
    lines.push(`proxy_request_duration_ms{${labels},quantile="0.99"} ${p99.toFixed(2)}`)
    lines.push(`proxy_request_duration_ms{${labels},quantile="avg"} ${avg.toFixed(2)}`)
    lines.push(`proxy_request_duration_ms{${labels},quantile="max"} ${max}`)
  }

  return lines.join('\n') + '\n'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getPromHeaders(req) })
  }
  if (req.method !== 'GET') {
    return new Response('Method not allowed\n', { status: 405, headers: getPromHeaders(req) })
  }

  // Auth — fail-closed if no token configured.
  if (!SCRAPE_TOKEN) {
    return new Response(
      '# proxy-metrics: PROXY_METRICS_TOKEN secret is not configured.\n',
      { status: 503, headers: getPromHeaders(req) },
    )
  }
  const auth = req.headers.get('Authorization') ?? ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : auth
  if (provided !== SCRAPE_TOKEN) {
    return new Response('# unauthorized\n', { status: 401, headers: getPromHeaders(req) })
  }

  const url = new URL(req.url)
  const windowKey = parseWindow(url.searchParams.get('window'))
  const since = new Date(Date.now() - WINDOW_SECONDS[windowKey] * 1000).toISOString()

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Page through proxy_metrics rows in the window (cap 5000 to bound memory).
  const PAGE = 1000
  const HARD_CAP = 5000
  const rows: MetricRow[] = []
  for (let offset = 0; offset < HARD_CAP; offset += PAGE) {
    const { data, error } = await supabase
      .from('proxy_metrics')
      .select('op,target,status,ms,ok,timeout_fired,pg_timeout,err_code')
      .gte('ts', since)
      .order('ts', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error) {
      return new Response(
        `# error fetching proxy_metrics: ${error.message.replace(/\n/g, ' ')}\n`,
        { status: 500, headers: getPromHeaders(req) },
      )
    }
    if (!data || data.length === 0) break
    rows.push(...(data as MetricRow[]))
    if (data.length < PAGE) break
  }

  const body = buildExposition(rows, windowKey, Date.now())
  return new Response(body, { status: 200, headers: getPromHeaders(req) })
})
