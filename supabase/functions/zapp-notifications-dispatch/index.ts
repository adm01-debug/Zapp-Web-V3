// zapp-notifications-dispatch — executor DASHBOARD-08 (Etapa 68.4).
//
// Papel: executor de notificações. Recebe EVENTOS (POST JSON) que mencionam uma
// conversa e, para cada canal ativo em `zapp.notification_channels_config`
// (enabled=true, min_severity <= severidade do evento), ENVIA via o gateway do
// canal (webhook_url no config | Evolution sendText p/ whatsapp | Resend p/ email).
// Sem executor = config morta (finding 25 L348-349) — este é o executor real.
//
// REQUEST (POST, body JSON; espelho dos payloads reais do front):
//   {
//     "event_type": "conversation_mentioned" | "new_message" | "sla_breach",
//     "conversation_id": "<uuid>",   // obrigatório p/ DISPATCH real
//     "workspace_id": "<uuid>",      // obrigatório p/ DISPATCH real
//     "severity": "info" | "warning" | "critical" (default "info"),
//     "title": "string",
//     "message": "string",
//     "metadata": { ... }            // opcional, passthrough
//   }
//   Cron/health: body vazio `{}` é aceito → heartbeat NO-OP (liveness do pipeline,
//   padrão dos crons do repo — ex.: evolution-notification-dispatcher, nps-scheduler).
//
// AUTH: requireServiceRoleOrCron — service-role bearer OU x-cron-secret ==
// CRON_SECRET (espelho do irmão evolution-notification-dispatcher). Função de
// cron fica na PUBLIC_FNS do main/index.ts e se auto-protege (401 fail-closed).
//
// GATE: parseOrReject('zapp-notifications-dispatch', CONTRACT_SCHEMAS[...]) →
// 422 envelope canônico em body inválido (enums/UUIDs/tipos).
//
// DEDUP POR EVENTO (Etapa 68.9 — "dedup de eventos com payload repetido"):
// guard insert-first canônico do repo: `zapp.webhook_events_processed` via
// markEventProcessed (mesmo helper dos webhooks evolution/whatsapp-cloud).
// eventId ESTÁVEL derivado do corpo — `zapp-notifications-dispatch:<sha256 do
// JSON normalizado>` — o mesmo payload postado 2x gera a MESMA chave; conflito
// 23505 => duplicata => 200 { noop: true, deduped: true } sem chamar gateway.
// Camada extra por canal: claim INSERT-first em `zapp.notification_delivery_log`
// (UNIQUE (event_key, channel_id), event_key = `${event_type}|${workspace_id}|
// ${conversation_id}`) — registra a entrega por canal e impede re-envio
// concorrente do mesmo evento para o mesmo canal (23505 => skip).
// Falhas dos guards (tabela ausente etc.) = FAIL-OPEN com warn — dedup nunca
// bloqueia envio.
//
// TIMEOUT: todo fetch de gateway usa AbortSignal.timeout(FETCH_TIMEOUT_MS=15s).
//
// ERROS REGISTRADOS SEM CRASH: falha de envio → UPDATE do canal com
// last_sent_at/error (Etapa 68.3) + status 'failed' no delivery log; resposta
// SEMPRE 200 — nunca 5xx.
//
// Contrato: zapp-notifications-dispatch@v1 (registrado em contract-schemas.ts,
// contract-versions.ts e edge-contract-schemas.ts).

import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';
import { getSecret } from '../_shared/vault.ts';
import { sha256Hex, markEventProcessed } from '../_shared/evolution-helpers.ts';
import { fetchWithRetry } from '../_shared/retry-with-backoff.ts';
import { readJsonBodyOrEmpty } from '../_shared/validation.ts';

const FETCH_TIMEOUT_MS = 15_000;

const SEVERITY_RANK: Record<string, number> = { info: 1, warning: 2, critical: 3 };

interface ChannelRow {
  id: number;
  channel_name: string | null;
  enabled: boolean | null;
  min_severity: string | null;
  config: unknown;
}

interface DispatchEvent {
  event_type: string;
  conversation_id: string | null;
  workspace_id: string | null;
  severity: string;
  title: string | null;
  message: string | null;
  metadata: Record<string, unknown>;
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

/** Chave de dedup por canal: `${event_type}|${workspace_id}|${conversation_id}`. */
export function eventKey(e: DispatchEvent): string {
  return `${e.event_type}|${e.workspace_id ?? ''}|${e.conversation_id ?? ''}`;
}

/** Canal atende a severidade do evento? min_severity nulo/vazio → sempre passa. */
export function channelAcceptsSeverity(channel: ChannelRow, severity: string): boolean {
  const min = firstString(channel.min_severity);
  if (min === null) return true;
  const minRank = SEVERITY_RANK[min.toLowerCase()];
  if (minRank === undefined) return true; // valor desconhecido → não descarta silenciosamente
  return (SEVERITY_RANK[severity] ?? 0) >= minRank;
}

/** Reune canais ativos (enabled=true). Falha de leitura → [] (no-op, sem crash). */
export async function fetchActiveChannels(
  supabase: ReturnType<typeof createZappAdminClient>,
): Promise<ChannelRow[]> {
  try {
    const { data, error } = await supabase
      .from('notification_channels_config')
      .select('*')
      .eq('enabled', true);
    if (error) {
      console.warn(`[zapp-notifications-dispatch] leitura de canais falhou: ${error.message}`);
      return [];
    }
    return (Array.isArray(data) ? data : []) as ChannelRow[];
  } catch (e) {
    console.warn(
      `[zapp-notifications-dispatch] leitura de canais (exception): ${e instanceof Error ? e.message : String(e)}`,
    );
    return [];
  }
}

/**
 * Claim INSERT-first por evento+canal em `zapp.notification_delivery_log`
 * (UNIQUE (event_key, channel_id)). true = evento NOVO para o canal (pode
 * enviar); 23505 = duplicata (skip). Falha não-conflito = fail-open (true).
 */
export async function claimDelivery(
  supabase: ReturnType<typeof createZappAdminClient>,
  key: string,
  channelId: number,
): Promise<boolean> {
  try {
    // INSERT sem onConflict: violação do UNIQUE (event_key, channel_id) vira
    // 409 com code 23505 no PostgREST — exatamente o conflito que queremos.
    const { error } = await supabase.from('notification_delivery_log').insert({
      event_key: key,
      channel_id: channelId,
      status: 'sending',
    });
    if (error && error.code === '23505') {
      console.warn(`[zapp-notifications-dispatch] dedup: evento ${key} já entregue p/ canal ${channelId}`);
      return false;
    }
    if (error) {
      console.warn(`[zapp-notifications-dispatch] delivery_log indisponível (fail-open): ${error.message}`);
    }
    return true;
  } catch (e) {
    console.warn(
      `[zapp-notifications-dispatch] delivery_log exception (fail-open): ${e instanceof Error ? e.message : String(e)}`,
    );
    return true;
  }
}

/** Registra o desfecho no delivery log (status sent/failed) — best-effort. */
export async function markDelivery(
  supabase: ReturnType<typeof createZappAdminClient>,
  key: string,
  channelId: number,
  status: 'sent' | 'failed',
  errorMsg: string | null,
): Promise<void> {
  try {
    await supabase
      .from('notification_delivery_log')
      .update({ status, error: errorMsg })
      .eq('event_key', key)
      .eq('channel_id', channelId);
  } catch (e) {
    console.warn(
      `[zapp-notifications-dispatch] markDelivery falhou: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Persiste o estado do canal (last_sent_at/error — Etapa 68.3) — best-effort. */
export async function updateChannelState(
  supabase: ReturnType<typeof createZappAdminClient>,
  channelId: number,
  nowIso: string,
  errorMsg: string | null,
): Promise<void> {
  try {
    const payload: Record<string, unknown> = { last_sent_at: nowIso };
    if (errorMsg !== null) payload.error = errorMsg;
    await supabase.from('notification_channels_config').update(payload).eq('id', channelId);
  } catch (e) {
    console.warn(
      `[zapp-notifications-dispatch] updateChannelState falhou: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/** Envia WhatsApp via Evolution API sendText (mesmo transporte do irmão dispatcher). */
async function sendWhatsApp(
  config: Record<string, unknown>,
  ev: DispatchEvent,
): Promise<{ ok: boolean; error: string | null }> {
  const url = (await getSecret('evolution_api_url'))?.replace(/\/+$/, '') ?? '';
  const apikey = (await getSecret('evolution_instance_token_wpp2')) ??
    (await getSecret('evolution_api_key'));
  const instance = (await getSecret('evolution_instance_name')) ?? 'wpp2';
  if (!url || !apikey) return { ok: false, error: 'vault: evolution_api_url/evolution_instance_token_wpp2 ausentes' };

  const number = firstString(config.number, config.phone, config.chat_id);
  const text = firstString(ev.message, ev.title);
  if (!number) return { ok: false, error: 'whatsapp sem número no config (number/phone/chat_id)' };
  if (!text) return { ok: false, error: 'whatsapp sem texto (message/title)' };

  try {
    const res = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey },
      body: JSON.stringify({ number, text }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Evolution sendText HTTP ${res.status}: ${body.slice(0, 300)}` };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `Evolution sendText exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Envia email transacional via Resend (padrão do repo p/ contexto service/cron). */
async function sendEmail(
  config: Record<string, unknown>,
  ev: DispatchEvent,
): Promise<{ ok: boolean; error: string | null }> {
  const resendKey = (await getSecret('resend_api_key')) ?? Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return { ok: false, error: 'resend_api_key ausente (vault/env)' };

  const to = firstString(config.to, config.email, Array.isArray(config.email_addresses) ? config.email_addresses[0] : undefined);
  const subject = firstString(ev.title, 'Notificação Zapp') ?? 'Notificação Zapp';
  const html = firstString(ev.message, '<p>Notificação Zapp</p>') ?? '<p>Notificação Zapp</p>';
  if (!to) return { ok: false, error: 'email sem destinatário no config (to/email/email_addresses)' };

  try {
    const res = await fetchWithRetry('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: (await getSecret('resend_from')) ?? 'Promo Brindes <on@resend.dev>',
        to,
        subject,
        html,
      }),
    }, {
      timeoutMs: FETCH_TIMEOUT_MS,
      label: 'Resend',
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Resend HTTP ${res.status}: ${body.slice(0, 300)}` };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `Resend exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Envia via gateway webhook do canal — POST na webhook_url do config. */
async function sendWebhook(
  webhookUrl: string,
  ev: DispatchEvent,
  channelName: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  const payload = {
    event_type: ev.event_type,
    conversation_id: ev.conversation_id,
    workspace_id: ev.workspace_id,
    severity: ev.severity,
    title: ev.title,
    message: ev.message,
    metadata: ev.metadata,
    channel: channelName,
    sent_at: new Date().toISOString(),
  };
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `${channelName ?? 'webhook'} HTTP ${res.status}: ${body.slice(0, 300)}` };
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: `${channelName ?? 'webhook'} exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Despacha UM evento para UM canal ativo. Retorna o resultado do envio —
 * NUNCA lança (erro vira { ok: false, error }).
 */
export async function dispatchToChannel(
  channel: ChannelRow,
  ev: DispatchEvent,
): Promise<{ ok: boolean; error: string | null }> {
  const config = asRecord(channel.config);
  const type = firstString(config.type, channel.channel_name) ?? 'webhook';

  // in_app já é entregue em tempo real pelo app — nada a enviar.
  if (type === 'in_app') return { ok: true, error: null };

  // Gateway explícito no config tem prioridade (webhook/email/webhook etc.).
  const webhookUrl = firstString(config.webhook_url, config.url);
  if (webhookUrl && /^https?:\/\//i.test(webhookUrl)) {
    return await sendWebhook(webhookUrl, ev, channel.channel_name);
  }

  switch (type) {
    case 'whatsapp':
    case 'whatsapp_promo':
      return await sendWhatsApp(config, ev);
    case 'email':
      return await sendEmail(config, ev);
    default:
      return { ok: false, error: `canal '${type}' sem webhook_url no config (gateway ausente)` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  // Contrato zapp-notifications-dispatch@v1 — cron chama sem body ({} aceito).
  const parsed = parseOrReject(
    'zapp-notifications-dispatch',
    CONTRACT_SCHEMAS['zapp-notifications-dispatch'],
    req,
    await readJsonBodyOrEmpty(req),
    { extraHeaders: getCorsHeaders(req) },
  );
  if (parsed.ok === false) return parsed.response;

  const raw = asRecord(parsed.data);
  const ev: DispatchEvent = {
    event_type: typeof raw.event_type === 'string' ? raw.event_type : '',
    conversation_id: typeof raw.conversation_id === 'string' ? raw.conversation_id : null,
    workspace_id: typeof raw.workspace_id === 'string' ? raw.workspace_id : null,
    severity: typeof raw.severity === 'string' ? raw.severity : 'info',
    title: typeof raw.title === 'string' ? raw.title : null,
    message: typeof raw.message === 'string' ? raw.message : null,
    metadata: asRecord(raw.metadata),
  };

  // Heartbeat de cron: sem conversa → no-op de liveness (nunca 5xx).
  if (ev.conversation_id === null) {
    return json(req, { noop: true, heartbeat: true, dispatched: 0, failed: 0 });
  }

  const supabase = createZappAdminClient();

  // DEDUP POR EVENTO — guard insert-first canônico (markEventProcessed em
  // webhook_events_processed). eventId ESTÁVEL derivado do corpo: o mesmo
  // payload postado 2x gera a MESMA chave → duplicata é no-op sem gateway.
  const eventId = `zapp-notifications-dispatch:${await sha256Hex(JSON.stringify(raw))}`;
  const isNew = await markEventProcessed(supabase, eventId, 'zapp-notifications-dispatch', ev.event_type);
  if (!isNew) {
    return json(req, { noop: true, deduped: true, dispatched: 0, failed: 0 });
  }

  const key = eventKey(ev);
  const channels = await fetchActiveChannels(supabase);
  const eligible = channels.filter((c) => channelAcceptsSeverity(c, ev.severity));

  let dispatched = 0;
  let failed = 0;
  let dedupedCount = 0;
  const errors: string[] = [];

  try {
    for (const channel of eligible) {
      // Camada extra por canal: claim INSERT-first no delivery log
      // (UNIQUE event_key+channel_id) — duplicata (23505) é SKIPADA.
      const channelClaimed = await claimDelivery(supabase, key, channel.id);
      if (!channelClaimed) {
        dedupedCount++;
        continue;
      }

      const nowIso = new Date().toISOString();
      const result = await dispatchToChannel(channel, ev);
      if (result.ok) {
        dispatched++;
        await updateChannelState(supabase, channel.id, nowIso, null);
        await markDelivery(supabase, key, channel.id, 'sent', null);
      } else {
        failed++;
        errors.push(result.error ?? 'erro desconhecido');
        await updateChannelState(supabase, channel.id, nowIso, result.error ?? 'erro desconhecido');
        await markDelivery(supabase, key, channel.id, 'failed', result.error ?? 'erro desconhecido');
      }
    }
  } catch (err) {
    // Erro inesperado do pipeline NUNCA vira 5xx — registra e responde 200.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zapp-notifications-dispatch] erro interno (registrado, sem crash): ${msg}`);
    failed++;
    errors.push(`internal: ${msg}`);
  }

  const body: Record<string, unknown> = { noop: false, dispatched, failed };
  if (dispatched === 0 && failed === 0 && dedupedCount > 0) {
    // Tudo dedupado na camada por canal → entrega no-op com marcador.
    body.noop = true;
    body.deduped = true;
  }
  if (failed > 0) body.error = errors.join('; ');
  return json(req, body);
});
