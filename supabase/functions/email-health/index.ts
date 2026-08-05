/**
 * Edge Function: email-health
 *
 * Returns email infrastructure health status by calling:
 *  - rpc_get_email_health_summary — overall status + last_validation timestamp
 *  - rpc_email_health_check      — detailed resource stats and recent failures
 *
 * Response shape matches EmailHealthInfo (src/services/email/types.ts):
 *  { status, source, lastValidation, cacheExpiration, recentFailures, stats }
 *
 * Auth: requires valid Supabase JWT (authenticated user).
 */
import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireUser } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const adminClient = createZappAdminClient();

    // ── rpc_get_email_health_summary: overall status + last validation ────────
    const { data: summaryRaw, error: summaryErr } = await adminClient
      .rpc('rpc_get_email_health_summary');

    if (summaryErr) {
      console.warn('[email-health] rpc_get_email_health_summary error:', summaryErr.message);
    }

    // ── rpc_email_health_check: per-resource failures and call stats ──────────
    const { data: checkRaw, error: checkErr } = await adminClient
      .rpc('rpc_email_health_check');

    if (checkErr) {
      console.warn('[email-health] rpc_email_health_check error:', checkErr.message);
    }

    // Shape definitions (loose — RPCs may return different types depending on impl)
    type Summary = { status?: string; last_validation?: string | null; failure_count_60m?: number };
    type FailureRecord = {
      request_id?: string;
      operation?: string;
      resource?: string;
      error?: string;
      timestamp?: string;
    };
    type CheckResult = {
      total_calls?: number;
      failed_calls?: number;
      cache_hits?: number;
      recent_failures?: FailureRecord[];
    };

    const summary = (summaryRaw ?? null) as Summary | null;
    const check = (checkRaw ?? null) as CheckResult | null;

    // Determine status: prefer summary's status, fall back to error if both RPCs failed
    const rawStatus = summary?.status ?? ((summaryErr && checkErr) ? 'error' : 'healthy');
    const status: 'healthy' | 'degraded' | 'error' =
      rawStatus === 'healthy' || rawStatus === 'degraded' || rawStatus === 'error'
        ? (rawStatus as 'healthy' | 'degraded' | 'error')
        : 'error';

    // Map DB snake_case failure records → camelCase EmailFailure shape
    const recentFailures = Array.isArray(check?.recent_failures)
      ? check!.recent_failures.map((f: FailureRecord) => ({
          requestId: f.request_id ?? '',
          operation: f.operation ?? 'unknown',
          resource: f.resource ?? 'unknown',
          error: f.error ?? '',
          timestamp: f.timestamp ?? new Date().toISOString(),
        }))
      : [];

    // Compose EmailHealthInfo-compatible response
    const healthInfo = {
      status,
      source: 'edge-function',
      lastValidation: summary?.last_validation ?? new Date().toISOString(),
      cacheExpiration: null,
      recentFailures,
      stats: {
        totalCalls: check?.total_calls ?? 0,
        failedCalls: check?.failed_calls ?? recentFailures.length,
        cacheHits: check?.cache_hits ?? 0,
      },
    };

    return jsonResponse(req, healthInfo);
  } catch (err) {
    console.error('[email-health] unexpected error:', err instanceof Error ? err.message : String(err));
    return errorResponse(req, 'Internal server error', 500);
  }
});
