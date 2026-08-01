// proxy-health
// Endpoint público (com auth opcional) que computa métricas agregadas da
// external-db-proxy e dispara alertas quando taxa de erro 5xx, taxa de
// timeout ou latência p95 ultrapassam limiares configurados.
//
// GET  /proxy-health                 → snapshot atual (default 15min)
// GET  /proxy-health?window=60       → janela em minutos
// GET  /proxy-health?evaluate=1      → executa avaliação e grava alertas
//
// Ideal para chamar via cron a cada 5 minutos com evaluate=1.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { getCorsHeaders, mergeCsvHeaderValues } from '../_shared/validation.ts'

function getJsonCorsHeaders(req?: Request) {
  const shared = getCorsHeaders(req)
  return {
    ...shared,
    'Access-Control-Allow-Headers': mergeCsvHeaderValues(
      shared['Access-Control-Allow-Headers'],
      'authorization, x-client-info, apikey, content-type',
    ),
  }
}

// Limiares de alerta — ajustáveis via env vars.
const THRESHOLDS = {
  error_rate_warn: Number(Deno.env.get('PROXY_ERR_RATE_WARN') ?? '0.05'),    // 5%
  error_rate_crit: Number(Deno.env.get('PROXY_ERR_RATE_CRIT') ?? '0.15'),    // 15%
  timeout_rate_warn: Number(Deno.env.get('PROXY_TIMEOUT_WARN') ?? '0.02'),   // 2%
  timeout_rate_crit: Number(Deno.env.get('PROXY_TIMEOUT_CRIT') ?? '0.08'),   // 8%
  latency_p95_warn_ms: Number(Deno.env.get('PROXY_P95_WARN_MS') ?? '2000'),
  latency_p95_crit_ms: Number(Deno.env.get('PROXY_P95_CRIT_MS') ?? '5000'),
  min_sample_size: Number(Deno.env.get('PROXY_MIN_SAMPLES') ?? '20'),
  alert_cooldown_minutes: Number(Deno.env.get('PROXY_ALERT_COOLDOWN_MIN') ?? '15'),
}

interface MetricRow {
  status: number
  ms: number
  ok: boolean
  timeout_fired: boolean
  pg_timeout: boolean
  target: string
  op: string
}

/** Quantile from a sorted array (linear interpolation). Exported for tests. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

export interface ComputedMetrics {
  window_minutes: number
  sample_size: number
  total: number
  status_5xx: number
  status_4xx: number
  status_504: number
  status_503: number
  timeouts: number
  pg_timeouts: number
  error_rate: number
  timeout_rate: number
  latency_p50_ms: number
  latency_p95_ms: number
  latency_p99_ms: number
  latency_max_ms: number
  by_target: Array<{ target: string; count: number; error_rate: number; p95_ms: number }>
}

export function computeMetrics(rows: MetricRow[], windowMinutes: number): ComputedMetrics {
  const total = rows.length
  if (total === 0) {
    return {
      window_minutes: windowMinutes,
      sample_size: 0, total: 0,
      status_5xx: 0, status_4xx: 0, status_504: 0, status_503: 0,
      timeouts: 0, pg_timeouts: 0,
      error_rate: 0, timeout_rate: 0,
      latency_p50_ms: 0, latency_p95_ms: 0, latency_p99_ms: 0, latency_max_ms: 0,
      by_target: [],
    }
  }
  let s5 = 0, s4 = 0, s504 = 0, s503 = 0, t = 0, pt = 0
  const durations: number[] = []
  const groups = new Map<string, MetricRow[]>()

  for (const r of rows) {
    if (r.status >= 500) s5++
    if (r.status >= 400 && r.status < 500) s4++
    if (r.status === 504) s504++
    if (r.status === 503) s503++
    if (r.timeout_fired) t++
    if (r.pg_timeout) pt++
    durations.push(r.ms)
    const arr = groups.get(r.target) || []
    arr.push(r)
    groups.set(r.target, arr)
  }
  durations.sort((a, b) => a - b)

  const byTarget = Array.from(groups.entries())
    .map(([target, arr]) => {
      const ds = arr.map((x) => x.ms).sort((a, b) => a - b)
      const errs = arr.filter((x) => x.status >= 500).length
      return {
        target,
        count: arr.length,
        error_rate: errs / arr.length,
        p95_ms: Math.round(quantile(ds, 0.95)),
      }
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return {
    window_minutes: windowMinutes,
    sample_size: total,
    total,
    status_5xx: s5,
    status_4xx: s4,
    status_504: s504,
    status_503: s503,
    timeouts: t,
    pg_timeouts: pt,
    error_rate: s5 / total,
    timeout_rate: t / total,
    latency_p50_ms: Math.round(quantile(durations, 0.5)),
    latency_p95_ms: Math.round(quantile(durations, 0.95)),
    latency_p99_ms: Math.round(quantile(durations, 0.99)),
    latency_max_ms: durations[durations.length - 1] ?? 0,
    by_target: byTarget,
  }
}

export interface AlertCandidate {
  kind: 'error_rate' | 'timeout_rate' | 'latency_p95'
  severity: 'warning' | 'critical'
  value: number
  threshold: number
}

export function evaluateAlerts(m: ComputedMetrics): AlertCandidate[] {
  const out: AlertCandidate[] = []
  if (m.sample_size < THRESHOLDS.min_sample_size) return out

  if (m.error_rate >= THRESHOLDS.error_rate_crit) {
    out.push({ kind: 'error_rate', severity: 'critical', value: m.error_rate, threshold: THRESHOLDS.error_rate_crit })
  } else if (m.error_rate >= THRESHOLDS.error_rate_warn) {
    out.push({ kind: 'error_rate', severity: 'warning', value: m.error_rate, threshold: THRESHOLDS.error_rate_warn })
  }

  if (m.timeout_rate >= THRESHOLDS.timeout_rate_crit) {
    out.push({ kind: 'timeout_rate', severity: 'critical', value: m.timeout_rate, threshold: THRESHOLDS.timeout_rate_crit })
  } else if (m.timeout_rate >= THRESHOLDS.timeout_rate_warn) {
    out.push({ kind: 'timeout_rate', severity: 'warning', value: m.timeout_rate, threshold: THRESHOLDS.timeout_rate_warn })
  }

  if (m.latency_p95_ms >= THRESHOLDS.latency_p95_crit_ms) {
    out.push({ kind: 'latency_p95', severity: 'critical', value: m.latency_p95_ms, threshold: THRESHOLDS.latency_p95_crit_ms })
  } else if (m.latency_p95_ms >= THRESHOLDS.latency_p95_warn_ms) {
    out.push({ kind: 'latency_p95', severity: 'warning', value: m.latency_p95_ms, threshold: THRESHOLDS.latency_p95_warn_ms })
  }

  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getJsonCorsHeaders(req) })
  }

  const url = new URL(req.url)
  const windowMinutes = Math.min(Math.max(Number(url.searchParams.get('window') ?? '15'), 1), 240)
  const evaluate = url.searchParams.get('evaluate') === '1'

  const sbUrl = Deno.env.get('SUPABASE_URL')!
  const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(sbUrl, sbKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Fetch up to 5000 most recent samples in the window (enough for solid p95)
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const { data: rows, error } = await supabase
    .from('proxy_metrics')
    .select('status, ms, ok, timeout_fired, pg_timeout, target, op')
    .gte('ts', since)
    .order('ts', { ascending: false })
    .limit(5000)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...getJsonCorsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const metrics = computeMetrics((rows || []) as MetricRow[], windowMinutes)
  const candidates = evaluateAlerts(metrics)

  let firedAlerts: AlertCandidate[] = []
  if (evaluate && candidates.length > 0) {
    // Dedupe: don't fire same kind+severity again within cooldown window
    const cooldownSince = new Date(Date.now() - THRESHOLDS.alert_cooldown_minutes * 60_000).toISOString()
    const { data: recent } = await supabase
      .from('proxy_alerts')
      .select('kind, severity')
      .gte('ts', cooldownSince)

    const recentSet = new Set((recent || []).map((r: { kind: string; severity: string }) => `${r.kind}:${r.severity}`))
    const toFire = candidates.filter((c) => !recentSet.has(`${c.kind}:${c.severity}`))

    if (toFire.length > 0) {
      const inserts = toFire.map((c) => ({
        kind: c.kind,
        severity: c.severity,
        value: c.value,
        threshold: c.threshold,
        window_minutes: windowMinutes,
        sample_size: metrics.sample_size,
        details: {
          error_rate: metrics.error_rate,
          timeout_rate: metrics.timeout_rate,
          p95_ms: metrics.latency_p95_ms,
          status_503: metrics.status_503,
          status_504: metrics.status_504,
          worst_targets: metrics.by_target.slice(0, 5),
        },
      }))
      const { error: insErr } = await supabase.from('proxy_alerts').insert(inserts)
      if (!insErr) {
        firedAlerts = toFire
        // Structured log so it's grep-able in edge logs
        for (const a of toFire) {
          console.log(JSON.stringify({
            fn: 'proxy-health', alert: true, kind: a.kind, severity: a.severity,
            value: a.value, threshold: a.threshold, window_minutes: windowMinutes,
            sample_size: metrics.sample_size,
          }))
        }
      }
    }
  }

  // Health verdict
  const status = candidates.find((c) => c.severity === 'critical')
    ? 'critical'
    : candidates.find((c) => c.severity === 'warning')
      ? 'warning'
      : 'healthy'

  return new Response(JSON.stringify({
    status,
    generated_at: new Date().toISOString(),
    window_minutes: windowMinutes,
    thresholds: THRESHOLDS,
    metrics,
    alert_candidates: candidates,
    fired_alerts: firedAlerts,
  }, null, 2), {
    headers: { ...getJsonCorsHeaders(req), 'Content-Type': 'application/json' },
  })
})
