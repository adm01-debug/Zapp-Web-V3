import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';
import { parseOrReject } from '../_shared/contract-kit.ts';
import { BackfillMessagesV1Schema } from '../_shared/contract-schemas.ts';

/**
 * backfill-messages — Backfill histórico de mensagens da Evolution API para o banco.
 *
 * Pagina mensagens da Evolution API e insere no banco usando ON CONFLICT DO NOTHING.
 * Garante idempotência: pode ser executado múltiplas vezes sem duplicação.
 *
 * Body: { offset?: number, limit?: number, dryRun?: boolean }
 * Returns: { processed, inserted, skipped, errors, next_offset, done }
 */

const EVOLUTION_URL = Deno.env.get('EVOLUTION_API_URL');
if (!EVOLUTION_URL) throw new Error('[backfill] EVOLUTION_API_URL env var is required');
const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY');
if (!EVOLUTION_KEY) throw new Error('[backfill] EVOLUTION_API_KEY env var is required');
const INSTANCE = Deno.env.get('BACKFILL_INSTANCE_NAME'); // optional — can be passed in body
const CONNECTION_ID = Deno.env.get('BACKFILL_CONNECTION_ID'); // optional — can be passed in body

const SKIP_TYPES = new Set(['reaction', 'sticker', 'protocolMessage', 'ephemeralMessage']);

function extractPhone(remoteJid: string): string | null {
  if (!remoteJid) return null;
  if (remoteJid.endsWith('@g.us')) return null;
  if (remoteJid.endsWith('@broadcast')) return null;
  return remoteJid.split('@')[0].replace(/\D/g, '').slice(-13);
}

function extractContent(msg: Record<string, unknown>): string | null {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  if (typeof m.conversation === 'string') return m.conversation || null;
  const ext = m.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext?.text && typeof ext.text === 'string') return ext.text || null;
  return null;
}

function extractMessageType(msg: Record<string, unknown>): string {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  const keys = Object.keys(m);
  if (keys.length === 0) return 'unknown';
  if (m.conversation !== undefined) return 'text';
  if (m.imageMessage !== undefined) return 'image';
  if (m.videoMessage !== undefined) return 'video';
  if (m.audioMessage !== undefined) return 'audio';
  if (m.documentMessage !== undefined) return 'document';
  if (m.stickerMessage !== undefined) return 'sticker';
  if (m.reactionMessage !== undefined) return 'reaction';
  return keys[0] ?? 'unknown';
}

function tsToIso(ts: number | string | undefined): string {
  if (!ts) return new Date().toISOString();
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (isNaN(n) || n <= 0) return new Date().toISOString();
  return new Date(n < 1e10 ? n * 1000 : n).toISOString();
}

async function upsertContact(supabase: ReturnType<typeof createZappAdminClient>, phone: string, remoteJid: string, pushName: string | undefined, instanceName: string, connectionId: string): Promise<string | null> {
  const { data: existing } = await supabase.from('evolution_contacts').select('id').eq('instance_name', instanceName).is('deleted_at', null).or(`phone_number.eq.${phone},remote_jid.eq.${remoteJid}`).limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabase.schema('public' as 'zapp').from('contacts').insert({ phone, name: pushName || phone, whatsapp_connection_id: connectionId, instance_name: instanceName, remote_jid: remoteJid }).select('id').single();
  if (error) { console.error('[backfill] upsertContact error', phone, error.message); return null; }
  return (created as { id: string }).id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) });
  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } });
  // Contrato backfill-messages@v1 (estrito): todos os campos opcionais (env vars têm precedência).
  const parsed = parseOrReject('backfill-messages', { v1: BackfillMessagesV1Schema }, req, await req.json().catch(() => ({})), {
    extraHeaders: getCorsHeaders(req),
  });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data as Record<string, unknown>;
  const instanceName = INSTANCE || (body.instance_name as string) || (body.instance as string);
  const connectionId = CONNECTION_ID || (body.connection_id as string);
  if (!instanceName) return json({ error: 'missing_instance_name', hint: 'Set BACKFILL_INSTANCE_NAME env var or pass instance_name in body' }, 400);
  if (!connectionId) return json({ error: 'missing_connection_id', hint: 'Set BACKFILL_CONNECTION_ID env var or pass connection_id in body' }, 400);
  const offset: number = Number(body.offset ?? 0);
  const limit: number = Math.min(Number(body.limit ?? 200), 500);
  const dryRun: boolean = body.dryRun === true;
  let evMsgs: Record<string, unknown>[] = [];
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/findMessages/${instanceName}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY }, body: JSON.stringify({ where: {}, limit, offset }) });
    if (!res.ok) return json({ error: 'upstream_error', status: res.status }, 502);
    const data = await res.json();
    evMsgs = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [];
  } catch (err) { return json({ error: 'evolution_fetch_failed' }, 502); }
  if (evMsgs.length === 0) return json({ processed: 0, inserted: 0, skipped: 0, errors: 0, done: true, next_offset: offset });
  if (dryRun) return json({ dryRun: true, count: evMsgs.length, next_offset: offset + evMsgs.length });
  const supabase = createZappAdminClient();
  let inserted = 0, skipped = 0, errors = 0;
  for (const msg of evMsgs) {
    const key = (msg.key ?? {}) as Record<string, unknown>;
    const remoteJid = (key.remoteJid ?? '') as string;
    const msgId = (key.id ?? '') as string;
    const fromMe = Boolean(key.fromMe);
    const pushName = (msg.pushName ?? '') as string;
    const msgType = extractMessageType(msg);
    const phone = extractPhone(remoteJid);
    if (!phone) { skipped++; continue; }
    if (SKIP_TYPES.has(msgType)) { skipped++; continue; }
    if (!msgId) { skipped++; continue; }
    const contactId = await upsertContact(supabase, phone, remoteJid, pushName || undefined, instanceName, connectionId);
    if (!contactId) { errors++; continue; }
    const { error: insErr } = await supabase.from('evolution_messages').insert({ message_id: msgId, remote_jid: remoteJid, from_me: fromMe, direction: fromMe ? 'outbound' : 'inbound', status: fromMe ? 'sent' : 'received', message_type: msgType, content: extractContent(msg), push_name: pushName || null, instance_name: instanceName, contact_id: contactId, timestamp: tsToIso(msg.messageTimestamp as number), raw: msg as unknown as Record<string, unknown> }).select('id');
    if (insErr) { if ((insErr as { code?: string }).code === '23505') { skipped++; } else { console.error('[backfill] insert error', msgId, insErr.message); errors++; } } else { inserted++; }
  }
  return json({ processed: evMsgs.length, inserted, skipped, errors, next_offset: offset + evMsgs.length, done: evMsgs.length < limit });
});
