import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  const startTime = Date.now();
  const status: { status: string; timestamp: string; version: string; checks: Record<string, unknown>; response_time_ms?: number } = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    checks: {}
  };

  try {
    const supabaseUrl = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
    const supabaseKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseKey, { db: { schema: "zapp" } });

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
