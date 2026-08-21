// Reprocessa entradas pendentes na DLQ `failed_messages`.
// Chamada por pg_cron a cada 15min ou manualmente por admin.
// Auth: SUPABASE_SERVICE_ROLE_KEY (via createZappAdminClient) ou admin JWT.
import { createZappAdminClient } from '../_shared/db-client.ts';
import { classifyRetryReason, computeBackoffMsByReason } from '../_shared/dlq-backoff.ts';
import { requireAdminOrSupervisor, requireServiceRoleOrCron } from '../_shared/auth.ts';

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';
import { readJsonBodyOrEmpty } from '../_shared/validation.ts';
import { evolutionFetch } from '../_shared/providers/evolution/index.ts';
const MAX_BATCH = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req); // sets Access-Control-Allow-Origin

  try {
    // Accept internal (service role / cron) or admin/supervisor user JWTs.
    const internalDenied = requireServiceRoleOrCron(req);
    if (internalDenied) {
      const authed = await requireAdminOrSupervisor(req);
      if (authed instanceof Response) return authed;
    }

    // Contrato reprocess-failed-messages@v1 (G4): body opcional ({ limit?, dryRun? }).
    const parsed = parseOrReject(
      'reprocess-failed-messages',
      CONTRACT_SCHEMAS['reprocess-failed-messages'],
      req,
      await readJsonBodyOrEmpty(req),
      {
        extraHeaders: getCorsHeaders(req),
      }
    );
    if (parsed.ok === false) return parsed.response;

    // Uses service-role credentials (SUPABASE_SERVICE_ROLE_KEY) via createZappAdminClient()
    const supabase = createZappAdminClient();

    const { data: rows, error } = await supabase
      .from('failed_messages')
      .select('*')
      .in('status', ['pending', 'retrying'])
      .lte('next_attempt_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(MAX_BATCH);

    if (error) {
      console.error('[reprocess-failed-messages] fetch error', error.message);
      return json(req, { error: true, message: 'Failed to fetch messages' }, 500);
    }
    if (!rows || rows.length === 0) {
      return json(req, { processed: 0, message: 'no pending messages' });
    }

    let succeeded = 0;
    let failed = 0;
    let abandoned = 0;

    for (const row of rows) {
      const attempt = row.retry_count + 1;
      try {
        const payload = row.payload as Record<string, unknown>;
        const rawPath = (payload.__path as string) || '/message/sendText';
        const idemKey = typeof payload.__idemKey === 'string' ? payload.__idemKey : null;
        const instance = row.instance_name as string;
        const body = { ...payload };
        delete (body as Record<string, unknown>).__path;
        delete (body as Record<string, unknown>).__idemKey;

        // Validate path and instance to prevent SSRF via malicious DB rows.
        // Path is narrowed to /message/* sub-paths — the only paths the DLQ is meant to retry.
        const SAFE_PATH_RE = /^\/message\/[a-zA-Z0-9/_-]{1,64}$/;
        // Instance names may include dots (e.g. provider-assigned IDs like "tenant.v1.abc123").
        const INSTANCE_RE = /^[a-zA-Z0-9._-]{1,128}$/;
        if (
          !SAFE_PATH_RE.test(rawPath) ||
          !INSTANCE_RE.test(instance ?? '') ||
          instance === '.' ||
          instance === '..'
        ) {
          console.error('[dlq-reprocess] unsafe path or instance, abandoning row', { id: row.id });
          await supabase
            .from('failed_messages')
            .update({
              status: 'abandoned',
              retry_count: attempt,
              last_attempt_at: new Date().toISOString(),
              error_message: 'unsafe path or instance_name rejected',
            })
            .eq('id', row.id);
          abandoned++;
          continue;
        }
        const path = rawPath;

        // E83: roteia por provider. Row cloud = instance_name que parece
        // PHONE_NUMBER_ID (numérico longo da Meta) OU provider='cloud'
        // (coluna nova na failed_messages, se existir).
        const isCloudRow =
          row.provider === 'cloud' || instance === 'cloud' || /^\d{8,}$/.test(instance);

        console.info(
          '[dlq-reprocess]',
          JSON.stringify({
            id: row.id,
            instance,
            path,
            attempt,
            max: row.max_retries,
            hasIdem: !!idemKey,
            provider: isCloudRow ? 'cloud' : 'evolution',
          })
        );

        // Mesmo envelope ({ok,status,error}) para os dois providers → bookkeeping
        // comum abaixo (succeeded/retrying/abandoned) permanece intacto.
        let resp: { ok: boolean; status: number; error?: string };
        if (isCloudRow) {
          const cloudUrl = `${
            Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')
          }/functions/v1/whatsapp-cloud-send`;
          const authHeader = req.headers.get('Authorization') ?? '';
          const cloudRes = await fetch(cloudUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authHeader ? { Authorization: authHeader } : {}),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
          });
          // whatsapp-cloud-send responde envelope Evolution-parity: 200 +
          // {error:true,status,message} em falha de envio; 4xx/429/5xx reais
          // em violação de contrato/auth/rate-limit.
          const cloudBody = (await cloudRes.json().catch(() => null)) as {
            error?: boolean;
            status?: number;
            message?: string;
          } | null;
          const errored = !!cloudBody && typeof cloudBody === 'object' && cloudBody.error === true;
          if (cloudRes.ok && !errored) {
            resp = { ok: true, status: cloudRes.status };
          } else {
            const status = cloudBody?.status ?? cloudRes.status;
            const message = cloudBody?.message ?? `HTTP ${cloudRes.status}`;
            resp = { ok: false, status, error: `HTTP ${status}: ${message}` };
          }
        } else {
          resp = await evolutionFetch(`${path.replace(/^\//, '')}/${instance}`, {
            method: 'POST',
            headers: idemKey ? { 'Idempotency-Key': idemKey } : {},
            body: JSON.stringify(body),
            timeoutMs: 15_000,
          });
        }
        const statusCode = resp.ok
          ? resp.status
          : parseInt((resp.error ?? '').match(/^HTTP (\d+)/)?.[1] ?? '0');
        const respText = resp.ok ? '' : (resp.error ?? '').replace(/^HTTP \d+:\s*/, '');

        if (resp.ok) {
          await supabase
            .from('failed_messages')
            .update({
              status: 'succeeded',
              retry_count: attempt,
              last_attempt_at: new Date().toISOString(),
              succeeded_at: new Date().toISOString(),
            })
            .eq('id', row.id);
          succeeded++;
        } else if (attempt >= row.max_retries) {
          const reason = classifyRetryReason(statusCode, respText);
          await supabase
            .from('failed_messages')
            .update({
              status: 'abandoned',
              retry_count: attempt,
              last_attempt_at: new Date().toISOString(),
              http_status: statusCode,
              error_message: respText.slice(0, 500),
              last_retry_reason: reason,
            })
            .eq('id', row.id);
          abandoned++;
        } else {
          const reason = classifyRetryReason(statusCode, respText);
          const backoffMs = computeBackoffMsByReason(attempt + 1, reason);
          await supabase
            .from('failed_messages')
            .update({
              status: 'retrying',
              retry_count: attempt,
              last_attempt_at: new Date().toISOString(),
              next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
              http_status: statusCode,
              error_message: respText.slice(0, 500),
              last_retry_reason: reason,
            })
            .eq('id', row.id);
          failed++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Sem resp: deduz motivo da mensagem (timeout/network → caso comum).
        const reason = classifyRetryReason(null, msg);
        const backoffMs = computeBackoffMsByReason(attempt + 1, reason);
        const next = attempt >= row.max_retries ? 'abandoned' : 'retrying';
        await supabase
          .from('failed_messages')
          .update({
            status: next,
            retry_count: attempt,
            last_attempt_at: new Date().toISOString(),
            next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
            error_message: msg.slice(0, 500),
            last_retry_reason: reason,
          })
          .eq('id', row.id);
        if (next === 'abandoned') abandoned++;
        else failed++;
      }
    }

    return json(req, { processed: rows.length, succeeded, failed, abandoned });
  } catch (err) {
    console.error(
      '[reprocess-failed-messages] unhandled error:',
      err instanceof Error ? err.message : String(err)
    );
    return json(req, { error: true, message: 'Internal server error' }, 500);
  }
});

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}
