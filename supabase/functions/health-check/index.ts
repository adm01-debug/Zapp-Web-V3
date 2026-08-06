import { createZappAdminClient } from '../_shared/db-client.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { HealthCheckV1Schema } from '../_shared/contract-schemas.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Contrato health-check@v1 (estrito): probe GET sem body → {} aceito.
  const parsed = parseOrReject('health-check', { v1: HealthCheckV1Schema }, req, await req.json().catch(() => ({})), {
    extraHeaders: getCorsHeaders(req),
  });
  if (parsed.ok === false) return parsed.response;

  const startTime = Date.now();
  const status: { status: string; timestamp: string; version: string; checks: Record<string, unknown>; response_time_ms?: number } = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks: {}
  };

  try {
    const supabase = createZappAdminClient();

    // 1. Check Database
    const { error: dbError } = await supabase.from('profiles').select('count', { count: 'exact', head: true }).limit(1);
    status.checks.database = dbError ? "unhealthy" : "healthy";
    if (dbError) status.status = "degraded";

    status.latency_ms = Date.now() - startTime;
    return new Response(JSON.stringify(status), {
      status: status.status === "healthy" ? 200 : 503,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ status: "error", message: "Health check failed" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
