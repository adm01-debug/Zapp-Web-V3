// Shared helpers for Evolution API webhook and sync functions
declare const Deno: { env: { get(key: string): string | undefined } };
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface WebhookPayload {
  event: string;
  instance: string;
  data: Record<string, unknown> | Record<string, unknown>[];
  destination?: string;
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeEventName(event?: string): string {
  return (event || '').trim().toLowerCase().replace(/_/g, '.');
}

// Redacts phone/JID for logs: keeps country+area code, masks the rest.
// "5511998765432@s.whatsapp.net" -> "551199***"
export function redactJid(jid?: string | null): string {
  if (!jid) return '';
  const raw = String(jid).split('@')[0].replace(/:\d+$/, '');
  if (raw.length <= 6) return raw.replace(/.(?=.{0})/g, '*');
  return `${raw.slice(0, 6)}***`;
}

export function generateRequestId(): string {
  try { return crypto.randomUUID(); } catch { return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
}

// SHA-256 hex of a string. Used to produce stable deduplication keys from raw webhook bodies.
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Marks an event as processed. Returns true if this is the first time (caller should process),
// false if a prior row already exists (caller should treat as duplicate). Non-unique errors are
// treated as "new" so the handler is never blocked by audit-infra failure.
export async function markEventProcessed(supabase: SupabaseClient, eventId: string, instance: string, eventType: string): Promise<boolean> {
  const { error } = await supabase.from('webhook_events_processed').insert({
    event_id: eventId, instance, event_type: eventType,
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.warn('[idempotency] insert failed, proceeding as new:', error.message ?? error.code);
  return true;
}

export interface WebhookAuditRow {
  request_id: string;
  instance?: string | null;
  event_type?: string | null;
  status: 'received' | 'processed' | 'duplicate' | 'error' | 'rejected';
  duration_ms?: number | null;
  error_message?: string | null;
}

export async function auditWebhookEvent(supabase: SupabaseClient, row: WebhookAuditRow): Promise<void> {
  try { await supabase.from('webhook_audit_log').insert(row); } catch (e) {
    console.warn('[audit] insert failed:', (e as Error).message ?? String(e));
  }
}

export interface DeadLetterInput {
  event_type: string;
  instance: string;
  remote_jid?: string | null;
  /** The parsed webhook payload/data so the reconcile cron can replay it. */
  payload: unknown;
  error_message: string;
  error_stack?: string | null;
  request_id?: string | null;
}

// Routes a webhook event whose handler threw into the Evolution dead-letter
// queue so it can be retried/inspected instead of being silently dropped.
//
// Context: the webhook marks an event as processed (idempotency) BEFORE the
// handler runs and returns 200 even on handler failure (so Evolution does not
// retry-storm). Without this, a handler error means permanent, unalarmed data
// loss — the exact mechanism behind the wpp2 gap during the WhatsApp LID
// migration. Landing the event in the DLQ makes the loss recoverable.
//
// Best-effort by design: a DLQ failure must NEVER bubble up and turn the
// caller's 200 into a 5xx, so everything here is swallowed-and-logged.
export async function routeToDeadLetter(supabase: SupabaseClient, input: DeadLetterInput): Promise<void> {
  try {
    const { error } = await supabase.from('evolution_webhook_dlq').insert({
      event_type: input.event_type || 'unknown',
      instance_name: input.instance || 'unknown',
      remote_jid: input.remote_jid ?? null,
      payload: (input.payload ?? {}) as Record<string, unknown>,
      error_message: (input.error_message || 'handler_error').slice(0, 2000),
      error_stack: input.error_stack ? input.error_stack.slice(0, 8000) : null,
      status: 'pending',
      retry_count: 0,
      // Stagger the first retry so a transient dependency (DB/API) has time to
      // recover before the reconcile cron picks the row up.
      next_retry_at: new Date(Date.now() + 60_000).toISOString(),
      last_request_id: input.request_id ?? null,
    });
    if (error) {
      console.warn('[dlq] insert failed:', error.message ?? error.code ?? String(error));
    }
  } catch (e) {
    console.warn('[dlq] insert threw:', (e as Error).message ?? String(e));
  }
}


export function toEventRecords(data: unknown, collectionKeys: string[] = []): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of collectionKeys) {
    const collection = data[key];
    if (Array.isArray(collection)) return collection.filter(isRecord);
  }
  return [data];
}

export function normalizePhone(rawJid?: string): string | null {
  if (!rawJid) return null;
  const sanitized = rawJid
    .trim()
    .replace(/:\d+(?=@)/g, '')
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
    .replace('@broadcast', '')
    .replace('@lid', '')
    .replace(/^\+/, '');

  const digitsOnly = sanitized.replace(/\D/g, '');
  return digitsOnly || sanitized || null;
}

export function resolveBestJid(...candidates: Array<string | null | undefined>): string | null {
  const valid = candidates
    .map((candidate) => candidate?.trim())
    .filter((candidate): candidate is string => Boolean(candidate));

  if (valid.length === 0) return null;

  return valid.find((jid) => jid.includes('@s.whatsapp.net'))
    ?? valid.find((jid) => /^\+?\d{10,15}$/.test(jid))
    ?? valid.find((jid) => jid.includes('@g.us'))
    ?? valid.find((jid) => !jid.includes('@lid'))
    ?? valid[0]
    ?? null;
}

export function resolveEventJid(...sources: unknown[]): string | null {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const directFields = [
    'remoteJid', 'remoteJidAlt', 'participant', 'participantAlt',
    'sender', 'senderAlt', 'senderJid', 'senderLid',
    'from', 'fromAlt', 'fromJid',
    'chatId', 'chatJid', 'jid', 'jidAlt',
    'author', 'authorAlt', 'user', 'userJid', 'owner', 'recipient',
  ];

  const pushCandidate = (value: unknown) => {
    if (typeof value !== 'string') return;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  const collectFields = (record: Record<string, unknown>) => {
    for (const field of directFields) pushCandidate(record[field]);
  };

  const collectSource = (source: unknown) => {
    if (typeof source === 'string') {
      pushCandidate(source);
      return;
    }

    if (!isRecord(source)) return;

    collectFields(source);

    const nestedRecords = [
      source.key,
      source.contextInfo,
      source.messageContextInfo,
      source.message,
    ];

    for (const nested of nestedRecords) {
      if (!isRecord(nested)) continue;
      collectFields(nested);

      for (const value of Object.values(nested)) {
        if (!isRecord(value)) continue;
        collectFields(value);
        if (isRecord(value.contextInfo)) collectFields(value.contextInfo);
        if (isRecord(value.messageContextInfo)) collectFields(value.messageContextInfo);
        if (isRecord(value.message)) collectFields(value.message);
      }
    }
  };

  for (const source of sources) collectSource(source);

  return resolveBestJid(...candidates);
}

export const STATUS_PRIORITY: Record<string, number> = {
  'sending': 0, 'sent': 1, 'delivered': 2, 'read': 3, 'played': 4,
  'failed': -1, 'deleted': 99, 'received': 1,
};

export function shouldUpdateStatus(currentStatus: string | null, newStatus: string): boolean {
  if (!currentStatus) return true;
  const currentPriority = STATUS_PRIORITY[currentStatus] ?? 0;
  if (newStatus === 'deleted') return true;
  // Allow 'failed' only if the message has not yet reached 'delivered' or beyond,
  // preventing stale error ACKs from downgrading already-confirmed messages.
  if (newStatus === 'failed') return currentPriority < STATUS_PRIORITY['delivered'];
  const newPriority = STATUS_PRIORITY[newStatus] ?? 0;
  return newPriority > currentPriority;
}

/**
 * Filtro PostgREST que casa uma conexão tanto pelo NOME roteável quanto pelo
 * UUID interno da Evolution. Eventos de webhook chegam com o nome da instância,
 * mas `whatsapp_connections.instance_id` guardava o nome em linhas legadas e o
 * UUID nas novas (incidente wpp2 2026-07-04) — `instance_name` é a fonte da
 * verdade e `instance_id` fica como fallback legado. Sanitiza o valor porque
 * vírgula/parênteses/aspas são sintaxe do `.or()` do PostgREST.
 */
export function instanceOrFilter(instance: string): string {
  const safe = String(instance).replace(/[",()\\]/g, '');
  return `instance_name.eq."${safe}",instance_id.eq."${safe}"`;
}

export async function getConnectionByInstance(supabase: SupabaseClient, instance: string): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('whatsapp_connections')
    .select('id')
    .or(instanceOrFilter(instance))
    .maybeSingle();
  return data;
}

export async function getContactByPhone(
  supabase: SupabaseClient,
  phone: string,
  connectionId: string
): Promise<{ id: string; avatar_url: string | null; assigned_to: string | null; name: string | null } | null> {
  const phonesVariants = generatePhoneVariants(phone);
  const { data } = await supabase
    .from('contacts')
    .select('id, avatar_url, assigned_to, name')
    .in('phone', phonesVariants)
    .eq('whatsapp_connection_id', connectionId)
    .limit(1)
    .maybeSingle();
  
  return data;
}

/**
 * Generate phone number variants to handle Brazilian 9th digit discrepancy.
 * WhatsApp/Evolution may use numbers with or without the 9th digit for mobile numbers.
 * E.g., 5564984450900 (with 9) vs 556484450900 (without 9)
 */
export function generatePhoneVariants(phone: string): string[] {
  const clean = phone.replace(/\D/g, '').replace(/^\+/, '');
  const variants = new Set<string>([clean]);
  if (clean) variants.add(`+${clean}`);
  
  // Brazilian number handling (country code 55)
  if (clean.startsWith('55') && clean.length >= 12) {
    const ddd = clean.substring(2, 4);
    const rest = clean.substring(4);
    
    // If has 9th digit (9 digits after DDD = total 13 with country code)
    if (clean.length === 13 && rest.startsWith('9')) {
      // Add variant WITHOUT 9th digit
      const without9 = `55${ddd}${rest.substring(1)}`;
      variants.add(without9);
    }
    
    // If missing 9th digit (8 digits after DDD = total 12 with country code)
    if (clean.length === 12 && !rest.startsWith('9')) {
      // Add variant WITH 9th digit
      const with9 = `55${ddd}9${rest}`;
      variants.add(with9);
    }
  }
  
  return [...variants];
}

export async function fetchProfilePicFromApi(instance: string, phone: string): Promise<string | null> {
  try {
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionUrl || !evolutionKey) return null;
    const baseUrl = evolutionUrl.replace(/\/+$/, '');
    const resp = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const result = await resp.json();
    return result?.profilePictureUrl || result?.picture || result?.url || null;
  } catch { return null; }
}

function isSafeProfilePicUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    const allowed = ['pps.whatsapp.net', 'mmg.whatsapp.net', 'media.whatsapp.net'];
    return allowed.some(h => hostname === h || hostname.endsWith('.' + h));
  } catch { return false; }
}

export async function persistProfilePicture(supabase: SupabaseClient, phone: string, profilePicUrl: string): Promise<string | null> {
  if (!isSafeProfilePicUrl(profilePicUrl)) return null;
  try {
    const response = await fetch(profilePicUrl, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const blob = await response.arrayBuffer();
    const bytes = new Uint8Array(blob);
    if (bytes.length < 100) return null;

    const fileName = `${phone}_${Date.now()}.jpg`;
    const storagePath = `avatars/${fileName}`;

    const { data: oldFiles } = await supabase.storage.from('avatars').list('avatars', { search: phone });
    if (oldFiles?.length) {
      await supabase.storage.from('avatars').remove(oldFiles.map((f: { name: string }) => `avatars/${f.name}`));
    }

    const { error } = await supabase.storage.from('avatars').upload(storagePath, bytes, {
      contentType: 'image/jpeg', cacheControl: '604800', upsert: true,
    });
    if (error) { console.error('Avatar upload error:', error); return null; }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(storagePath);
    return urlData.publicUrl;
  } catch (err) { console.error('Avatar persist error:', err); return null; }
}

export async function handleReactionEvent(supabase: SupabaseClient, instance: string, reactionMessage: Record<string, unknown>, actorFromMe: boolean) {
  const emoji = (reactionMessage.text as string) || '';
  const reactKey = reactionMessage.key as Record<string, unknown> | undefined;
  if (!reactKey?.id) return;

  const targetExternalId = reactKey.id as string;
  const { data: targetMessage } = await supabase.schema('evo')
    .from('evolution_messages').select('id, contact_id').eq('message_id', targetExternalId)
    .eq('instance_name', instance).maybeSingle();
  if (!targetMessage) { console.log(`Reaction target not found: ${targetExternalId}`); return; }

  if (emoji === '') {
    if (!actorFromMe) {
      await supabase.from('message_reactions').delete()
        .eq('message_id', targetMessage.id).eq('contact_id', targetMessage.contact_id);
      await supabase.from('messages').update({ updated_at: new Date().toISOString() }).eq('id', targetMessage.id);
      console.log(`Reaction removed on message ${targetExternalId}`);
    }
  } else if (!actorFromMe) {
    const { error: upsertErr } = await supabase.from('message_reactions').upsert(
      { message_id: targetMessage.id, contact_id: targetMessage.contact_id, emoji },
      { onConflict: 'message_id,contact_id,emoji' }
    );
    if (upsertErr) { console.error('Error upserting reaction:', upsertErr); }
    else {
      await supabase.from('messages').update({ updated_at: new Date().toISOString() }).eq('id', targetMessage.id);
      console.log(`Reaction synced: ${emoji} on message ${targetExternalId}`);
    }
  }
}
