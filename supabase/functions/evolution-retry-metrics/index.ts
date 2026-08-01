// Edge function admin-only: lista/agrega métricas de retry da Evolution API.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetryRow {
  id: string;
  action: string;
  method: string;
  instance_name: string | null;
  idempotency_key: string | null;
  attempt_count: number;
  final_status: 'success' | 'failed' | 'exhausted';
  final_http_status: number | null;
  retry_reasons: Array<{ attempt: number; status?: number; reason: string }>;
  total_duration_ms: number | null;
  created_at: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function aggregate(rows: RetryRow[]) {
  const total = rows.length;
  const successAfterRetry = rows.filter(r => r.final_status === 'success' && r.attempt_count > 1).length;
  const failed = rows.filter(r => r.final_status === 'failed').length;
  const exhausted = rows.filter(r => r.final_status === 'exhausted').length;

  const successRate = total > 0 ? (successAfterRetry / total) * 100 : 0;

  const attempts = rows.map(r => r.attempt_count).sort((a, b) => a - b);
  const durations = rows.map(r => r.total_duration_ms ?? 0).filter(d => d > 0);

  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  // Top 5 ações
  const actionCount = new Map<string, number>();
  for (const r of rows) actionCount.set(r.action, (actionCount.get(r.action) ?? 0) + 1);
  const topActions = Array.from(actionCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([action, count]) => ({ action, count }));

  // Top 5 motivos
  const reasonCount = new Map<string, number>();
  for (const r of rows) {
    for (const rr of r.retry_reasons ?? []) {
      reasonCount.set(rr.reason, (reasonCount.get(rr.reason) ?? 0) + 1);
    }
  }
  const topReasons = Array.from(reasonCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    total,
    successAfterRetry,
    failed,
    exhausted,
    successRate: Math.round(successRate * 10) / 10,
    p50Attempts: percentile(attempts, 50),
    p95Attempts: percentile(attempts, 95),
    avgDurationMs: avgDuration,
    topActions,
    topReasons,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validação de admin/supervisor
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: roleCheck } = await admin.rpc('is_admin_or_supervisor', { _user_id: userData.user.id });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: 'Forbidden — admin or supervisor only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const hours = Math.min(168, Math.max(1, parseInt(url.searchParams.get('hours') ?? '24', 10)));
    const action = url.searchParams.get('action') ?? null;
    const instance = url.searchParams.get('instance') ?? null;
    const status = url.searchParams.get('status') ?? null;

    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const previousSince = new Date(Date.now() - 2 * hours * 3600 * 1000).toISOString();

    // Janela atual
    let q = admin
      .from('evolution_retry_metrics')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);
    if (action) q = q.eq('action', action);
    if (instance) q = q.eq('instance_name', instance);
    if (status) q = q.eq('final_status', status);

    const { data: rowsCurrent, error: errCur } = await q;
    if (errCur) throw errCur;

    // Janela anterior — agora também trazemos retry_reasons para construir o
    // ranking comparativo (modo de comparação no painel). Filtros de action/
    // instance/status são re-aplicados para alinhar a base de comparação.
    let qPrev = admin
      .from('evolution_retry_metrics')
      .select('retry_reasons, attempt_count, final_status, action, instance_name, total_duration_ms, id, method, idempotency_key, final_http_status, created_at')
      .gte('created_at', previousSince)
      .lt('created_at', since);
    if (action) qPrev = qPrev.eq('action', action);
    if (instance) qPrev = qPrev.eq('instance_name', instance);
    if (status) qPrev = qPrev.eq('final_status', status);
    const { data: rowsPrevious } = await qPrev;

    const aggCurrent = aggregate((rowsCurrent ?? []) as RetryRow[]);
    const aggPrevious = aggregate((rowsPrevious ?? []) as RetryRow[]);
    const previousTotal = aggPrevious.total;
    const deltaPct = previousTotal === 0
      ? null
      : Math.round(((aggCurrent.total - previousTotal) / previousTotal) * 1000) / 10;

    return new Response(JSON.stringify({
      rows: rowsCurrent ?? [],
      aggregates: aggCurrent,
      previousTotal,
      previousTopReasons: aggPrevious.topReasons,
      deltaPct,
      windowHours: hours,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[evolution-retry-metrics] error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
