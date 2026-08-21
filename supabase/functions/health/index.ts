// Edge Function: health
// Health check consolidado para Edge Functions + Realtime + DB (+ Evolution).
// Consumido pelo Prometheus como gatekeeper antes de scrapear /metrics.
//
// Retorna 200 quando todas as dependências estão OK; 503 caso contrário.
// O sub-check `evolution` é informativo (degraded NÃO derruba o gate do
// Prometheus — consolidação da antiga função evolution-health, AG-EX-13).
// Formato compatível com probes do kube/nginx:
//   GET /functions/v1/health          → JSON detalhado
//   GET /functions/v1/health?probe=1  → texto curto (OK | FAIL)

import { corsHeaders, readJsonBodyOrEmpty } from '../_shared/validation.ts';
import { createZappAdminClient } from '../_shared/db-client.ts';
import { evolutionClient } from '../_shared/providers/evolution/index.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { HealthV1Schema } from '../_shared/contract-schemas.ts';

interface CheckResult {
  name: string;
  status: 'ok' | 'degraded' | 'fail';
  latency_ms: number;
  detail?: string;
}

const SUPABASE_URL =
  Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY =
  Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ??
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
    const client = createZappAdminClient();
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

const HEALTH_SECRET = Deno.env.get('HEALTH_SECRET') ?? '';

// Sub-check Evolution (consolidado de evolution-health, AG-EX-13 wave 2).
// Informativo: falha vira 'degraded' (não derruba o gate do Prometheus).
async function checkEvolution(): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    const instance = Deno.env.get('EVOLUTION_INSTANCE_NAME') || 'wpp2';
    const r = await evolutionClient.getConnectionState(instance, { timeoutMs: 5_000 });
    if (!r.ok) throw new Error(r.error ?? 'Evolution API error');
    const data = (r.data ?? {}) as Record<string, unknown>;
    const state = ((data?.instance as Record<string,unknown>)?.state ?? 'unknown') as string;
    if (state !== 'open') throw new Error(`WhatsApp state=${state}`);
    return { name: 'evolution', status: 'ok', latency_ms: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      name: 'evolution',
      status: 'degraded',
      latency_ms: Math.round(performance.now() - t0),
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Contrato health@v1 (estrito): probe GET sem body → {} aceito.
  const parsed = parseOrReject('health', { v1: HealthV1Schema }, req, await readJsonBodyOrEmpty(req), {
    extraHeaders: corsHeaders,
  });
  if (parsed.ok === false) return parsed.response;

  const url = new URL(req.url);
  const probe = url.searchParams.get('probe');

  // Probe mode: public OK/FAIL for load-balancers (reveals no internal detail).
  if (probe) {
    const checks = await Promise.allSettled([checkDatabase()]);
    const healthy = checks.every((c) => c.status === 'fulfilled' && c.value.status === 'ok');
    return new Response(healthy ? 'OK' : 'FAIL', {
      status: healthy ? 200 : 503,
      headers: { ...corsHeaders, 'content-type': 'text/plain' },
    });
  }

  // Detailed JSON: require HEALTH_SECRET token (Bearer or ?token=) when configured.
  if (HEALTH_SECRET) {
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const qtoken = url.searchParams.get('token') ?? '';
    if (bearer !== HEALTH_SECRET && qtoken !== HEALTH_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
      });
    }
  }

  const checks = await Promise.all([
    checkDatabase(),
    checkRealtime(),
    checkMetrics(),
    checkEvolution(),
  ]);

  const failed = checks.filter((c) => c.status === 'fail');
  const healthy = failed.length === 0;
  const status = healthy ? 200 : 503;

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
