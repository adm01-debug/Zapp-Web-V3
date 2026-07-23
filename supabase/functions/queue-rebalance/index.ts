// Edge Function: queue-rebalance
// Redistribui em batch tickets sem agente OU com SLA estourado, respeitando
// sla_priority e routing_weight da fila. Reusa fn_resolve_agent_for_routing.
// Requer service-role bearer OU x-cron-secret.

import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface BulkRequest {
  limit?: number;
  dry_run?: boolean;
  source?: string; // 'panel' | 'cron' | 'api'
}

interface QueueMeta {
  max_wait_time_minutes: number;
  sla_priority: string;
  routing_weight: number;
  auto_rebalance_enabled: boolean;
  is_active: boolean;
}

interface ContactCandidate {
  id: string;
  queue_id: string;
  assigned_to: string | null;
  created_at: string;
  queues: QueueMeta;
}

interface FilteredCandidate extends ContactCandidate {
  waitingMin: number;
  breached: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  let body: BulkRequest = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      const raw = await req.json();
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        body = raw as Record<string, unknown>;
      }
    }
  } catch {
    body = {};
  }

  const bodyLimit = typeof body.limit === 'number' ? body.limit : 50;
  const limit = Math.min(Math.max(bodyLimit, 1), 200);
  const dryRun = body.dry_run === true;
  const source = typeof body.source === 'string' ? body.source : "panel";

  const admin = createZappAdminClient();

  // No DB-level LIMIT — priority sorting happens in memory and the final slice
  // is applied after sorting. A pre-fetch cap would exclude high-priority contacts
  // that happen to be created later than lower-priority ones.
  const { data: candidates, error: candErr } = await admin
    .from("contacts")
    .select("id, queue_id, assigned_to, created_at, queues!inner(max_wait_time_minutes, sla_priority, routing_weight, auto_rebalance_enabled, is_active)")
    .not("queue_id", "is", null)
    .order("created_at", { ascending: true });

  if (candErr) {
    console.error("[queue-rebalance] list error", candErr.message);
    return new Response(
      JSON.stringify({ error: "Failed to list contacts" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const now = Date.now();
  const candidatesArray = Array.isArray(candidates) ? candidates : [];
  const filtered = candidatesArray
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null && !Array.isArray(c))
    .filter(c => {
      const queues = typeof c.queues === 'object' && c.queues !== null && !Array.isArray(c.queues)
        ? (c.queues as Record<string, unknown>)
        : null;
      return queues && queues.is_active === true && queues.auto_rebalance_enabled === true;
    })
    .map((c): FilteredCandidate => {
      const queues = (c.queues as Record<string, unknown>) || {};
      const createdAt = typeof c.created_at === 'string' ? c.created_at : '';
      const maxWaitMinutes = typeof queues.max_wait_time_minutes === 'number' ? queues.max_wait_time_minutes : 0;
      const waitingMin = (now - (createdAt ? new Date(createdAt).getTime() : now)) / 60000;
      const breached = waitingMin > maxWaitMinutes;
      return {
        id: typeof c.id === 'string' ? c.id : '',
        queue_id: typeof c.queue_id === 'string' ? c.queue_id : '',
        assigned_to: typeof c.assigned_to === 'string' ? c.assigned_to : null,
        created_at: createdAt,
        queues: {
          max_wait_time_minutes: maxWaitMinutes,
          sla_priority: typeof queues.sla_priority === 'string' ? queues.sla_priority : 'medium',
          routing_weight: typeof queues.routing_weight === 'number' ? queues.routing_weight : 0,
          auto_rebalance_enabled: queues.auto_rebalance_enabled === true,
          is_active: queues.is_active === true,
        },
        waitingMin,
        breached,
      };
    })
    .filter(c => c.assigned_to === null || c.breached)
    .sort((a, b) => {
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
  let errorCount = 0;

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
      console.error("[queue-rebalance] resolve error", c.id, resolveErr.message);
      errorCount++;
      continue;
    }

    if (typeof resolved !== 'object' || resolved === null || Array.isArray(resolved)) {
      skipped++;
      continue;
    }

    const r = resolved as Record<string, unknown>;
    const agentProfileId = typeof r.agent_profile_id === 'string' ? r.agent_profile_id : null;
    const queueId = typeof r.queue_id === 'string' ? r.queue_id : null;

    if (!agentProfileId) {
      skipped++;
      continue;
    }

    const { error: updErr } = await admin
      .from("contacts")
      .update({ assigned_to: agentProfileId, queue_id: queueId })
      .eq("id", c.id);

    if (updErr) {
      console.error("[queue-rebalance] update error", c.id, updErr.message);
      errorCount++;
      continue;
    }

    await admin.rpc("fn_register_sticky_assignment", {
      p_contact_id: c.id,
      p_agent_profile_id: agentProfileId,
      p_channel_connection_id: null,
      p_queue_id: queueId,
    });

    assigned++;
  }

  const summary = {
    processed,
    assigned,
    skipped,
    errors: errorCount,
    dry_run: dryRun,
    source,
    finished_at: new Date().toISOString(),
  };

  await admin.from("audit_logs").insert({
    action: "queue_bulk_rebalance",
    entity_type: "queues",
    details: summary,
  });

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
});
