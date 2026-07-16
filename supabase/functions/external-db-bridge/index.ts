import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { ExternalDbBridgeSchema, parseBody } from "../_shared/schemas.ts";

// Allowlist of RPC function names callable via this bridge (user-scoped, RLS applies).
// Never include functions that bypass RLS or expose admin-only data.
const ALLOWED_RPC_FUNCTIONS = new Set([
  'check_duplicate_request',
  'record_processed_request',
  'acquire_idempotency_lock',
  'get_contact_summary',
  'get_queue_stats',
  'search_contacts_fts',
  'get_conversation_history',
  'mark_messages_read',
]);

// Allowlist of PostgREST filter operators — prevents operator injection attacks.
const ALLOWED_FILTER_OPERATORS = new Set([
  'eq', 'neq', 'lt', 'lte', 'gt', 'gte',
  'like', 'ilike', 'is', 'in',
  'cs', 'cd', 'sl', 'sr', 'nxr', 'nxl', 'adj', 'ov',
]);

// Allowlist for countMode PostgREST parameter.
const ALLOWED_COUNT_MODES = new Set(['exact', 'planned', 'estimated']);

// ─── Telemetry helper ─────────────────────────────────────────
interface TelemetryPayload {
  operation: string;
  table_name?: string | null;
  rpc_name?: string | null;
  duration_ms: number;
  record_count?: number | null;
  query_limit?: number | null;
  query_offset?: number | null;
  count_mode?: string | null;
  severity: string;
  error_message?: string | null;
  user_id?: string | null;
}

const SLOW_QUERY_THRESHOLD_MS = 3000;
const VERY_SLOW_QUERY_THRESHOLD_MS = 8000;

/**
 * Classifies query performance severity based on execution duration and error status.
 * Used for telemetry to prioritize slow/failing queries for optimization.
 * @param durationMs - Query execution time in milliseconds
 * @param hasError - Whether the query encountered an error
 * @returns Severity classification: 'error', 'very_slow' (8s+), 'slow' (3s+), or 'ok'
 */
function classifySeverity(durationMs: number, hasError: boolean): string {
  if (hasError) return "error";
  if (durationMs >= VERY_SLOW_QUERY_THRESHOLD_MS) return "very_slow";
  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) return "slow";
  return "ok";
}

/**
 * Asynchronously emits database query telemetry to Supabase.
 * Fire-and-forget pattern: silently swallows errors to prevent blocking operations.
 * Telemetry helps identify performance bottlenecks, slow queries, and error patterns.
 * @param supabaseAdmin - Supabase admin client (service role key)
 * @param payload - Telemetry metrics (operation, duration, severity, etc.)
 */
async function emitTelemetry(supabaseAdmin: ReturnType<typeof createClient>, payload: TelemetryPayload): Promise<void> {
  try {
    await supabaseAdmin.from("query_telemetry").insert({
      operation: payload.operation,
      table_name: payload.table_name ?? null,
      rpc_name: payload.rpc_name ?? null,
      duration_ms: Math.round(payload.duration_ms),
      record_count: payload.record_count ?? null,
      query_limit: payload.query_limit ?? null,
      query_offset: payload.query_offset ?? null,
      count_mode: payload.count_mode ?? null,
      severity: payload.severity,
      error_message: payload.error_message ?? null,
      user_id: payload.user_id ?? null,
    });
  } catch (err) {
    console.error("[emitTelemetry] exception:", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Edge Function: External Database Bridge
 *
 * Proxies SELECT, INSERT, UPDATE, DELETE, and RPC operations to Supabase database
 * with comprehensive validation, RLS enforcement, and telemetry.
 * Implements table whitelist for write operations to prevent unauthorized modifications.
 * Uses user-scoped client (RLS) for security and service-role admin for admin-only RPCs.
 *
 * Security:
 * - Bearer token required for all requests
 * - User authentication via Supabase.auth.getUser()
 * - Write operations whitelisted to safe tables only
 * - RLS policies enforced via user-scoped client
 *
 * Features:
 * - Query timing & severity classification for performance monitoring
 * - Fire-and-forget telemetry to prevent request blocking
 * - Graceful error handling with structured responses
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("external-db-bridge");

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "zapp" } });

    // Auth — server-side JWT verification (getClaims is client-side only, unsafe)
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const userId = authed.user.id;

    const rl = checkRateLimit(`external-db-bridge:${userId}`, 60, 60_000);
    if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const authHeader = req.headers.get("Authorization") ?? '';
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      db: { schema: "zapp" },
    });

    // Parse & validate body
    const parsed = parseBody(ExternalDbBridgeSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
      return errorResponse("Invalid request data", 400, req);
    }
    const parsedData = parsed.data as Record<string, unknown>;
    const action = typeof parsedData.action === 'string' ? parsedData.action : '';
    const table = typeof parsedData.table === 'string' ? parsedData.table : '';
    const rpc = typeof parsedData.rpc === 'string' ? parsedData.rpc : '';
    const params = (parsedData.params && typeof parsedData.params === 'object' && !Array.isArray(parsedData.params))
      ? (parsedData.params as Record<string, unknown>)
      : null;
    const limit = typeof parsedData.limit === 'number' ? Math.max(1, parsedData.limit) : null;
    const offset = typeof parsedData.offset === 'number' ? Math.max(0, parsedData.offset) : null;
    const rawCountMode = typeof parsedData.countMode === 'string' ? parsedData.countMode : '';
    const countMode = ALLOWED_COUNT_MODES.has(rawCountMode) ? rawCountMode : '';

    const startTime = performance.now();
    let result: unknown = null;
    let queryError: string | null = null;
    let recordCount: number | null = null;

    const allowedTablesForWrite = new Set([
      'contacts', 'messages', 'conversation_templates', 'conversation_logs',
      'talkx_campaigns', 'talkx_recipients', 'talkx_blacklist',
      'gmail_accounts', 'gmail_labels', 'gmail_threads', 'gmail_messages',
      'orders', 'order_items', 'invoices', 'profiles',
      'organization_settings', 'user_settings', 'audit_logs'
    ]);

    try {
      if (action === "select" && table) {
        const selectStr = (params && typeof params.select === 'string') ? params.select : "*";
        let query = supabaseUser.from(table).select(selectStr, {
          count: (countMode as "exact" | "planned" | "estimated") || undefined,
        });

        if (params && typeof params === 'object' && Array.isArray(params.filters)) {
          for (const f of params.filters) {
            if (f && typeof f === 'object' && !Array.isArray(f)) {
              const fObj = f as Record<string, unknown>;
              const fColumn = typeof fObj.column === 'string' ? fObj.column : '';
              const fOperator = typeof fObj.operator === 'string' ? fObj.operator : '';
              // Allowlist operator to prevent PostgREST operator injection
              if (fColumn && fOperator && ALLOWED_FILTER_OPERATORS.has(fOperator)) {
                query = query.filter(fColumn, fOperator, fObj.value);
              }
            }
          }
        }

        if (params && typeof params === 'object' && params.order && typeof params.order === 'object' && !Array.isArray(params.order)) {
          const ordObj = params.order as Record<string, unknown>;
          const ordColumn = typeof ordObj.column === 'string' ? ordObj.column : '';
          if (ordColumn) {
            query = query.order(ordColumn, { ascending: typeof ordObj.ascending === 'boolean' ? ordObj.ascending : true });
          }
        }

        if (limit) query = query.limit(limit);
        if (offset) query = query.range(offset, offset + (limit || 50) - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        result = data;
        recordCount = count ?? (Array.isArray(data) ? data.length : null);
      } else if (action === "rpc" && rpc) {
        // Strict whitelist — prevents calling arbitrary DB functions with service-role access.
        if (!ALLOWED_RPC_FUNCTIONS.has(rpc)) {
          return errorResponse(`RPC function not permitted: ${rpc}`, 403, req);
        }
        // Use user-scoped client so RLS applies (not service-role which bypasses all policies).
        const { data, error } = await supabaseUser.rpc(rpc, params || {});
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 1;
      } else if (action === "insert" && table) {
        if (!allowedTablesForWrite.has(table)) {
          return errorResponse(`Insert not allowed for table: ${table}`, 403, req);
        }
        const rowsVal = (params && typeof params === 'object' && params.rows) ? params.rows : params;
        const { data, error } = await supabaseUser.from(table).insert(rowsVal).select();
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 1;
      } else if (action === "update" && table) {
        if (!allowedTablesForWrite.has(table)) {
          return errorResponse(`Update not allowed for table: ${table}`, 403, req);
        }
        if (!params || typeof params !== 'object' || !params.match || typeof params.match !== 'object' || Array.isArray(params.match)) {
          return errorResponse("Update requires params.match object with filter criteria", 400, req);
        }
        const matchObj = params.match as Record<string, unknown>;
        if (Object.keys(matchObj).length === 0) {
          return errorResponse("Update requires at least one filter criterion in params.match", 400, req);
        }

        const updateValues = (params.values && typeof params.values === 'object' && !Array.isArray(params.values))
          ? (params.values as Record<string, unknown>)
          : {};
        let query = supabaseUser.from(table).update(updateValues);

        for (const [k, v] of Object.entries(matchObj)) {
          const kStr = typeof k === 'string' ? k : '';
          if (kStr) {
            query = query.eq(kStr, v as string);
          }
        }

        const { data, error } = await query.select();
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 0;
      } else if (action === "delete" && table) {
        if (!allowedTablesForWrite.has(table)) {
          return errorResponse(`Delete not allowed for table: ${table}`, 403, req);
        }
        if (!params || typeof params !== 'object' || !params.match || typeof params.match !== 'object' || Array.isArray(params.match)) {
          return errorResponse("Delete requires params.match object with filter criteria", 400, req);
        }
        const matchObj = params.match as Record<string, unknown>;
        if (Object.keys(matchObj).length === 0) {
          return errorResponse("Delete requires at least one filter criterion in params.match", 400, req);
        }

        let query = supabaseUser.from(table).delete();

        for (const [k, v] of Object.entries(matchObj)) {
          const kStr = typeof k === 'string' ? k : '';
          if (kStr) {
            query = query.eq(kStr, v as string);
          }
        }

        const { data, error } = await query.select();
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 0;
      } else {
        return errorResponse("Invalid action or missing table/rpc", 400, req);
      }
    } catch (err) {
      queryError = err instanceof Error ? err.message : String(err);
    }

    const durationMs = performance.now() - startTime;
    const severity = classifySeverity(durationMs, !!queryError);

    if (severity !== "ok") {
      emitTelemetry(supabaseAdmin, {
        operation: action,
        table_name: table || null,
        rpc_name: rpc || null,
        duration_ms: durationMs,
        record_count: recordCount,
        query_limit: limit || null,
        query_offset: offset || null,
        count_mode: countMode || null,
        severity,
        error_message: queryError,
        user_id: userId,
      }).catch((e) => log.error("telemetry fire-and-forget failed", { error: String(e) }));
    }

    if (queryError) {
      log.done(500, { severity, durationMs: Math.round(durationMs), rawError: queryError });
      // Sanitize error before returning — never expose raw DB messages to callers
      const clientError = queryError.length > 200 ? 'Database operation failed' : queryError.replace(/\b(password|secret|key|token)\b[^,\n]*/gi, '[redacted]');
      return jsonResponse({ error: clientError, telemetry: { severity, duration_ms: Math.round(durationMs) } }, 500, req);
    }

    log.done(200, { severity, durationMs: Math.round(durationMs) });
    return jsonResponse({
      data: result,
      meta: { record_count: recordCount, duration_ms: Math.round(durationMs), severity },
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Fatal error", { error: msg });
    return errorResponse("Internal server error", 500, req);
  }
});
