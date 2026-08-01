// Reprocessa entradas pendentes na DLQ `failed_messages`.
// Chamada por pg_cron a cada 15min ou manualmente por admin.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { computeBackoffMs, classifyRetryReason, computeBackoffMsByReason } from '../_shared/dlq-backoff.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_BATCH = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const evolutionUrl = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '');
  const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
  if (!evolutionUrl || !evolutionKey) {
    return json({ error: true, message: 'Evolution credentials missing' }, 500);
  }

  const { data: rows, error } = await supabase
    .from('failed_messages')
    .select('*')
    .in('status', ['pending', 'retrying'])
    .lte('next_attempt_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(MAX_BATCH);

  if (error) return json({ error: true, message: error.message }, 500);
  if (!rows || rows.length === 0) return json({ processed: 0, message: 'no pending messages' });

  let succeeded = 0;
  let failed = 0;
  let abandoned = 0;

  for (const row of rows) {
    const attempt = row.retry_count + 1;
    try {
      const payload = row.payload as Record<string, unknown>;
      const path = (payload.__path as string) || '/message/sendText';
      const idemKey = typeof payload.__idemKey === 'string' ? payload.__idemKey : null;
      const instance = row.instance_name;
      const body = { ...payload };
      delete (body as Record<string, unknown>).__path;
      delete (body as Record<string, unknown>).__idemKey;
      console.info('[dlq-reprocess]', JSON.stringify({
        id: row.id, instance, path, attempt, max: row.max_retries, hasIdem: !!idemKey,
      }));

      const fetchHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        apikey: evolutionKey,
      };
      if (idemKey) fetchHeaders['Idempotency-Key'] = idemKey;

      const resp = await fetch(`${evolutionUrl}${path}/${instance}`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify(body),
      });
      const respText = await resp.text();

      if (resp.ok) {
        await supabase.from('failed_messages').update({
          status: 'succeeded',
          retry_count: attempt,
          last_attempt_at: new Date().toISOString(),
          succeeded_at: new Date().toISOString(),
        }).eq('id', row.id);
        succeeded++;
      } else if (attempt >= row.max_retries) {
        const reason = classifyRetryReason(resp.status, respText);
        await supabase.from('failed_messages').update({
          status: 'abandoned',
          retry_count: attempt,
          last_attempt_at: new Date().toISOString(),
          http_status: resp.status,
          error_message: respText.slice(0, 500),
          last_retry_reason: reason,
        }).eq('id', row.id);
        abandoned++;
      } else {
        const reason = classifyRetryReason(resp.status, respText);
        const backoffMs = computeBackoffMsByReason(attempt + 1, reason);
        await supabase.from('failed_messages').update({
          status: 'retrying',
          retry_count: attempt,
          last_attempt_at: new Date().toISOString(),
          next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
          http_status: resp.status,
          error_message: respText.slice(0, 500),
          last_retry_reason: reason,
        }).eq('id', row.id);
        failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Sem resp: deduz motivo da mensagem (timeout/network → caso comum).
      const reason = classifyRetryReason(null, msg);
      const backoffMs = computeBackoffMsByReason(attempt + 1, reason);
      const next = attempt >= row.max_retries ? 'abandoned' : 'retrying';
      await supabase.from('failed_messages').update({
        status: next,
        retry_count: attempt,
        last_attempt_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now() + backoffMs).toISOString(),
        error_message: msg.slice(0, 500),
        last_retry_reason: reason,
      }).eq('id', row.id);
      if (next === 'abandoned') abandoned++; else failed++;
    }
  }

  return json({ processed: rows.length, succeeded, failed, abandoned });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
