// Edge Function: queue-rebalance
// Redistribui em batch tickets sem agente OU com SLA estourado, respeitando
// sla_priority e routing_weight da fila. Reusa fn_resolve_agent_for_routing.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface BulkRequest {
  limit?: number;
  dry_run?: boolean;
  source?: string; // 'panel' | 'cron' | 'api'
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing_env" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: BulkRequest = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  const limit = Math.min(Math.max(body.limit ?? 50, 1), 200);
  const dryRun = body.dry_run === true;
  const source = body.source ?? "panel";

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Lista candidatos diretamente (service role bypass do guard de admin do RPC).
  const { data: candidates, error: candErr } = await admin
    .from("contacts")
    .select("id, queue_id, assigned_to, created_at, queues!inner(max_wait_time_minutes, sla_priority, routing_weight, auto_rebalance_enabled, is_active)")
    .not("queue_id", "is", null);

  if (candErr) {
    console.error("[queue-rebalance] list error", candErr);
    return new Response(
      JSON.stringify({ error: "list_failed", detail: candErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const now = Date.now();
  const filtered = (candidates ?? [])
    .filter((c: any) => c.queues?.is_active && c.queues?.auto_rebalance_enabled)
    .map((c: any) => {
      const waitingMin = (now - new Date(c.created_at).getTime()) / 60000;
      const breached = waitingMin > c.queues.max_wait_time_minutes;
      return { ...c, waitingMin, breached };
    })
    .filter((c: any) => c.assigned_to === null || c.breached)
    .sort((a: any, b: any) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;
      const pa = order[a.queues.sla_priority] ?? 2;
      const pb = order[b.queues.sla_priority] ?? 2;
      if (pa !== pb) return pa - pb;
      if (b.queues.routing_weight !== a.queues.routing_weight) {
        return b.queues.routing_weight - a.queues.routing_weight;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    })
    .slice(0, limit);

  let processed = 0;
  let assigned = 0;
  let skipped = 0;
  const errors: Array<{ contact_id: string; error: string }> = [];

  for (const c of filtered) {
    processed++;
    if (dryRun) continue;

    const { data: resolved, error: resolveErr } = await admin.rpc(
      "fn_resolve_agent_for_routing",
      {
        p_contact_id: c.id,
        p_channel_connection_id: null,
        p_queue_id: c.queue_id,
      },
    );

    if (resolveErr) {
      errors.push({ contact_id: c.id, error: resolveErr.message });
      continue;
    }

    const r = resolved as { agent_profile_id: string | null; queue_id: string | null };
    if (!r?.agent_profile_id) {
      skipped++;
      continue;
    }

    const { error: updErr } = await admin
      .from("contacts")
      .update({ assigned_to: r.agent_profile_id, queue_id: r.queue_id })
      .eq("id", c.id);

    if (updErr) {
      errors.push({ contact_id: c.id, error: updErr.message });
      continue;
    }

    await admin.rpc("fn_register_sticky_assignment", {
      p_contact_id: c.id,
      p_agent_profile_id: r.agent_profile_id,
      p_channel_connection_id: null,
      p_queue_id: r.queue_id,
    });

    assigned++;
  }

  const summary = {
    processed,
    assigned,
    skipped,
    errors: errors.length,
    error_details: errors.slice(0, 10),
    dry_run: dryRun,
    source,
    finished_at: new Date().toISOString(),
  };

  // Audit log via RPC existente
  await admin.from("audit_logs").insert({
    action: "queue_bulk_rebalance",
    entity_type: "queues",
    details: summary,
  });

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
