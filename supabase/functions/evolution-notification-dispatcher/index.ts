// evolution-notification-dispatcher — dispatcher da outbox de canais externos.
//
// Lê um batch de evo.evolution_notification_outbox (status=pending, order by id,
// limit 20 default) e despacha por canal:
//   in_app        → nada (já entregue pelo processador)
//   whatsapp_promo→ Evolution API sendText (POST {url}/message/sendText/{instance},
//                   header apikey=<evolution_instance_token_wpp2> via vault)
//   email         → Resend direto (padrão do repo p/ cron: send-scheduled-report;
//                   send-email exige user JWT e NÃO aceita service role/x-cron-secret)
//   slack/webhook → POST à URL do payload (payload.metadata.webhook_url |
//                   payload.metadata.slack_webhook_url | payload.webhook_url | payload.url)
//
// Idempotência:
//   1. claim atômico via zapp.fn_evo_outbox_claim (UPDATE ... WHERE status='pending'
//      RETURNING) → status='sending' + attempt_count+1. Dois dispatchers concorrentes
//      nunca processam o mesmo item. Claims órfãos (>30min) voltam a 'pending' na RPC.
//   2. após envio: zapp.fn_evo_outbox_mark(id, 'sent'|'failed', last_error) — só
//      transiciona quem ainda está 'sending' (guard extra de idempotência).
//   3. dryRun: claim → devolve batch → zapp.fn_evo_outbox_release (volta a pending
//      sem incrementar attempt_count).
//
// Rate limit: 1 envio/segundo (sleep 1000ms entre itens) → lote 20 ≈ 20s/ciclo.
// Auth: requireServiceRoleOrCron (service role bearer OU x-cron-secret).
// Contrato: evolution-notification-dispatcher@v1 ({} aceito — cron sem body).
import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';
import { getSecret } from '../_shared/vault.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const RATE_LIMIT_MS = 1_000; // 1 envio por segundo
const FETCH_TIMEOUT_MS = 15_000;

interface OutboxRow {
  id: number;
  notification_id: string;
  channel: string;
  payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
  attempt_count: number;
  last_error: string | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(req: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

async function lookupContact(
  supabase: ReturnType<typeof createZappAdminClient>,
  contactId: unknown,
): Promise<{ phone: string | null; email: string | null }> {
  if (typeof contactId !== 'string' || contactId.length === 0) return { phone: null, email: null };
  const { data, error } = await supabase
    .from('contacts')
    .select('phone, email')
    .eq('id', contactId)
    .maybeSingle();
  if (error || !data) return { phone: null, email: null };
  const row = asRecord(data);
  return {
    phone: typeof row.phone === 'string' && row.phone.trim() ? row.phone.trim() : null,
    email: typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null,
  };
}

/** Envia WhatsApp promo via Evolution API sendText (transporte Deno fetch). */
async function sendWhatsAppPromo(
  payload: Record<string, unknown>,
  contact: { phone: string | null },
): Promise<{ ok: boolean; error: string | null }> {
  const url = (await getSecret('evolution_api_url'))?.replace(/\/+$/, '') ?? '';
  const apikey = (await getSecret('evolution_instance_token_wpp2')) ??
    (await getSecret('evolution_api_key'));
  const instance = (await getSecret('evolution_instance_name')) ?? 'wpp2';

  if (!url || !apikey) return { ok: false, error: 'vault: evolution_api_url/evolution_instance_token_wpp2 ausentes' };

  const number = firstString(
    asRecord(payload.metadata)?.phone,
    asRecord(payload.metadata)?.number,
    payload.phone,
    payload.number,
    contact.phone,
  );
  const text = firstString(payload.message, payload.title);
  if (!number) return { ok: false, error: 'whatsapp_promo sem número (payload/contact)' };
  if (!text) return { ok: false, error: 'whatsapp_promo sem texto (message/title)' };

  try {
    const res = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify({ number, text }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Evolution sendText HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `Evolution sendText exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Envia email transacional via Resend — MESMO padrão do repo para contexto
 * service/cron (send-scheduled-report; e o fallback interno do send-email).
 * Motivo: send-email exige user JWT (requireUser) e rejeita service role e
 * x-cron-secret (401 "Unauthorized: user session required" — verificado em prod),
 * portanto NÃO é invocável a partir de um dispatcher service-to-service.
 */
async function sendEmail(
  payload: Record<string, unknown>,
  contact: { email: string | null },
): Promise<{ ok: boolean; error: string | null }> {
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return { ok: false, error: 'RESEND_API_KEY ausente' };

  const metadata = asRecord(payload.metadata);
  const to = firstString(metadata.to, metadata.email, payload.to, payload.email, contact.email);
  const subject = firstString(payload.title, metadata.subject, 'Notificação Zapp');
  const html = firstString(metadata.html, payload.html, payload.message);
  if (!to) return { ok: false, error: 'email sem destinatário (payload/contact)' };
  if (!html) return { ok: false, error: 'email sem conteúdo (html/message)' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from: 'noreply@zappweb.app', to, subject, html }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Resend HTTP ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `Resend exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Envia para slack/webhook genérico — POST na URL do payload. */
async function sendWebhook(
  channel: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error: string | null }> {
  const metadata = asRecord(payload.metadata);
  const url = firstString(
    metadata.webhook_url,
    metadata.slack_webhook_url,
    metadata.url,
    payload.webhook_url,
    payload.url,
  );
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: `${channel} sem webhook_url no payload` };
  }
  const text = firstString(payload.message, payload.title, 'Notificação Zapp') ?? '';
  const body = channel === 'slack' ? { text } : { text, title: payload.title ?? null, notification_id: payload.notification_id ?? null };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: `${channel} HTTP ${res.status}: ${errBody.slice(0, 300)}` };
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `${channel} exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  // Contrato evolution-notification-dispatcher@v1 — cron sem body → {} aceito.
  const parsed = parseOrReject('evolution-notification-dispatcher', CONTRACT_SCHEMAS['evolution-notification-dispatcher'], req, await req.json().catch(() => ({})), {
    extraHeaders: getCorsHeaders(req),
  });
  if (parsed.ok === false) return parsed.response;

  const body = asRecord(parsed.data);
  const limit = typeof body.limit === 'number' ? Math.min(Math.max(Math.trunc(body.limit), 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const dryRun = body.dryRun === true;

  const supabase = createZappAdminClient();

  try {
    // 1. Claim atômico (UPDATE ... WHERE status='pending' RETURNING → 'sending').
    const { data: batch, error: claimErr } = await supabase.rpc('fn_evo_outbox_claim', { p_limit: limit });
    if (claimErr) {
      console.error('[evolution-notification-dispatcher] claim falhou:', claimErr.message);
      return json(req, { error: 'claim_failed', detail: claimErr.message }, 502);
    }
    const rows = Array.isArray(batch) ? (batch as OutboxRow[]) : [];
    if (rows.length === 0) {
      return json(req, { ok: true, claimed: 0, sent: 0, failed: 0, skipped_in_app: 0, dryRun, message: 'outbox vazia' });
    }

    const stats = { sent: 0, failed: 0, skipped_in_app: 0 };

    for (let i = 0; i < rows.length; i++) {
      // Rate limit: 1 envio/segundo (entre itens).
      if (i > 0) await sleep(RATE_LIMIT_MS);

      const row = rows[i];
      const payload = asRecord(row.payload);
      const channel = row.channel;

      // in_app já foi entregue pelo processador — nada a fazer.
      if (channel === 'in_app') {
        stats.skipped_in_app++;
        continue;
      }

      if (dryRun) {
        await supabase.rpc('fn_evo_outbox_release', { p_id: row.id });
        continue;
      }

      const contact = await lookupContact(supabase, payload.contact_id);
      let result: { ok: boolean; error: string | null };

      switch (channel) {
        case 'whatsapp_promo':
          result = await sendWhatsAppPromo(payload, contact);
          break;
        case 'email':
          result = await sendEmail(payload, contact);
          break;
        case 'slack':
        case 'webhook':
          result = await sendWebhook(channel, payload);
          break;
        default:
          result = { ok: false, error: `canal desconhecido: ${channel}` };
      }

      // 2. Mark final (só transiciona quem ainda está 'sending').
      if (result.ok) {
        const { error: markErr } = await supabase.rpc('fn_evo_outbox_mark', { p_id: row.id, p_status: 'sent' });
        if (markErr) {
          console.error(`[evolution-notification-dispatcher] mark sent falhou para outbox ${row.id}:`, markErr.message);
          stats.failed++;
        } else {
          stats.sent++;
        }
      } else {
        const { error: markErr } = await supabase.rpc('fn_evo_outbox_mark', {
          p_id: row.id,
          p_status: 'failed',
          p_last_error: result.error ?? 'erro desconhecido',
        });
        if (markErr) {
          console.error(`[evolution-notification-dispatcher] mark failed falhou para outbox ${row.id}:`, markErr.message);
        }
        stats.failed++;
      }
    }

    return json(req, { ok: true, claimed: rows.length, ...stats, dryRun, limit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[evolution-notification-dispatcher] erro fatal:', msg);
    return json(req, { error: 'internal_error', detail: msg }, 500);
  }
});
