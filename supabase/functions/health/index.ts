// Edge Function: health
// Health check consolidado para Edge Functions + Realtime + DB.
// Consumido pelo Prometheus como gatekeeper antes de scrapear /metrics.
//
// Retorna 200 quando todas as dependências estão OK; 503 caso contrário.
// Formato compatível com probes do kube/nginx:
//   GET /functions/v1/health          → JSON detalhado
//   GET /functions/v1/health?probe=1  → texto curto (OK | FAIL)

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

interface CheckResult {
  name: string;
  status: 'ok' | 'degraded' | 'fail';
  latency_ms: number;
  detail?: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_ANON_KEY') ?? '';

async function timed(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    await fn();
    return { name, status: 'ok', latency_ms: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      name,
      status: 'fail',
      latency_ms: Math.round(performance.now() - t0),
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  return timed('database', async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('missing env');
    const client = createClient(SUPABASE_URL, SERVICE_KEY, {
      db: { schema: 'zapp' },
      auth: { persistSession: false },
    });
    const { error } = await client.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) throw new Error(error.message);
  });
}

async function checkRealtime(): Promise<CheckResult> {
  return timed('realtime', async () => {
    if (!SUPABASE_URL) throw new Error('missing SUPABASE_URL');
    const rt = SUPABASE_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?vsn=1.0.0&apikey=' + encodeURIComponent(SERVICE_KEY);
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(rt);
      const timer = setTimeout(() => { ws.close(); reject(new Error('timeout 3s')); }, 3000);
      ws.onopen = () => { clearTimeout(timer); ws.close(); resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
    });
  });
}

async function checkMetrics(): Promise<CheckResult> {
  return timed('metrics_endpoint', async () => {
    const url = `${SUPABASE_URL}/functions/v1/metrics`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${SERVICE_KEY}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.text();
    if (!body.includes('# HELP') && !body.includes('# TYPE')) {
      throw new Error('resposta não é exposição Prometheus');
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const probe = url.searchParams.get('probe');

  const checks = await Promise.all([
    checkDatabase(),
    checkRealtime(),
    checkMetrics(),
  ]);

  const failed = checks.filter((c) => c.status === 'fail');
  const healthy = failed.length === 0;
  const status = healthy ? 200 : 503;

  if (probe) {
    return new Response(healthy ? 'OK' : 'FAIL', {
      status,
      headers: { ...corsHeaders, 'content-type': 'text/plain' },
    });
  }

  return new Response(
    JSON.stringify({
      status: healthy ? 'ok' : 'fail',
      timestamp: new Date().toISOString(),
      checks,
    }, null, 2),
    {
      status,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    },
  );
});
