import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { ExternalDbBridgeSchema, parseBody } from "../_shared/schemas.ts";

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

function classifySeverity(durationMs: number, hasError: boolean): string {
  if (hasError) return "error";
  if (durationMs >= VERY_SLOW_QUERY_THRESHOLD_MS) return "very_slow";
  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) return "slow";
  return "ok";
}

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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("external-db-bridge");

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorResponse("Unauthorized", 401, req);
    }

    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData || typeof userData !== 'object' || !userData.user) {
      return errorResponse("Unauthorized", 401, req);
    }
    const userObj = userData as Record<string, unknown>;
    const userProp = userObj.user as Record<string, unknown> | null;
    if (!userProp || typeof userProp.id !== 'string') {
      return errorResponse("Unauthorized", 401, req);
    }
    const userId = userProp.id;

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
    const countMode = typeof parsedData.countMode === 'string' ? parsedData.countMode : '';

    const startTime = performance.now();
    let result: unknown = null;
    let queryError: string | null = null;
    let recordCount: number | null = null;

    try {
      if (action === "select" && table) {
        const selectStr = (params && typeof params.select === 'string') ? params.select : "*";
        let query = supabaseAdmin.from(table).select(selectStr, {
          count: (countMode as "exact" | "planned" | "estimated") || undefined,
        });

        if (params && typeof params === 'object' && Array.isArray(params.filters)) {
          for (const f of params.filters) {
            if (f && typeof f === 'object' && !Array.isArray(f)) {
              const fObj = f as Record<string, unknown>;
              const fColumn = typeof fObj.column === 'string' ? fObj.column : '';
              const fOperator = typeof fObj.operator === 'string' ? fObj.operator : '';
              if (fColumn && fOperator) {
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
        const { data, error } = await supabaseAdmin.rpc(rpc, params || {});
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 1;
      } else if (action === "insert" && table) {
        const rowsVal = (params && typeof params === 'object' && params.rows) ? params.rows : params;
        const { data, error } = await supabaseAdmin.from(table).insert(rowsVal).select();
        if (error) throw error;
        result = data;
        recordCount = Array.isArray(data) ? data.length : 1;
      } else if (action === "update" && table) {
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
        let query = supabaseAdmin.from(table).update(updateValues);

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
        if (!params || typeof params !== 'object' || !params.match || typeof params.match !== 'object' || Array.isArray(params.match)) {
          return errorResponse("Delete requires params.match object with filter criteria", 400, req);
        }
        const matchObj = params.match as Record<string, unknown>;
        if (Object.keys(matchObj).length === 0) {
          return errorResponse("Delete requires at least one filter criterion in params.match", 400, req);
        }

        let query = supabaseAdmin.from(table).delete();

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
      log.done(500, { severity, durationMs: Math.round(durationMs) });
      return jsonResponse({ error: queryError, telemetry: { severity, duration_ms: Math.round(durationMs) } }, 500, req);
    }

    log.done(200, { severity, durationMs: Math.round(durationMs) });
    return jsonResponse({
      data: result,
      meta: { record_count: recordCount, duration_ms: Math.round(durationMs), severity },
    }, 200, req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Fatal error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
