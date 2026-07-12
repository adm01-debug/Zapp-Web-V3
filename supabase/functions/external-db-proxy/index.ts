// external-db-proxy v1.9 (2026-07-12) — MED-8: structured observability metrics
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
  "api_keys",
  "whatsapp_cloud_webhook_pings",
  "qr_attempts",
];

const SCHEMA_TABLE_WHITELIST: Record<string, string[]> = {
  public: [...LOCAL_TABLES, ...EVOLUTION_TABLES],
  evo: EVOLUTION_TABLES,
};

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

// ─── MED-8 (2026-07-12): Structured observability metrics ───────────────────
// In-memory counters reset per cold-start but give same-instance aggregation.
// Per-request metric: lines are the persistent record — parseable by Grafana
// Loki (json parser) or DataDog (log-based metrics).
// Endpoint: GET ?metrics=1 → Prometheus text format for direct scraping.
interface ProxyMetrics {
  requests_total: number;
  requests_ok: number;
  requests_error: number;
  requests_auth_failed: number;
  requests_forbidden: number;
  latency_sum_ms: number;
  latency_p95_ms: number;
  latency_samples: number[];
  actions: Record<string, number>;
  error_types: Record<string, number>;
  tables_accessed: Record<string, number>;
}

const _proxyMetrics: ProxyMetrics = {
  requests_total: 0,
  requests_ok: 0,
  requests_error: 0,
  requests_auth_failed: 0,
  requests_forbidden: 0,
  latency_sum_ms: 0,
  latency_p95_ms: 0,
  latency_samples: [],
  actions: {},
  error_types: {},
  tables_accessed: {},
};

function recordMetric(opts: {
  action: string;
  table?: string;
  schema?: string;
  status_code: number;
  latency_ms: number;
  iss?: string;
  error_type?: string;
  ok: boolean;
}): void {
  _proxyMetrics.requests_total++;
  _proxyMetrics.latency_sum_ms += opts.latency_ms;
  _proxyMetrics.latency_samples.push(opts.latency_ms);
  // Keep only last 1000 samples in memory to bound allocation
  if (_proxyMetrics.latency_samples.length > 1000) _proxyMetrics.latency_samples.shift();
  // p95 update
  const sorted = [..._proxyMetrics.latency_samples].sort((a, b) => a - b);
  _proxyMetrics.latency_p95_ms = sorted[Math.floor(sorted.length * 0.95)] ?? 0;

  if (opts.ok) _proxyMetrics.requests_ok++;
  else _proxyMetrics.requests_error++;
  if (opts.status_code === 401 || opts.status_code === 403) {
    if (opts.status_code === 401) _proxyMetrics.requests_auth_failed++;
    else _proxyMetrics.requests_forbidden++;
  }
  if (opts.action) _proxyMetrics.actions[opts.action] = (_proxyMetrics.actions[opts.action] ?? 0) + 1;
  if (opts.table) _proxyMetrics.tables_accessed[opts.table] = (_proxyMetrics.tables_accessed[opts.table] ?? 0) + 1;
  if (opts.error_type) _proxyMetrics.error_types[opts.error_type] = (_proxyMetrics.error_types[opts.error_type] ?? 0) + 1;

  // Emit structured line parseable by Grafana Loki / DataDog log-based metrics
  console.log(JSON.stringify({
    metric: "external_db_proxy_request",
    action: opts.action,
    table: opts.table ?? null,
    schema: opts.schema ?? null,
    status_code: opts.status_code,
    latency_ms: opts.latency_ms,
    iss: opts.iss ?? KEY_ISS,
    error_type: opts.error_type ?? null,
    ok: opts.ok,
    ts: Date.now(),
  }));
}

function prometheusMetrics(): string {
  const m = _proxyMetrics;
  const lines: string[] = [
    `# HELP external_db_proxy_requests_total Total requests handled`,
    `# TYPE external_db_proxy_requests_total counter`,
    `external_db_proxy_requests_total ${m.requests_total}`,
    `# HELP external_db_proxy_requests_ok_total Successful requests`,
    `# TYPE external_db_proxy_requests_ok_total counter`,
    `external_db_proxy_requests_ok_total ${m.requests_ok}`,
    `# HELP external_db_proxy_requests_error_total Failed requests`,
    `# TYPE external_db_proxy_requests_error_total counter`,
    `external_db_proxy_requests_error_total ${m.requests_error}`,
    `# HELP external_db_proxy_requests_auth_failed_total 401 auth failures`,
    `# TYPE external_db_proxy_requests_auth_failed_total counter`,
    `external_db_proxy_requests_auth_failed_total ${m.requests_auth_failed}`,
    `# HELP external_db_proxy_latency_avg_ms Average latency (ms)`,
    `# TYPE external_db_proxy_latency_avg_ms gauge`,
    `external_db_proxy_latency_avg_ms ${m.requests_total ? Math.round(m.latency_sum_ms / m.requests_total) : 0}`,
    `# HELP external_db_proxy_latency_p95_ms p95 latency (ms, rolling 1000 requests)`,
    `# TYPE external_db_proxy_latency_p95_ms gauge`,
    `external_db_proxy_latency_p95_ms ${m.latency_p95_ms}`,
  ];
  for (const [action, count] of Object.entries(m.actions)) {
    lines.push(`external_db_proxy_action_total{action="${action}"} ${count}`);
  }
  for (const [errType, count] of Object.entries(m.error_types)) {
    lines.push(`external_db_proxy_error_total{type="${errType}"} ${count}`);
  }
  return lines.join("\n") + "\n";
}
// ─── end MED-8 ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Health GET does not require auth; all data-access paths (POST, health=1, metrics=1) do.
  // ?metrics=1 must NOT be in the unauthenticated fast-path — it exposes latency
  // percentiles, error breakdowns, and table-access patterns.
  const url = new URL(req.url);
  const isHealthGet = req.method === "GET"
    && !url.searchParams.get("health")
    && !url.searchParams.get("check")
    && !url.searchParams.get("metrics");

  if (!isHealthGet) {
    // Decode caller JWT (untrusted, signature not checked) purely for diagnostics.
    // This surfaces iss/ref/role/sub BEFORE requireUser runs, so a 401 can be
    // traced to the exact token the client sent without re-decoding downstream.
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
      // Which backend the fast-path in requireUser will TRY first.
      expected_backend: (callerPayload?.iss as string) === `${EXTERNAL_URL}/auth/v1`
        ? "self-hosted"
        : "cloud-or-fallback",
    };
    console.log("[external-db-proxy] incoming JWT", callerInfo);

    const authed = await requireUser(req);
    if (authed instanceof Response) {
      console.error("[external-db-proxy] requireUser REJECTED", {
        ...callerInfo,
        status: authed.status,
        hint: callerInfo.token_iss === "unknown"
          ? "JWT ausente ou malformado — cliente não enviou Authorization Bearer válido."
          : callerInfo.expected_backend === "self-hosted"
            ? `Token emitido por ${callerInfo.token_iss} — confirme que SELFHOSTED_SUPABASE_ANON_KEY corresponde ao JWT_SECRET desse issuer.`
            : `Token iss=${callerInfo.token_iss} não bate com EXTERNAL_URL=${EXTERNAL_URL}/auth/v1 — confira SUPABASE_URL/SUPABASE_ANON_KEY do projeto cloud emissor.`,
      });
      recordMetric({ action: "auth", status_code: authed.status, latency_ms: 0, iss: callerInfo.token_iss, error_type: "auth_rejected", ok: false });
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
    // MED-8: Prometheus metrics endpoint — requires authentication (same as other GETs with params)
    if (url.searchParams.get("metrics") === "1") {
      return new Response(prometheusMetrics(), {
        status: 200,
        headers: { ...getCorsHeaders(req), "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
      });
    }
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

    const params = { ...(body.params ?? {}) };
    delete params.__cid;

    try {
      const { data, error } = await supabase.rpc(rpc, params);
      if (error) {
        console.error('[external-db-proxy] rpc error', { rpc, cid, code: error.code, message: error.message });
        recordMetric({ action: "rpc", table: rpc, status_code: 500, latency_ms: Date.now() - start, error_type: "rpc_error", ok: false });
        return jsonResponse(req, { error: "Database operation failed", cid, rid, data: null }, 500);
      }
      recordMetric({ action: "rpc", table: rpc, status_code: 200, latency_ms: Date.now() - start, ok: true });
      return jsonResponse(req, { ok: true, cid, rid, data, latency_ms: Date.now() - start }, 200);
    } catch (error) {
      console.error('[external-db-proxy] rpc exception', { rpc, cid, message: error instanceof Error ? error.message : String(error) });
      recordMetric({ action: "rpc", table: rpc, status_code: 500, latency_ms: Date.now() - start, error_type: "rpc_exception", ok: false });
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
        recordMetric({ action: "select", table, schema, status_code: 503, latency_ms: Date.now() - start, error_type: "missing_table", ok: false });
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
        recordMetric({ action: "select", table, schema, status_code: 502, latency_ms: Date.now() - start, error_type: "auth_mismatch", ok: false });
        return jsonResponse(req, {
          error: "Self-hosted rejeitou a service_role key (assinatura inválida).",
          hint: "Verifique se a service_role key no secret corresponde ao JWT_SECRET do self-hosted (Settings → API). Detalhes registrados no servidor.",
          cid, rid, data: [], count: 0, latency_ms: Date.now() - start,
        }, 502);
      }
      console.error('[external-db-proxy] query error', { schema, table, code: err.code, message: err.message, cid });
      recordMetric({ action: "select", table, schema, status_code: 500, latency_ms: Date.now() - start, error_type: "query_error", ok: false });
      return jsonResponse(req, { error: "Database operation failed", cid, rid, data: [], count: 0, latency_ms: Date.now() - start }, 500);
    }

    recordMetric({ action: "select", table, schema, status_code: 200, latency_ms: Date.now() - start, ok: true });
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
    recordMetric({ action: action ?? "select", table, schema, status_code: 500, latency_ms: Date.now() - start, error_type: "query_exception", ok: false });
    return jsonResponse(req, { error: "Database operation failed", cid, rid, data: [], count: 0 }, 500);
  }
});