// Shared helpers for Evolution API webhook and sync functions
declare const Deno: { env: { get(key: string): string | undefined } };


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
// deno-lint-ignore no-explicit-any
export async function markEventProcessed(supabase: any, eventId: string, instance: string, eventType: string): Promise<boolean> {
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
  status_code?: number | null;
  duration_ms?: number | null;
  error_message?: string | null;
}

// deno-lint-ignore no-explicit-any
export async function auditWebhookEvent(supabase: any, row: WebhookAuditRow): Promise<void> {
  try { await supabase.from('webhook_audit_log').insert(row); } catch (e) {
    console.warn('[audit] insert failed:', (e as Error).message ?? String(e));
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
    .replace(/(:\d+)+(?=@)/g, '')
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

// deno-lint-ignore no-explicit-any
export async function getConnectionByInstance(supabase: any, instance: string): Promise<{ id: string } | null> {
  // [PATCH 2026-07-05 conn-resolver] Evolution envia payload.instance = NOME da instancia,
  // mas fluxos de criacao gravam UUID em whatsapp_connections.instance_id. Resolve por
  // instance_name (estavel) com fallback para instance_id (compat) e LOGA o miss -
  // o return silencioso aqui escondeu 2 semanas de mensagens nao espelhadas (21/06-05/07).
  const { data: byName } = await supabase
    .from('whatsapp_connections')
    .select('id')
    .eq('instance_name', instance)
    .maybeSingle();
  if (byName) return byName;
  const { data: byId } = await supabase
    .from('whatsapp_connections')
    .select('id')
    .eq('instance_id', instance)
    .maybeSingle();
  if (byId) return byId;
  console.error(`[conn-resolver] whatsapp_connections MISS instance='${instance}' - message will NOT be mirrored`);
  return null;
}
// deno-lint-ignore no-explicit-any
export async function getContactByPhone(
  supabase: any,
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
    const resp = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${instance}`, {
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

// deno-lint-ignore no-explicit-any
export async function persistProfilePicture(supabase: any, phone: string, profilePicUrl: string): Promise<string | null> {
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

// deno-lint-ignore no-explicit-any
export async function handleReactionEvent(supabase: any, instance: string, reactionMessage: Record<string, unknown>, actorFromMe: boolean) {
  const emoji = (reactionMessage.text as string) || '';
  const reactKey = reactionMessage.key as Record<string, unknown> | undefined;
  if (!reactKey?.id) return;

  const targetExternalId = reactKey.id as string;
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) { console.log(`Reaction: no connection for instance ${instance}`); return; }
  const { data: targetMessage } = await supabase
    .from('messages').select('id, contact_id').eq('external_id', targetExternalId)
    .eq('whatsapp_connection_id', connection.id).maybeSingle();
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

// ─── [RESTORE 2026-07-10] Exports perdidos em merge — dependidos por
// evolution-webhook/index.ts e evolution-webhook-handlers.ts ─────────────────

/**
 * Filtro PostgREST nome-OU-uuid para whatsapp_connections.
 * (Mesma implementação validada em connection-health-check/index.ts.)
 */
export function instanceOrFilter(instance: string): string {
  const safe = String(instance).replace(/[",()\\]/g, '');
  return `instance_name.eq."${safe}",instance_id.eq."${safe}"`;
}

export interface DeadLetterInput {
  event_type: string;
  instance?: string | null;
  payload?: unknown;
  error_message: string;
  error_stack?: string | null;
  request_id?: string | null;
}

// [FIX A-2 2026-07-12] Remove fields that must never be persisted in DLQ/audit tables.
// Evolution webhook payloads carry `apikey` (per-instance key) and `sender` (phone JID).
// Storing these in DLQ rows exposes them in dashboards, exports, and database backups.
const _SENSITIVE_DLQ_KEYS = new Set(['apikey', 'api_key', 'sender']);
function scrubSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSensitiveFields);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !_SENSITIVE_DLQ_KEYS.has(k))
        .map(([k, v]) => [k, scrubSensitiveFields(v)])
    );
  }
  return value;
}

/**
 * Roteia um evento com falha de handler para a DLQ `evolution_webhook_dlq`
 * (via camada public.*). Colunas mapeadas 1:1 ao schema evo.evolution_webhook_dlq
 * (event_type/instance_name/error_message NOT NULL — defaults defensivos).
 * Fail-safe: nunca lança — perda da DLQ não pode derrubar a resposta 200 ao
 * Evolution (evita retry-storm). request_id vai apenas para o log.
 */
// deno-lint-ignore no-explicit-any
export async function routeToDeadLetter(supabase: any, input: DeadLetterInput): Promise<void> {
  try {
    const { error } = await supabase.from('evolution_webhook_dlq').insert({
      event_type: input.event_type || 'unknown',
      instance_name: input.instance || 'unknown',
      payload: scrubSensitiveFields(input.payload ?? null),
      error_message: (input.error_message || 'unknown_error').slice(0, 2000),
      error_stack: input.error_stack ? String(input.error_stack).slice(0, 8000) : null,
      status: 'pending',
      queue_name: 'edge:evolution-webhook',
      consumer_version: 'edge-webhook:v1',
    });
    if (error) {
      console.error(`[dlq] insert failed (request_id=${input.request_id ?? '-'}): ${error.message}`);
    }
  } catch (e) {
    console.error(`[dlq] insert exception (request_id=${input.request_id ?? '-'}): ${e instanceof Error ? e.message : String(e)}`);
  }
}
