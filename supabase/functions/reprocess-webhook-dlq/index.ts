// Reprocesses pending entries in the inbound webhook DLQ (evo.evolution_webhook_dlq).
// Handles the "ghost processed" pattern: events marked processed=true in webhook_events_processed
// but that failed to persist a message — now routed to DLQ thanks to the throw-on-insert-fail fix.
// Called by pg_cron every 5 minutes or manually by admin.
// Auth: SUPABASE_SERVICE_ROLE_KEY (via createZappAdminClient) or admin JWT.
import { createZappAdminClient } from '../_shared/db-client.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { requireServiceRoleOrCron, requireAdminOrSupervisor } from '../_shared/auth.ts';
import { handleIncomingMessage, handleOutgoingWhatsAppMessage } from '../_shared/evolution-webhook-messages.ts';
import { isRecord } from '../_shared/evolution-helpers.ts';

const MAX_BATCH = 20;
const MAX_RETRIES = 5;
const ENTRY_TIMEOUT_MS = 30_000;

// Only these event types can be replayed by this reprocessor.
// All other event types stored in the DLQ (via the outer catch in evolution-webhook/index.ts)
// are immediately abandoned so they do not accumulate forever as pending.
const REPLAYABLE_EVENT_TYPES = new Set(['messages.upsert']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const internalDenied = requireServiceRoleOrCron(req);
    if (internalDenied) {
      const authed = await requireAdminOrSupervisor(req);
      if (authed instanceof Response) return authed;
    }

    const supabase = createZappAdminClient();
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Fetch ALL pending DLQ entries regardless of event_type so non-replayable entries
    // are promptly abandoned rather than accumulating forever with retry_count=0.
    const { data: rows, error } = await supabase
      .schema('evo')
      .from('evolution_webhook_dlq')
      .select('*')
      .eq('status', 'pending')
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(MAX_BATCH);

    if (error) {
      console.error('[dlq-reprocess] fetch error', error.message);
      return jsonResp({ error: true, message: 'Failed to fetch DLQ entries' }, 500);
    }

    if (!rows || rows.length === 0) {
      return jsonResp({ processed: 0, message: 'no pending DLQ entries' });
    }

    let succeeded = 0;
    let retrying = 0;
    let abandoned = 0;

    for (const row of rows) {
      const eventType = (row.event_type as string) || '';
      const retryCount = (row.retry_count as number) || 0;

      // Immediately abandon event types the reprocessor cannot replay.
      // These arrive via the outer catch in evolution-webhook/index.ts for any failed event.
      if (!REPLAYABLE_EVENT_TYPES.has(eventType)) {
        await markDlqEntry(
          supabase,
          row.id,
          'abandoned',
          retryCount + 1,
          `event type '${eventType}' is not replayable by the DLQ reprocessor`
        );
        abandoned++;
        continue;
      }

      const instance = (row.instance_name as string) || '';
      const payload = row.payload as Record<string, unknown> | null;

      if (!instance || !payload) {
        await markDlqEntry(supabase, row.id, 'abandoned', retryCount + 1, 'missing instance_name or payload');
        abandoned++;
        continue;
      }

      // Reconstruct the key object from the merged payload (same logic as index.ts).
      const keySource = isRecord(payload.key) ? payload.key : null;
      const externalId =
        (typeof payload.id === 'string' && payload.id) ||
        (typeof keySource?.id === 'string' && keySource.id) ||
        null;

      if (!externalId) {
        await markDlqEntry(supabase, row.id, 'abandoned', retryCount + 1, 'missing message id in payload');
        abandoned++;
        continue;
      }

      const key = {
        id: externalId,
        fromMe: Boolean(
          (typeof payload.fromMe === 'boolean' ? payload.fromMe : undefined) ??
          (typeof keySource?.fromMe === 'boolean' ? keySource.fromMe : undefined) ??
          false
        ),
        remoteJid:
          (typeof payload.remoteJid === 'string' ? payload.remoteJid : undefined) ??
          (typeof keySource?.remoteJid === 'string' ? keySource.remoteJid : undefined),
        remoteJidAlt:
          (typeof payload.remoteJidAlt === 'string' ? payload.remoteJidAlt : undefined) ??
          (typeof keySource?.remoteJidAlt === 'string' ? keySource.remoteJidAlt : undefined),
        participant:
          (typeof payload.participant === 'string' ? payload.participant : undefined) ??
          (typeof keySource?.participant === 'string' ? keySource.participant : undefined),
        participantAlt:
          (typeof payload.participantAlt === 'string' ? payload.participantAlt : undefined) ??
          (typeof keySource?.participantAlt === 'string' ? keySource.participantAlt : undefined),
      };

      try {
        const work = key.fromMe
          ? handleOutgoingWhatsAppMessage(supabase, instance, payload, key)
          : handleIncomingMessage(supabase, instance, payload, key, supabaseUrl, supabaseServiceKey);

        await withTimeout(work, ENTRY_TIMEOUT_MS, `dlq entry ${row.id}`);
        await markDlqEntry(supabase, row.id, 'succeeded', retryCount + 1, null);
        succeeded++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[dlq-reprocess] entry ${row.id} failed on attempt ${retryCount + 1}: ${msg}`);
        const nextStatus = retryCount + 1 >= MAX_RETRIES ? 'abandoned' : 'pending';
        await markDlqEntry(supabase, row.id, nextStatus, retryCount + 1, msg.slice(0, 500));
        if (nextStatus === 'abandoned') abandoned++; else retrying++;
      }
    }

    return jsonResp({ processed: rows.length, succeeded, retrying, abandoned });
  } catch (err) {
    console.error('[dlq-reprocess] unhandled error:', err instanceof Error ? err.message : String(err));
    return jsonResp({ error: true, message: 'Internal server error' }, 500);
  }
});

async function markDlqEntry(
  supabase: ReturnType<typeof createZappAdminClient>,
  id: string,
  status: string,
  retryCount: number,
  errorMessage: string | null
) {
  const { error } = await supabase
    .schema('evo')
    .from('evolution_webhook_dlq')
    .update({
      status,
      retry_count: retryCount,
      last_attempt_at: new Date().toISOString(),
      // Always write error_message (null clears a previous failure's message on success).
      error_message: errorMessage,
      ...(status === 'succeeded' ? { succeeded_at: new Date().toISOString() } : {}),
    })
    .eq('id', id);
  if (error) {
    console.error(`[dlq-reprocess] failed to update DLQ entry ${id}:`, error.message);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
