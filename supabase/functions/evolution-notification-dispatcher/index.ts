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
// CONFIG DE CANAL (evo.evolution_notification_config, melhoria 2026-08-11):
//   A tabela existe em produção (schema evo NÃO exposto no PostgREST) mas a
//   edge não a lia — configurar a tabela não mudava nada. Agora a edge busca
//   a config por canal via RPC zapp.zapp_notif_config_get (SECURITY DEFINER,
//   service_role) e:
//     * FALLBACK DE DESTINATÁRIO quando o payload não traz um:
//         whatsapp_promo → config.chat_id (número)
//         email          → config.email_addresses[0]
//         slack          → config.slack_webhook (depois webhook_url)
//         webhook        → config.webhook_url
//     * PRIORITY FILTER: se config.priority_filter não vazio e
//       payload.priority (ou payload.metadata.priority) não está na lista
//       (CSV ou array), o item é SKIPADO (log + mark failed com
//       last_error='skipped_by_priority_filter' — sai do ciclo sem loop).
//   RPC indisponível/erro → config null → comportamento anterior (sem fallback).
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

/** Linha de evo.evolution_notification_config (via zapp_notif_config_get jsonb). */
export interface NotifChannelConfig {
  channel?: unknown;
  webhook_url?: unknown;
  api_token?: unknown;
  chat_id?: unknown;
  enabled?: unknown;
  notify_on?: unknown;
  slack_webhook?: unknown;
  email_addresses?: unknown;
  notify_on_hours?: unknown;
  notify_on_days?: unknown;
  priority_filter?: unknown;
  [key: string]: unknown;
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

/** Normaliza chat_id numérico (jsonb) para string. */
function asStringOrUndefined(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return undefined;
}

// ─── Núcleo de config (exportado p/ testes unitários sem rede) ──────────────

/**
 * Parseia priority_filter da config: aceita CSV ("high,urgent") ou array
 * jsonb (["high","urgent"]). Vazio/null → [] (filtro inativo).
 */
export function parsePriorityFilter(filter: unknown): string[] {
  if (Array.isArray(filter)) {
    return filter
      .map((v) => (typeof v === 'string' ? v.trim() : String(v)))
      .filter((v) => v.length > 0);
  }
  if (typeof filter === 'string') {
    return filter
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [];
}

/**
 * Decide se o item deve ser SKIPADO pelo priority_filter da config.
 * Regra: filtro não vazio E payload.priority (ou metadata.priority) não está
 * na lista → skip (payload sem priority com filtro ativo também skipa).
 */
export function isExcludedByPriorityFilter(
  config: NotifChannelConfig | null,
  payload: Record<string, unknown>,
): boolean {
  const allowed = parsePriorityFilter(config?.priority_filter);
  if (allowed.length === 0) return false;
  const priority = firstString(asRecord(payload.metadata)?.priority, payload.priority);
  if (priority === null) return true;
  return !allowed.includes(priority);
}

/** Destinatário WhatsApp: payload/metadata > contact > config.chat_id. */
export function resolveWhatsAppNumber(
  payload: Record<string, unknown>,
  contact: { phone: string | null },
  config: NotifChannelConfig | null,
): string | null {
  return firstString(
    asRecord(payload.metadata)?.phone,
    asRecord(payload.metadata)?.number,
    payload.phone,
    payload.number,
    contact.phone,
    asStringOrUndefined(config?.chat_id),
  );
}

/** Primeiro email de config.email_addresses (array) — fallback de email. */
export function firstEmailFromConfig(config: NotifChannelConfig | null): string | undefined {
  const addrs = config?.email_addresses;
  if (Array.isArray(addrs)) {
    for (const a of addrs) {
      const s = asStringOrUndefined(a);
      if (s !== undefined) return s;
    }
  }
  return undefined;
}

/** Destinatário email: payload/metadata > contact > config.email_addresses[0]. */
export function resolveEmailRecipient(
  payload: Record<string, unknown>,
  contact: { email: string | null },
  config: NotifChannelConfig | null,
): string | null {
  return firstString(
    asRecord(payload.metadata)?.to,
    asRecord(payload.metadata)?.email,
    payload.to,
    payload.email,
    contact.email,
    firstEmailFromConfig(config),
  );
}

/** URL webhook: payload/metadata > config (slack_webhook p/ slack; webhook_url geral). */
export function resolveWebhookUrl(
  channel: string,
  payload: Record<string, unknown>,
  config: NotifChannelConfig | null,
): string | null {
  const metadata = asRecord(payload.metadata);
  return firstString(
    metadata.webhook_url,
    metadata.slack_webhook_url,
    metadata.url,
    payload.webhook_url,
    payload.url,
    channel === 'slack' ? asStringOrUndefined(config?.slack_webhook) : undefined,
    asStringOrUndefined(config?.webhook_url),
  );
}

/**
 * Busca a config ativa do canal via RPC zapp.zapp_notif_config_get.
 * Retorna null quando: RPC falha (log), sem linha, ou desabilitada.
 * Nunca lança — fallback silencioso para o comportamento anterior.
 */
export async function getChannelConfig(
  supabase: ReturnType<typeof createZappAdminClient>,
  channel: string,
): Promise<NotifChannelConfig | null> {
  try {
    const { data, error } = await supabase.rpc('zapp_notif_config_get', { p_channel: channel });
    if (error) {
      console.warn(`[evolution-notification-dispatcher] zapp_notif_config_get falhou (${channel}): ${error.message}`);
      return null;
    }
    if (data === null || data === undefined) return null;
    return asRecord(data) as NotifChannelConfig;
  } catch (e) {
    console.warn(`[evolution-notification-dispatcher] zapp_notif_config_get exception (${channel}): ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
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
  config: NotifChannelConfig | null,
): Promise<{ ok: boolean; error: string | null }> {
  const url = (await getSecret('evolution_api_url'))?.replace(/\/+$/, '') ?? '';
  const apikey = (await getSecret('evolution_instance_token_wpp2')) ??
    (await getSecret('evolution_api_key'));
  const instance = (await getSecret('evolution_instance_name')) ?? 'wpp2';

  if (!url || !apikey) return { ok: false, error: 'vault: evolution_api_url/evolution_instance_token_wpp2 ausentes' };

  const number = resolveWhatsAppNumber(payload, contact, config);
  const text = firstString(payload.message, payload.title);
  if (!number) return { ok: false, error: 'whatsapp_promo sem número (payload/contact/config.chat_id)' };
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
  config: NotifChannelConfig | null,
): Promise<{ ok: boolean; error: string | null }> {
  const resendKey =
    (await getSecret('resend_api_key')) ?? Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return { ok: false, error: 'resend_api_key ausente (vault/env)' };

  const to = resolveEmailRecipient(payload, contact, config);
  const subject = firstString(payload.title, asRecord(payload.metadata)?.subject, 'Notificação Zapp');
  const html = firstString(asRecord(payload.metadata)?.html, payload.html, payload.message);
  if (!to) return { ok: false, error: 'email sem destinatário (payload/contact/config.email_addresses)' };
  if (!html) return { ok: false, error: 'email sem conteúdo (html/message)' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({ from: 'Promo Brindes <noreply@promobrindes.com.br>', to, subject, html }),
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

/** Envia para slack/webhook genérico — POST na URL do payload (ou config). */
async function sendWebhook(
  channel: string,
  payload: Record<string, unknown>,
  config: NotifChannelConfig | null,
): Promise<{ ok: boolean; error: string | null }> {
  const url = resolveWebhookUrl(channel, payload, config);
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: `${channel} sem webhook_url (payload/config)` };
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
      return json(req, { ok: true, claimed: 0, sent: 0, failed: 0, skipped_in_app: 0, config_used: 0, skipped_priority: 0, dryRun, message: 'outbox vazia' });
    }

    const stats = { sent: 0, failed: 0, skipped_in_app: 0, config_used: 0, skipped_priority: 0 };

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

      // Config do canal: fallback de destinatário + priority_filter.
      // Falha de leitura → null → comportamento anterior (sem fallback).
      const config = await getChannelConfig(supabase, channel);
      if (config !== null) stats.config_used++;

      if (dryRun) {
        await supabase.rpc('fn_evo_outbox_release', { p_id: row.id });
        continue;
      }

      // priority_filter: config ativa com filtro e payload.priority fora da
      // lista → skip (log + mark failed descritivo; sai do ciclo sem loop).
      if (isExcludedByPriorityFilter(config, payload)) {
        const priority = firstString(asRecord(payload.metadata)?.priority, payload.priority);
        console.warn(
          `[evolution-notification-dispatcher] outbox ${row.id} (${channel}): skip por priority_filter ` +
          `(payload.priority=${priority ?? '(ausente)'}, filtro=${JSON.stringify(config?.priority_filter)})`,
        );
        stats.skipped_priority++;
        const { error: markErr } = await supabase.rpc('fn_evo_outbox_mark', {
          p_id: row.id,
          p_status: 'failed',
          p_last_error: 'skipped_by_priority_filter',
        });
        if (markErr) {
          console.error(`[evolution-notification-dispatcher] mark skipped falhou para outbox ${row.id}:`, markErr.message);
        }
        continue;
      }

      const contact = await lookupContact(supabase, payload.contact_id);
      let result: { ok: boolean; error: string | null };

      switch (channel) {
        case 'whatsapp_promo':
          result = await sendWhatsAppPromo(payload, contact, config);
          break;
        case 'email':
          result = await sendEmail(payload, contact, config);
          break;
        case 'slack':
        case 'webhook':
          result = await sendWebhook(channel, payload, config);
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
