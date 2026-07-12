// external-db-proxy v1.8 (2026-07-04)
// Proxy autorizado para consultas de tabelas operacionais.
// Evolution/FATOR X usa o Supabase self-hosted atomicabr e o schema `evo`.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { requireUser } from "../_shared/auth.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
type DynamicSupabaseClient = ReturnType<typeof createClient> & {
  schema(schema: string): DynamicSupabaseClient;
  from(table: string): ReturnType<ReturnType<typeof createClient>["from"]>;
};

type RequestBody = {
  schema?: unknown;
  table?: unknown;
  rpc?: unknown;
  action?: unknown;
  params?: Record<string, unknown>;
  select?: unknown;
  limit?: unknown;
  offset?: unknown;
  filter?: Record<string, unknown>;
  filters?: Array<{ column?: unknown; operator?: unknown; value?: unknown }>;
  order_by?: unknown;
  order?: { column?: unknown; ascending?: unknown };
  order_asc?: unknown;
};

const PLACEHOLDER_RE = /PLACEHOLDER|REPLACE|CHANGE_ME|YOUR_/i;
const EVO_TABLE_RE = /^evolution_/;
const SAFE_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function pickEnv(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  if (!value || PLACEHOLDER_RE.test(value)) return undefined;
  return value;
}

function pickEnvWithSource(names: string[]): { value?: string; source?: string } {
  for (const name of names) {
    const v = pickEnv(name);
    if (v) return { value: v, source: name };
  }
  return {};
}

function pickUrlWithSource(names: string[]): { value?: string; source?: string } {
  for (const name of names) {
    const raw = pickEnv(name);
    if (!raw) continue;
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      return { value: new URL(withProtocol).origin, source: name };
    } catch {
      // try next
    }
  }
  return {};
}

function isSafeIdent(value: string): boolean {
  return SAFE_IDENT_RE.test(value);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function pickServiceRoleKeyWithSource(names: string[]): { value?: string; source?: string; rejected?: Array<{ source: string; role: string }> } {
  const rejected: Array<{ source: string; role: string }> = [];
  for (const name of names) {
    const value = pickEnv(name);
    if (!value) continue;
    const payload = decodeJwtPayload(value);
    const role = (payload?.role as string) ?? "unknown";
    if (role === "service_role") return { value, source: name, rejected };
    rejected.push({ source: name, role });
  }
  return { rejected };
}

const URL_PICK = pickUrlWithSource(["SELFHOSTED_SUPABASE_URL", "EXTERNAL_SUPABASE_URL"]);
const KEY_PICK = pickServiceRoleKeyWithSource([
  "SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY",
  "EXTERNAL_SUPABASE_SERVICE_ROLE_KEY",
]);

const EXTERNAL_URL = URL_PICK.value;
const EXTERNAL_KEY = KEY_PICK.value;
const URL_SOURCE = URL_PICK.source ?? "none";
const KEY_SOURCE = KEY_PICK.source ?? "none";
const ENV_SET = URL_SOURCE.startsWith("SELFHOSTED_") || KEY_SOURCE.startsWith("SELFHOSTED_") ? "SELFHOSTED_*" : URL_SOURCE.startsWith("EXTERNAL_") || KEY_SOURCE.startsWith("EXTERNAL_") ? "EXTERNAL_*" : "unknown";

const KEY_PAYLOAD = EXTERNAL_KEY ? decodeJwtPayload(EXTERNAL_KEY) : null;
const KEY_ROLE = (KEY_PAYLOAD?.role as string) ?? "unknown";
const KEY_ISS = (KEY_PAYLOAD?.iss as string) ?? "unknown";
const KEY_REF = (KEY_PAYLOAD?.ref as string) ?? "unknown";

console.log("[external-db-proxy] env resolved", {
  url_source: URL_SOURCE,
  key_source: KEY_SOURCE,
  env_set: ENV_SET,
  target_url: EXTERNAL_URL,
  key_role: KEY_ROLE,
  key_iss: KEY_ISS,
  key_ref: KEY_REF,
});

if (KEY_PICK.rejected?.length) {
  console.warn("[external-db-proxy] WARN: chaves rejeitadas por não serem service_role", { rejected: KEY_PICK.rejected });
}

const TARGET_URL = EXTERNAL_URL ?? "";
const TARGET_KEY = EXTERNAL_KEY ?? "";
const targetName = "self-hosted-external";

let supabase: DynamicSupabaseClient | null = null;
let bootError: string | null = null;

try {
  if (!EXTERNAL_URL) {
    throw new Error("SELFHOSTED_SUPABASE_URL/EXTERNAL_SUPABASE_URL ausente ou inválida — configure a URL do backend self-hosted.");
  }
  if (!EXTERNAL_KEY) {
    throw new Error("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY/EXTERNAL_SUPABASE_SERVICE_ROLE_KEY ausente ou inválida — configure uma chave service_role válida do self-hosted.");
  }
  supabase = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } }) as DynamicSupabaseClient;
} catch (error) {
  bootError = error instanceof Error ? error.message : "Falha desconhecida ao iniciar o proxy.";
  console.error("[external-db-proxy] boot error:", bootError);
}

const ALLOWED_SCHEMAS = ["public", "evo"];

const EVOLUTION_TABLES = [
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
];

const LOCAL_TABLES = [
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
  // NOTE: `api_keys` (tabela de segredos) foi removida do whitelist — nunca deve
  // ser lida por este proxy genérico com service_role. Auditoria 2026-07-12.
  "whatsapp_cloud_webhook_pings",
  "qr_attempts",
];

const SCHEMA_TABLE_WHITELIST: Record<string, string[]> = {
  public: [...LOCAL_TABLES, ...EVOLUTION_TABLES],
  evo: EVOLUTION_TABLES,
};

// Allowlist de RPCs invocáveis por este proxy. Como o proxy executa com
// service_role, permitir qualquer identificador (o comportamento anterior)
// deixava qualquer usuário autenticado invocar QUALQUER função do banco —
// escalonamento de privilégio. Esta lista é a união do catálogo canônico
// (src/integrations/datasource/rpcCatalog.ts) com os RPCs efetivamente
// chamados no frontend. Ao adicionar um RPC novo, inclua-o aqui também.
// Auditoria 2026-07-12.
const ALLOWED_RPCS = new Set<string>([
  "add_contact_note", "bulk_add_tag", "bulk_auto_merge_duplicates",
  "bulk_soft_delete_contacts", "bulk_update_lead_status", "contacts_count_by_type",
  "find_duplicate_contacts", "fn_increment_meme_use", "fn_safe_audit_log",
  "fn_test_alert_channel", "fn_toggle_user_meme_favorite", "get_avatars_by_jids_batch",
  "get_companies_by_phones_batch", "get_contact_360_by_phone", "get_contact_conversations",
  "get_contact_intelligence_by_phone", "get_contact_notes", "get_contact_stats",
  "get_csat_stats", "get_duplicate_report", "get_lgpd_compliance_stats",
  "get_own_email_accounts", "get_team_profiles", "get_visible_agent_ids",
  "grant_lgpd_consent", "has_role", "is_admin_or_supervisor", "is_within_business_hours",
  "log_audit_event", "log_security_event", "mark_follow_up_done", "merge_contacts",
  "reassign_absent_agents", "reassign_overloaded_agents", "record_voice_telemetry",
  "restore_contact", "revoke_lgpd_consent", "rpc_dashboard_home", "rpc_delete_contact",
  "rpc_dlq_abandon", "rpc_dlq_bulk_abandon", "rpc_dlq_list_audit", "rpc_dlq_log_item_action",
  "rpc_dlq_retry_now", "rpc_email_archive_thread", "rpc_email_assign_thread",
  "rpc_email_mark_thread_read", "rpc_email_search_threads", "rpc_email_star_thread",
  "rpc_email_token_status", "rpc_get_contact", "rpc_get_email_health_summary",
  "rpc_global_search", "rpc_insert_message", "rpc_instance_auth_event_summary",
  "rpc_instance_auth_event_trend", "rpc_list_audit_log", "rpc_list_calls",
  "rpc_list_contacts", "rpc_list_conversations", "rpc_list_dispatch_error_logs",
  "rpc_list_failed_messages", "rpc_list_messages", "rpc_list_messages_lite",
  "rpc_list_transfers_paginated", "rpc_log_outbound_event", "rpc_log_search_event",
  "rpc_log_service_event", "rpc_migrate_whatsapp_integration", "rpc_provider_panel",
  "rpc_provider_session_timeline", "rpc_record_automation_error", "rpc_record_search_click",
  "rpc_schedule_follow_up", "rpc_set_whatsapp_mode", "rpc_toggle_message_important",
  "rpc_toggle_message_star", "rpc_upsert_contact", "search_contacts",
  "search_contacts_advanced", "search_knowledge_base", "send_message_v2",
  "soft_delete_contact", "sync_interaction_from_zapp", "update_contact_versioned",
  "update_own_profile", "user_has_permission",
]);

function resolveSchema(schema: string, table: string): string {
  if (schema === "public" && EVO_TABLE_RE.test(table)) return "evo";
  return schema;
}

function jsonResponse(req: Request, payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  const url = new URL(req.url);
  const isHealthGet = req.method === "GET" && !url.searchParams.get("health") && !url.searchParams.get("check");

  if (!isHealthGet) {
    const rawAuth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const bearer = rawAuth.toLowerCase().startsWith("bearer ") ? rawAuth.slice(7).trim() : "";
    const callerPayload = bearer ? decodeJwtPayload(bearer) : null;
    const callerInfo = {
      cid: req.headers.get("x-correlation-id") ?? undefined,
      rid: req.headers.get("x-request-id") ?? undefined,
      token_present: Boolean(bearer),
      token_len: bearer.length || 0,
      token_role: (callerPayload?.role as string) ?? "unknown",
      token_iss: (callerPayload?.iss as string) ?? "unknown",
      token_ref: (callerPayload?.ref as string) ?? "unknown",
      token_sub: (callerPayload?.sub as string) ?? "unknown",
      token_aud: (callerPayload?.aud as string) ?? "unknown",
      token_exp: (callerPayload?.exp as number) ?? null,
      token_exp_in_s: typeof callerPayload?.exp === "number"
        ? (callerPayload.exp as number) - Math.floor(Date.now() / 1000)
        : null,
      expected_backend: (callerPayload?.iss as string) === `${EXTERNAL_URL}/auth/v1`
        ? "self-hosted"
        : "cloud-or-fallback",
    };
    console.log("[external-db-proxy] incoming JWT", callerInfo);

    const authed = await requireUser(req);
    if (authed instanceof Response) {
      console.error('[external-db-proxy] requireUser REJECTED', {
        ...callerInfo,
        status: authed.status,
        hint: callerInfo.token_iss === "unknown"
          ? "JWT ausente ou malformado — cliente não enviou Authorization Bearer válido."
          : callerInfo.expected_backend === "self-hosted"
            ? `Token emitido por ${callerInfo.token_iss} — confirme que SELFHOSTED_SUPABASE_ANON_KEY corresponde ao JWT_SECRET desse issuer.`
            : `Token iss=${callerInfo.token_iss} não bate com EXTERNAL_URL=${EXTERNAL_URL}/auth/v1 — confira SUPABASE_URL/SUPABASE_ANON_KEY do projeto cloud emissor.`,
      });
      return authed;
    }
    console.log("[external-db-proxy] requireUser OK", {
      ...callerInfo,
      user_id: authed.user.id,
    });
  }

  if (bootError || !supabase) {
    return jsonResponse(req, {
      error: `external-db-proxy não configurado: ${bootError ?? "sem cliente"}`,
      hint: "Configure SELFHOSTED_SUPABASE_URL e SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY (ou aliases EXTERNAL_*) no runtime das Edge Functions.",
      data: [],
      count: 0,
    }, 503);
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("health") === "1" || url.searchParams.get("check") === "tables") {
      const probes = [
        { schema: "evo", table: "evolution_messages" },
        { schema: "evo", table: "evolution_webhook_events" },
      ];
      const startH = Date.now();
      const checks = await Promise.all(probes.map(async (p) => {
        const t0 = Date.now();
        try {
          const client = supabase!.schema(p.schema);
          const { error } = await client.from(p.table).select("*", { count: "exact", head: true }).limit(1);
          if (error) {
            const err = error as { code?: string; message: string };
            const missing = err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message);
            console.error(`[external-db-proxy] probe ${p.schema}.${p.table}:`, err.code, err.message);
            return { ...p, ok: false, exists: !missing, missing_table: missing, latency_ms: Date.now() - t0 };
          }
          return { ...p, ok: true, exists: true, missing_table: false, latency_ms: Date.now() - t0 };
        } catch (e) {
          console.error(`[external-db-proxy] probe exception ${p.schema}.${p.table}:`, e instanceof Error ? e.message : e);
          return { ...p, ok: false, exists: false, missing_table: false, latency_ms: Date.now() - t0 };
        }
      }));
      const allOk = checks.every((c) => c.ok);
      return jsonResponse(req, {
        ok: allOk,
        fn: "external-db-proxy",
        version: "1.10-issuer-fastpath",
        target: targetName,
        checks,
        hint: allOk ? undefined : "Se missing_table=true, aplique a migration no self-hosted e exponha o schema 'evo' em config.toml → [api].schemas.",
        latency_ms: Date.now() - startH,
        ts: Date.now(),
      }, allOk ? 200 : 503);
    }
    return jsonResponse(req, { ok: true, fn: "external-db-proxy", version: "1.10-issuer-fastpath", target: targetName, ts: Date.now() }, 200);
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const cid = req.headers.get("x-correlation-id") || crypto.randomUUID();
  const rid = req.headers.get("x-request-id") || crypto.randomUUID();
  const start = Date.now();

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return jsonResponse(req, { error: "Invalid JSON body", cid, rid }, 400);
  }

  const requestedSchema = String(body.schema ?? "public");
  const table = String(body.table ?? "");
  const rpc = typeof body.rpc === "string" ? body.rpc : null;
  const action = typeof body.action === "string" ? body.action : rpc ? "rpc" : table ? "select" : null;

  if (action === "rpc" && rpc) {
    if (!isSafeIdent(rpc)) return jsonResponse(req, { error: "Invalid rpc identifier", cid, rid }, 400);
    if (!ALLOWED_RPCS.has(rpc)) {
      console.warn("[external-db-proxy] rpc bloqueado (fora do allowlist)", { rpc, cid, rid });
      return jsonResponse(req, { error: `RPC '${rpc}' não permitido`, cid, rid, data: null }, 403);
    }

    const params = { ...(body.params ?? {}) };
    delete params.__cid;

    try {
      const { data, error } = await supabase.rpc(rpc, params);
      if (error) {
        console.error('[external-db-proxy] rpc error', { rpc, cid, code: error.code, message: error.message });
        return jsonResponse(req, { error: "Database operation failed", cid, rid, data: null }, 500);
      }
      return jsonResponse(req, { ok: true, cid, rid, data, latency_ms: Date.now() - start }, 200);
    } catch (error) {
      console.error('[external-db-proxy] rpc exception', { rpc, cid, message: error instanceof Error ? error.message : String(error) });
      return jsonResponse(req, { error: "Database operation failed", cid, rid, data: null }, 500);
    }
  }

  const selectCols = String(body.select ?? "*");
  const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 500);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const filter = body.filter && typeof body.filter === "object" ? body.filter : null;
  const filters = Array.isArray(body.filters) ? body.filters : null;
  const orderBy = body.order_by ? String(body.order_by) : body.order?.column ? String(body.order.column) : null;
  const orderAsc = body.order_asc !== undefined ? Boolean(body.order_asc) : Boolean(body.order?.ascending);

  if (!isSafeIdent(requestedSchema)) return jsonResponse(req, { error: "Invalid schema", cid, rid }, 400);
  if (!isSafeIdent(table)) return jsonResponse(req, { error: "Invalid table", cid, rid }, 400);

  const schema = resolveSchema(requestedSchema, table);
  if (!ALLOWED_SCHEMAS.includes(schema)) {
    return jsonResponse(req, { schema_unavailable: true, cid, rid, data: [], count: 0, latency_ms: Date.now() - start }, 200);
  }

  const allowedTables = SCHEMA_TABLE_WHITELIST[schema] || [];
  if (allowedTables.length > 0 && !allowedTables.includes(table)) {
    return jsonResponse(req, { error: `Table '${table}' not in whitelist for schema '${schema}'`, cid, rid, data: [], count: 0 }, 403);
  }

  try {
    const client = schema === "public" ? supabase : supabase.schema(schema);
    let query = client.from(table).select(selectCols, { count: "exact" }).limit(limit);

    if (filters) {
      for (const item of filters) {
        const column = String(item.column ?? "");
        const operator = String(item.operator ?? "eq");
        if (!isSafeIdent(column) || !isSafeIdent(operator)) continue;
        const maybeOperator = query[operator as keyof typeof query];
        if (typeof maybeOperator === "function") {
          query = (maybeOperator as (column: string, value: unknown) => typeof query).call(query, column, item.value);
        }
      }
    } else if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (!isSafeIdent(key)) continue;
        query = query.eq(key, value as {});
      }
    }

    if (orderBy && isSafeIdent(orderBy)) query = query.order(orderBy, { ascending: orderAsc });
    if (offset > 0) query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      const err = error as { code?: string; message: string };
      const missing = err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message);
      if (missing) {
        console.warn("[external-db-proxy] missing_table", { schema, table, cid });
        return jsonResponse(req, {
          error: `Tabela '${schema}.${table}' não encontrada no destino (${targetName}).`,
          hint: "Verifique se a migration foi aplicada no self-hosted e se o schema 'evo' está exposto na Data API (config.toml → [api].schemas).",
          missing_table: true,
          schema,
          table,
          target: targetName,
          cid,
          rid,
          data: [],
          count: 0,
          latency_ms: Date.now() - start,
        }, 503);
      }
      const isUnauthorized = /unauthorized|jwt|invalid signature|invalid api key|jws/i.test(err.message ?? "");
      if (isUnauthorized) {
        console.error('[external-db-proxy] AUTH MISMATCH — service_role key não é aceita pelo self-hosted', {
          schema, table, cid,
          target_url: EXTERNAL_URL,
          key_source: KEY_SOURCE,
          key_role: KEY_ROLE,
          key_iss: KEY_ISS,
          key_ref: KEY_REF,
          message: err.message,
        });
        return jsonResponse(req, {
          error: "Self-hosted rejeitou a service_role key (assinatura inválida).",
          hint: "Verifique se a service_role key no secret corresponde ao JWT_SECRET do self-hosted (Settings → API). Detalhes registrados no servidor.",
          cid, rid, data: [], count: 0, latency_ms: Date.now() - start,
        }, 502);
      }
      console.error('[external-db-proxy] query error', { schema, table, code: err.code, message: err.message, cid });
      return jsonResponse(req, { error: "Database operation failed", cid, rid, data: [], count: 0, latency_ms: Date.now() - start }, 500);
    }

    return jsonResponse(req, {
      ok: true,
      cid,
      rid,
      data: data || [],
      count: count ?? (data?.length || 0),
      schema,
      requested_schema: requestedSchema,
      table,
      target: targetName,
      latency_ms: Date.now() - start,
    }, 200);
  } catch (error) {
    console.error('[external-db-proxy] query exception', { schema, table, message: error instanceof Error ? error.message : String(error), cid });
    return jsonResponse(req, { error: "Database operation failed", cid, rid, data: [], count: 0 }, 500);
  }
});