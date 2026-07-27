import { createZappAdminClient } from '../_shared/db-client.ts';
import { requireServiceRoleOrCron } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

/**
 * backfill-messages — Backfill histórico de mensagens da Evolution API para o banco.
 *
 * Pagina mensagens da Evolution API e insere no banco usando ON CONFLICT DO NOTHING.
 * Garante idempotência: pode ser executado múltiplas vezes sem duplicação.
 *
 * Body: { offset?: number, limit?: number, dryRun?: boolean }
 * Returns: { processed, inserted, skipped, errors, next_offset, done }
 */

const EVOLUTION_URL = Deno.env.get('EVOLUTION_API_URL') ?? 'https://evolution.atomicabr.com.br';
const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY');
if (!EVOLUTION_KEY) throw new Error('[backfill] EVOLUTION_API_KEY env var is required');
const INSTANCE = 'wpp2';
const CONNECTION_ID = '7296bde3-1349-44da-bad6-a017b1951303';

// messageTypes que devem ser ignorados no backfill (valores normalizados de extractMessageType)
const SKIP_TYPES = new Set(['reaction', 'sticker', 'protocolMessage', 'ephemeralMessage']);

// Normaliza phone_number: remove @s.whatsapp.net, trata grupos (retorna null para @g.us)
function extractPhone(remoteJid: string): string | null {
  if (!remoteJid) return null;
  if (remoteJid.endsWith('@g.us')) return null; // grupo — ignorar
  if (remoteJid.endsWith('@broadcast')) return null;
  return remoteJid.split('@')[0].replace(/\D/g, '').slice(-13); // máximo 13 dígitos
}

// Extrai conteúdo textual da mensagem
function extractContent(msg: Record<string, unknown>): string | null {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  if (typeof m.conversation === 'string') return m.conversation || null;
  const ext = m.extendedTextMessage as Record<string, unknown> | undefined;
  if (ext?.text && typeof ext.text === 'string') return ext.text || null;
  const img = m.imageMessage as Record<string, unknown> | undefined;
  if (img?.caption && typeof img.caption === 'string') return img.caption || null;
  const vid = m.videoMessage as Record<string, unknown> | undefined;
  if (vid?.caption && typeof vid.caption === 'string') return vid.caption || null;
  const doc = m.documentMessage as Record<string, unknown> | undefined;
  if (doc?.fileName && typeof doc.fileName === 'string') return `[Arquivo: ${doc.fileName}]`;
  if (doc?.caption && typeof doc.caption === 'string') return doc.caption || null;
  const audio = m.audioMessage as Record<string, unknown> | undefined;
  if (audio) return '[Áudio]';
  const sticker = m.stickerMessage as Record<string, unknown> | undefined;
  if (sticker) return '[Sticker]';
  const loc = m.locationMessage as Record<string, unknown> | undefined;
  if (loc) return '[Localização]';
  const contact = m.contactMessage as Record<string, unknown> | undefined;
  if (contact) return '[Contato]';
  const reaction = m.reactionMessage as Record<string, unknown> | undefined;
  if (reaction) return '[Reação]';
  return null;
}

// Determina messageType da mensagem
function extractMessageType(msg: Record<string, unknown>): string {
  const m = (msg.message ?? {}) as Record<string, unknown>;
  const keys = Object.keys(m);
  if (keys.length === 0) return 'unknown';
  // Prioridade: types mais comuns primeiro
  if (m.conversation !== undefined) return 'text';
  if (m.extendedTextMessage !== undefined) return 'extendedText';
  if (m.imageMessage !== undefined) return 'image';
  if (m.videoMessage !== undefined) return 'video';
  if (m.audioMessage !== undefined) return 'audio';
  if (m.documentMessage !== undefined) return 'document';
  if (m.stickerMessage !== undefined) return 'sticker';
  if (m.locationMessage !== undefined) return 'location';
  if (m.reactionMessage !== undefined) return 'reaction';
  if (m.contactMessage !== undefined) return 'contact';
  if (m.listMessage !== undefined) return 'list';
  if (m.buttonsMessage !== undefined) return 'buttons';
  if (m.templateMessage !== undefined) return 'template';
  return keys[0] ?? 'unknown';
}

// Converte Unix timestamp (segundos) para ISO string
function tsToIso(ts: number | string | undefined): string {
  if (!ts) return new Date().toISOString();
  const n = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (isNaN(n) || n <= 0) return new Date().toISOString();
  // Separar segundos (10 dígitos, ~1.8e9) de milissegundos (13 dígitos, ~1.8e12)
  return new Date(n < 1e10 ? n * 1000 : n).toISOString();
}

// Garante/cria contato e retorna seu UUID
async function upsertContact(
  supabase: ReturnType<typeof createZappAdminClient>,
  phone: string,
  remoteJid: string,
  pushName: string | undefined,
): Promise<string | null> {
  // Tenta buscar contato existente por phone (excluindo soft-deleted)
  const { data: existing } = await supabase
    .from('evolution_contacts')
    .select('id')
    .eq('instance_name', INSTANCE)
    .is('deleted_at', null)
    .or(`phone_number.eq.${phone},remote_jid.eq.${remoteJid}`)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  // Cria via public.contacts (proxy trigger → zapp → evo)
  const { data: created, error } = await supabase
    .schema('public' as 'zapp')
    .from('contacts')
    .insert({
      phone,
      name: pushName || phone,
      whatsapp_connection_id: CONNECTION_ID,
      instance_name: INSTANCE,
      remote_jid: remoteJid,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[backfill] upsertContact error', phone, error.message);
    return null;
  }
  return (created as { id: string }).id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });

  const body = await req.json().catch(() => ({}));
  const offset: number  = Number(body.offset ?? 0);
  const limit: number   = Math.min(Number(body.limit ?? 200), 500);
  const dryRun: boolean = body.dryRun === true;

  console.log(`[backfill] start offset=${offset} limit=${limit} dryRun=${dryRun}`);

  // 1. Buscar mensagens da Evolution API
  let evMsgs: Record<string, unknown>[] = [];
  try {
    const res = await fetch(`${EVOLUTION_URL}/chat/findMessages/${INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
      body: JSON.stringify({ where: {}, limit, offset }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return json({ error: 'evolution_api_error', status: res.status, details: txt }, 502);
    }
    const data = await res.json();
    // Evolution API pode retornar array direto ou { messages: [...] }
    evMsgs = Array.isArray(data) ? data
           : Array.isArray(data?.messages?.records) ? data.messages.records
           : Array.isArray(data?.messages) ? data.messages
           : [];
  } catch (err) {
    console.error('[backfill] evolution_fetch_failed', err);
    return json({ error: 'evolution_fetch_failed', details: 'Connection to Evolution API failed' }, 502);
  }

  console.log(`[backfill] fetched ${evMsgs.length} msgs from Evolution API`);

  if (evMsgs.length === 0) {
    return json({ processed: 0, inserted: 0, skipped: 0, errors: 0, done: true, next_offset: offset });
  }

  if (dryRun) {
    const sample = evMsgs.slice(0, 3).map(m => {
      const key = (m.key ?? {}) as Record<string, unknown>;
      return { message_id: key.id, remoteJid: key.remoteJid, fromMe: key.fromMe };
    });
    return json({ dryRun: true, count: evMsgs.length, sample, next_offset: offset + evMsgs.length });
  }

  const supabase = createZappAdminClient();

  let inserted = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const msg of evMsgs) {
    const key       = (msg.key ?? {}) as Record<string, unknown>;
    const remoteJid = (key.remoteJid ?? '') as string;
    const msgId     = (key.id ?? '') as string;
    const fromMe    = Boolean(key.fromMe);
    const pushName  = (msg.pushName ?? '') as string;
    const msgType   = extractMessageType(msg);
    const tsRaw     = msg.messageTimestamp as number | string | undefined;

    // Pular grupos
    const phone = extractPhone(remoteJid);
    if (!phone) { skipped++; continue; }

    // Pular tipos ignorados
    if (SKIP_TYPES.has(msgType)) { skipped++; continue; }

    // Pular mensagens sem ID estável (null msgId seria não-único no UNIQUE constraint)
    if (!msgId) { skipped++; continue; }

    // Garantir contato — abortar se falhar (evita orphan com contact_id=null)
    const contactId = await upsertContact(supabase, phone, remoteJid, pushName || undefined);
    if (!contactId) { errors++; continue; }

    // Inserir mensagem com ON CONFLICT DO NOTHING
    const { error: insErr } = await supabase
      .schema('evo' as 'zapp')
      .from('evolution_messages')
      .insert({
        message_id:    msgId,
        remote_jid:    remoteJid,
        from_me:       fromMe,
        direction:     fromMe ? 'outbound' : 'inbound',
        status:        fromMe ? 'sent' : 'received',
        message_type:  msgType,
        content:       extractContent(msg),
        push_name:     pushName || null,
        instance_name: INSTANCE,
        contact_id:    contactId,
        timestamp:     tsToIso(tsRaw),
        raw:           msg as unknown as Record<string, unknown>,
      })
      .select('id')
      // ON CONFLICT DO NOTHING via postgrest: ignorar erro de unique violation
      ;

    if (insErr) {
      // Código 23505 = unique_violation → já existe, não é erro real
      if ((insErr as { code?: string }).code === '23505') {
        skipped++;
      } else {
        console.error('[backfill] insert error', msgId, insErr.message);
        errors++;
      }
    } else {
      inserted++;
    }
  }

  const next_offset = offset + evMsgs.length;
  const done = evMsgs.length < limit;

  console.log(`[backfill] done: inserted=${inserted} skipped=${skipped} errors=${errors} next_offset=${next_offset}`);

  return json({
    processed: evMsgs.length,
    inserted,
    skipped,
    errors,
    next_offset,
    done,
  });
});
