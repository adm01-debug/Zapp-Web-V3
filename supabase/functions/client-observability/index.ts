import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, checkRateLimit } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";

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

function acceptedNoContent(req: Request): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(req) });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger('client-observability');

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`client-observability:${authed.user.id}`, 60, 60_000);
    if (!rl.allowed) return acceptedNoContent(req);

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req);
    }

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
      { db: { schema: 'zapp' } },
    );

    const { error } = await supabase.from('query_telemetry').insert(rows);
    if (error) {
      // Never bubble up as 500 — observability failures must not create
      // client-side error floods. Log and return 204 (accepted, no content).
      log.error('failed inserting query_telemetry', { error: error.message });
      return acceptedNoContent(req);
    }

    return jsonResponse({ ok: true, accepted: rows.length }, 200, req);
  } catch (error: unknown) {
    // Observability endpoint: swallow errors, return 204 to avoid client flood.
    log.error('Unhandled error', { error: error instanceof Error ? error.message : String(error) });
    return acceptedNoContent(req);
  }
});
