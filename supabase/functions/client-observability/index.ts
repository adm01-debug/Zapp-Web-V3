import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

type VitalName = 'LCP' | 'FID' | 'CLS' | 'INP' | 'TTFB';

interface VitalPayload {
  name: VitalName;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
  path?: string;
  url?: string;
  userAgent?: string;
  timestamp?: string;
}

const VALID_NAMES = new Set<VitalName>(['LCP', 'FID', 'CLS', 'INP', 'TTFB']);

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger('client-observability');

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405, req);
  }

  try {
    const body = await req.json();
    const events: VitalPayload[] = Array.isArray(body?.metrics) ? body.metrics : [];

    if (events.length === 0) {
      return errorResponse('metrics[] is required', 400, req);
    }

    const rows = events
      .filter((event) => VALID_NAMES.has(event.name) && Number.isFinite(event.value))
      .map((event) => ({
        operation: 'web_vital',
        table_name: event.path?.slice(0, 120) || 'unknown',
        rpc_name: `${event.name}:${event.rating}`,
        duration_ms: Math.max(0, Math.round(event.value)),
        query_limit: null,
        query_offset: null,
        count_mode: null,
        record_count: null,
        severity: event.rating === 'poor' ? 'error' : event.rating === 'needs-improvement' ? 'slow' : 'ok',
        error_message: event.rating === 'poor' ? `web-vital-${event.name}-poor` : null,
      }));

    if (!rows.length) {
      return errorResponse('No valid web-vital metric found', 400, req);
    }

    const supabase = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { error } = await supabase.from('query_telemetry').insert(rows);
    if (error) {
      log.error('failed inserting query_telemetry', { error: error.message });
      return errorResponse(error.message, 500, req);
    }

    return jsonResponse({ ok: true, accepted: rows.length }, 200, req);
  } catch (error: unknown) {
    log.error('Unhandled error', { error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error instanceof Error ? error.message : 'Internal error', 500, req);
  }
});
