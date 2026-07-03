// external-db-proxy v1.5 (2026-07-02) — +evolution_audit_log (fix 403 useIdempotencyMissAlerts), -evolution_chats (objeto inexistente)
// NOTA: Este arquivo espelha a versão DEPLOYADA no self-hosted (supabase.atomicabr.com.br).
// Implementação anterior (client anon + lib/) foi substituída em prod: após o anon-lockout
// (PR #102), o client anon perdeu os GRANTs das views do repoint layer => 403.
// Esta versão usa service_role + whitelist explícita de tabelas como camada de autorização.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-correlation-id, x-request-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const ALLOWED_SCHEMAS = ["public"];

// Whitelist de tabelas v1.3 — expandida para inbox/conversas
const SCHEMA_TABLE_WHITELIST: Record<string, string[]> = {
  public: [
    "evolution_contacts",
    "evolution_messages",
    "evolution_conversations",
    "evolution_calls",
    "evolution_realtime_events",
    "evolution_webhook_events",
    "evolution_audit_log",
    "evolution_webhook_events_wpp2",
    "evolution_labels",
    "evolution_label_associations",
    "evolution_reactions",
    "evolution_whatsapp_status",
    "evolution_settings",
    "evolution_alerts",
    "whatsapp_connections",
    "channel_connections",
    "connection_health_logs",
    "conversations",
    "conversation_transfers",
    "queues",
    "queue_members",
    "queue_goals",
    "companies",
    "contact_emails",
    "profiles",
    "app_notifications",
    "agent_presence",
    "outbound_message_queue",
    "sales_deals",
    "department_invitations",
    "interactions",
    "sla_delivery_rules",
    "sla_delivery_violations",
    "team_messages",
    "team_message_reactions",
    "transfer_comments",
    "stickers",
    "sticker_categories",
    "sticker_favorites",
    "audio_memes",
    "audio_meme_categories",
    "audio_meme_favorites",
    "gmail_accounts",
    "gmail_cache_test",
    "gmail_health_logs",
    "gmail_revalidation_jobs",
    "email_tracked_messages",
    "email_tracking_events",
    "whisper_files",
    "dispatch_error_logs",
    "query_telemetry",
    "api_keys",
    "whatsapp_cloud_webhook_pings",
    "qr_attempts"
  ]
};

function isSafeIdent(s) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ ok: true, fn: "external-db-proxy", version: "1.5", ts: Date.now() }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  const cid = req.headers.get("x-correlation-id") || crypto.randomUUID();
  const rid = req.headers.get("x-request-id") || crypto.randomUUID();
  const start = Date.now();

  let body = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body", cid, rid }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" }
    });
  }

  const schema = String(body.schema ?? "public");
  const table = String(body.table ?? "");
  const rpc = typeof body.rpc === "string" ? body.rpc : null;
  const action = typeof body.action === "string" ? body.action : rpc ? "rpc" : table ? "select" : null;

  if (action === "rpc" && rpc) {
    if (!isSafeIdent(rpc)) {
      return new Response(JSON.stringify({ error: "Invalid rpc identifier", cid, rid }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" }
      });
    }
    const params = { ...(body.params ?? {}) };
    delete params.__cid;
    try {
      const { data, error } = await supabase.rpc(rpc, params);
      if (error) return new Response(JSON.stringify({ error: error.message, cid, rid, data: null }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ok: true, cid, rid, data, latency_ms: Date.now() - start }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, cid, rid, data: null }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }

  const select_cols = String(body.select ?? "*");
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 500);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const filter = body.filter && typeof body.filter === "object" ? body.filter : null;
  const filters = Array.isArray(body.filters) ? body.filters : null;
  const order_by = body.order_by ? String(body.order_by) : (body.order?.column ?? null);
  const order_asc = body.order_asc !== undefined ? Boolean(body.order_asc) : Boolean(body.order?.ascending);

  if (!isSafeIdent(schema)) return new Response(JSON.stringify({ error: "Invalid schema", cid, rid }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  if (!isSafeIdent(table)) return new Response(JSON.stringify({ error: "Invalid table", cid, rid }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  if (!ALLOWED_SCHEMAS.includes(schema)) {
    return new Response(JSON.stringify({ schema_unavailable: true, cid, rid, data: [], count: 0, latency_ms: Date.now() - start }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const allowedTables = SCHEMA_TABLE_WHITELIST[schema] || [];
  if (allowedTables.length > 0 && !allowedTables.includes(table)) {
    return new Response(JSON.stringify({ error: `Table '${table}' not in whitelist for schema '${schema}'`, cid, rid, data: [], count: 0 }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    let query = supabase.from(table).select(select_cols, { count: "exact" }).limit(limit);
    if (filters) { for (const f of filters) { const op = f.operator ?? "eq"; if (!isSafeIdent(f.column ?? "")) continue; if (typeof query[op] === "function") query = query[op](f.column, f.value); } }
    else if (filter) { for (const [key, value] of Object.entries(filter)) { if (!isSafeIdent(key)) continue; query = query.eq(key, value); } }
    if (order_by && isSafeIdent(String(order_by))) query = query.order(String(order_by), { ascending: order_asc });
    if (offset > 0) query = query.range(offset, offset + limit - 1);
    const { data, count, error } = await query;
    if (error) return new Response(JSON.stringify({ error: error.message, cid, rid, data: [], count: 0, latency_ms: Date.now() - start }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, cid, rid, data: data || [], count: count ?? (data?.length || 0), schema, table, latency_ms: Date.now() - start }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, cid, rid, data: [], count: 0 }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
