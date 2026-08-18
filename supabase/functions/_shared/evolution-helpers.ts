// Shared helpers for Evolutmon API webhook and sync functions
declare const Deno: { env: { get(key: string): string | undefined } };
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getStoragePublicUrl } from "./storage-url.ts";
import { evolutionClient } from "./providers/evolution/index.ts";


/** Webhook Payload interface definition. */
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

/** is Record function. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** normalize Event Name function. */
export function normalizeEventName(event?: string): string {
  return (event || '').trim().toLowerCase().replace(/_/g, '.');
}

// Redacts phone/JID for logs: keeps country+area code, masks the rest.
// "5511998765432@s.whatsapp.net" -> "551199***"
/** redact Jid function. */
export function redactJid(jid?: string | null): string {
  if (!jid) return '';
  const raw = String(jid).split('@')[0].replace(/:\d+$/, '');
  if (raw.length <= 6) return raw.replace(/.(?=.{0})/g, '*');
  return `${raw.slice(0, 6)}***`;
}

/** generate Request Id function. */
export function generateRequestId(): string {
  try { return crypto.randomUUID(); } catch { return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
}

// SHA-256 hex of a string. Used to produce stable deduplication keys from raw webhook bodies.
/** sha256 Hex function. */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Marks an event as processed. Returns true if this is the first time (caller should process),
// false if a prior row already exists (caller should treat as duplicate). Non-unique errors are
// treated as "new" so the handler is never blocked by audit-infra failure.
// [E7 2026-08-06] Popular webhook_source ('consumer' vs 'evolution-native') e idempotency_key
// quando o caller fornecer (opts opcionais — backward compatible com todos os callers existentes).
// deno-lint-ignore no-explicit-any
/** mark Event Processed function. */
// [PATCH 23] Ledger de rejeição (evo.ingest_ledger, outcome='rejected').
// Fire-and-forget como os INSERTs 'processed' existentes (index.ts:414/432).
// Nunca lança; falha só loga. Campos null quando o descarte precede o parse.
// deno-lint-ignore no-explicit-any
/** log Ledger Rejection function. */
export function logLedgerRejection(
  supabase: any,
  opts: {
    instanceName: string;
    rejectReason: string;
    eventType?: string | null;
    messageId?: string | null;
    remoteJid?: string | null;
    messageType?: string | null;
    fromMe?: boolean | null;
    payloadSha256?: string | null;
    latencyMs?: number;
  },
): void {
  try {
    // [FIX 2026-08-17] O client do caller é schema 'zapp' (PGRST106 no PostgREST).
    // O ingest_ledger REAL é a view public (updatable, com reject_reason) — um
    // client com schema 'public' resolve o INSERT corretamente.
    const pub = createClient(
      Deno.env.get("SELFHOSTED_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "public" } },
    );
    pub.from('ingest_ledger').insert({
      instance_name: opts.instanceName,
      event_type: opts.eventType ?? null,
      message_id: opts.messageId ?? null,
      remote_jid: opts.remoteJid ?? null,
      message_type: opts.messageType ?? null,
      from_me: opts.fromMe ?? null,
      outcome: 'rejected',
      reject_reason: opts.rejectReason,
      payload_sha256: opts.payloadSha256 ?? null,
      latency_ms: opts.latencyMs ?? 0,
    }).then(() => {}, (e: unknown) =>
      console.warn('[ingest_ledger] rejected err:', e instanceof Error ? e.message : String(e)));
  } catch (e) {
    console.warn('[ingest_ledger] rejected exception:', e instanceof Error ? e.message : String(e));
  }
}

export async function markEventProcessed(
  supabase: any,
  eventId: string,
  instance: string,
  eventType: string,
  opts?: { webhookSource?: string; idempotencyKey?: string },
): Promise<boolean> {
  const { error } = await supabase.from('webhook_events_processed').insert({
    event_id: eventId, instance, event_type: eventType,
    ...(opts?.webhookSource ? { webhook_source: opts.webhookSource } : {}),
    ...(opts?.idempotencyKey ? { idempotency_key: opts.idempotencyKey } : {}),
  });
  if (!error) return true;
  if (error.code === '23505') return false;
  console.warn('[idempotency] insert failed, proceeding as new:', error.message ?? error.code);
  return true;
}

// Rolls back a prior markEventProcessed() so the event can be re-delivered and
// reprocessed later. Used ONLY on the rate-limit (429) path: idempotency is marked
// BEFORE the rate-limit check (so genuine retries don't reconsume quota), but a 429
// must NOT leave the event permanently deduped — otherwise the consumer's re-delivery
// is short-circuited as "duplicate" and the message is silently lost. Fail-safe:
// never throws; a failed rollback is logged but does not change the 429 response.
// CRITICAL: failed rollback writes to DLQ to ensure audit trail (G1 fix 2026-07-12).
// deno-lint-ignore no-explicit-any
/** unmark Event Processed function. */
export async function unmarkEventProcessed(supabase: any, eventId: string, instance?: string, eventType?: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('webhook_events_processed').delete().eq('event_id', eventId);
    if (error) {
      console.error(`[idempotency] rollback FAILED for ${eventId.slice(0, 48)}…: ${error.message ?? error.code}`);
      // [FIX-08 2026-07-12 S11] Write audit entry using SECURITY DEFINER RPC to bypass RLS
      // so operators can detect this event is permanently deduplicated
      try {
        const { error: auditError } = await supabase.rpc('fn_insert_idempotency_failure_audit', {
          p_event_id: eventId,
          p_instance: instance || null,
          p_event_type: eventType || null,
          p_error_code: error.code,
          p_error_message: error.message,
        });
        if (auditError) {
          console.error(`[idempotency] audit RPC failed: ${auditError.message ?? auditError.code}`);
        }
      } catch (e) {
        console.error(`[idempotency] failed to write audit row for rollback failure: ${e}`);
      }
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[idempotency] rollback exception for ${eventId.slice(0, 48)}…: ${e instanceof Error ? e.message : String(e)}`);
    // [FIX-08 2026-07-12 S11] Write audit entry using SECURITY DEFINER RPC
    try {
      const { error: auditError } = await supabase.rpc('fn_insert_idempotency_failure_audit', {
        p_event_id: eventId,
        p_instance: instance || null,
        p_event_type: eventType || null,
        p_error_code: 'EXCEPTION',
        p_error_message: e instanceof Error ? e.message : String(e),
      });
      if (auditError) {
        console.error(`[idempotency] audit RPC failed: ${auditError.message ?? auditError.code}`);
      }
    } catch (ex) {
      console.error(`[idempotency] failed to write audit row for exception: ${ex}`);
    }
    return false;
  }
}

// Deep-redacts producer secrets from a webhook payload before it is persisted to
// the DLQ / reprocess queue. Evolution ships `apikey` (and echoes `sender`) inside
// every webhook body; writing the raw payload to a Postgres table leaks the
// instance's admin key at rest (readable via admin dashboards, exports, backups).
// Returns a defensive deep copy with the sensitive keys stripped; the original is
// left untouched so live processing keeps whatever it needs.
//
// [FIX-12 2026-07-12 C-6] Expanded secret patterns to cover:
// - API Keys: apikey, api_key, api-key, api_secret, key, secret
// - Tokens: token, access_token, refresh_token, bearer, auth_token
// - Credentials: password, username, credential
// - Authorization: authorization, auth, x-auth-token, x-api-key
// - Personal Info: phone, email, ssn, cpf
// - Cloud/OAuth: aws_access_key, oauth_token, consumer_key
// - Pattern matching: *_secret, *_token, *_key, *_password, bearer_*, basic_*
const __SECRET_PATTERNS = [
  // API Keys
  'apikey', 'api_key', 'api-key', 'api_secret', 'key', 'secret',
  // Tokens
  'token', 'access_token', 'refresh_token', 'bearer', 'auth_token',
  // Authorization
  'authorization', 'auth', 'x-auth-token', 'x-api-key', 'x-token',
  // Credentials
  'password', 'passwd', 'pwd', 'credential', 'credentials',
  'username', 'user', 'login', 'sender',
  // Personal Info
  'phone', 'email', 'ssn', 'cpf', 'cnpj', 'credit_card', 'cc_number',
  // OAuth
  'oauth_token', 'oauth_secret', 'consumer_key', 'consumer_secret',
  // AWS
  'aws_access_key', 'aws_secret_key', 'access_key', 'secret_key',
  // Database
  'db_password', 'database_password', 'db_url', 'connection_string',
  // Webhook
  'webhook_secret', 'webhook_key', 'signature', 'hmac',
];

function isSecretKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  // Direct match
  if (__SECRET_PATTERNS.includes(lowerKey)) return true;
  // Pattern match: contains secret, token, key, password
  if (lowerKey.includes('_secret') || lowerKey.includes('_token') ||
      lowerKey.includes('_key') || lowerKey.includes('_password')) return true;
  if (lowerKey.startsWith('bearer_') || lowerKey.startsWith('basic_')) return true;
  return false;
}

/** scrub Webhook Secrets function. */
export function scrubWebhookSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubWebhookSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(k)) { out[k] = '[REDACTED]'; continue; }
    out[k] = scrubWebhookSecrets(v, depth + 1);
  }
  return out;
}

/** Webhook Audit Row interface definition. */
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
/** audit Webhook Event function. */
export async function auditWebhookEvent(supabase: any, row: WebhookAuditRow): Promise<void> {
  try { await supabase.from('webhook_audit_log').insert(row); } catch (e) {
    console.warn('[audit] insert failed:', (e as Error).message ?? String(e));
  }
}

/** to Event Records function. */
export function toEventRecords(data: unknown, collectionKeys: string[] = []): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return [];
  for (const key of collectionKeys) {
    const collection = data[key];
    if (Array.isArray(collection)) return collection.filter(isRecord);
  }
  return [data];
}

/** normalize Phone function. */
export function normalizePhone(rawJid?: string): string | null {
  if (!rawJid) return null;
  // Guarda 1: LID (WhatsApp user id de 15 dígitos) NÃO é telefone — rejeita
  // antes de qualquer strip (elimina os 34.827 fake_jids persistidos).
  if (/@lid$/i.test(rawJid.trim())) return null;
  const sanitized = rawJid
    .trim()
    .replace(/(:\d+)+(?=@)/g, '')
    .replace('@s.whatsapp.net', '')
    .replace('@g.us', '')
    .replace('@broadcast', '')
    .replace('@lid', '')
    .replace(/^\+/, '');

  const digitsOnly = sanitized.replace(/\D/g, '');
  // Sanity: PN válido tem 10–14 dígitos. 15 dígitos = comprimento de LID
  // (número puro mascarado de @s.whatsapp.net) — rejeita como PN falso.
  if (!/^\d{10,14}$/.test(digitsOnly)) return null;
  return digitsOnly;
}

/**
 * LID → PN: resolve um JID @lid (ou LID puro de 15 dígitos) para o telefone
 * canônico usando o mapa `evo.contact_identity`/`evo.lid_phone_map`
 * (PLANO-EVO-BAILEYS 2026-08, etapa 24 — downstream LID).
 * Usado pelos handlers quando normalizePhone() rejeita @lid (guarda anti-fake).
 * Nunca lança: falha de lookup retorna null (caminho antigo preservado).
 */
export async function resolveLidToPhone(
  supabase: SupabaseClient<any, any>,
  rawJid?: string | null,
): Promise<string | null> {
  if (!rawJid) return null;
  const trimmed = rawJid.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  const isLidJid = /@lid$/i.test(trimmed);
  const isBareLid = !trimmed.includes('@') && digits.length === 15;
  if (!isLidJid && !isBareLid) return null;
  const lidKey = isLidJid ? trimmed : `${digits}@lid`;
  try {
    const { data, error } = await supabase
      .from('evo_contact_identity')
      .select('pn_jid, phone_number')
      .eq('lid_jid', lidKey)
      .order('last_seen', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data?.phone_number) return data.phone_number;
    if (!error && data?.pn_jid) {
      const pn = data.pn_jid.replace('@s.whatsapp.net', '');
      if (/^\d{10,14}$/.test(pn)) return pn;
    }
    const { data: map, error: mapError } = await supabase
      .from('evo_lid_phone_map')
      .select('phone_number, phone_jid')
      .eq('lid_jid', lidKey)
      .limit(1)
      .maybeSingle();
    if (!mapError && map?.phone_number) return map.phone_number;
    if (!mapError && map?.phone_jid) {
      const pn = map.phone_jid.replace('@s.whatsapp.net', '');
      if (/^\d{10,14}$/.test(pn)) return pn;
    }
  } catch {
    /* lookup falhou — retorna null (não quebra o fluxo) */
  }
  return null;
}

/** resolve Best Jid function. */
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

/** resolve Event Jid function. */
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

/** S T A T U S_ P R I O R I T Y constant. */
export const STATUS_PRIORITY: Record<string, number> = {
  'sending': 0, 'sent': 1, 'delivered': 2, 'read': 3, 'played': 4,
  'failed': -1, 'deleted': 99, 'received': 1,
};

/** should Update Status function. */
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
/** get Connection By Instance function. */
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
/** get Contact By Phone function. */
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

/** fetch Profile Pic From Api function. */
export async function fetchProfilePicFromApi(instance: string, phone: string): Promise<string | null> {
  try {
    const resp = await evolutionClient.getProfilePicture(instance, phone, { timeoutMs: 5000 });
    if (!resp.ok) return null;
    const result = (resp.data ?? {}) as Record<string, unknown>;
    return (result?.profilePictureUrl || result?.picture || result?.url || null) as string | null;
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
/** persist Profile Picture function. */
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

    return getStoragePublicUrl('avatars', storagePath);
  } catch (err) { console.error('Avatar persist error:', err); return null; }
}

// deno-lint-ignore no-explicit-any
/** handle Reaction Event function. */
// [FIX 2026-08-09] handleReactionEvent:
//   1. Grava raw log em public.evolution_reactions (fire-and-forget, idempotente).
//   2. Aceita pushName opcional.
//   3. Decode seguro de senderTimestampMs proto3 int64 {low,high}.
//   4. CRM path (message_reactions) inalterado — zero regressão.
export async function handleReactionEvent(
  supabase: any,
  instance: string,
  reactionMessage: Record<string, unknown>,
  actorFromMe: boolean,
  pushName?: string,
) {
  const emoji = (reactionMessage.text as string) || '';
  const reactKey = reactionMessage.key as Record<string, unknown> | undefined;
  if (!reactKey?.id) return;

  const targetExternalId = reactKey.id as string;
  const rawJid = (reactKey.remoteJid as string) || '';

  // Proto3 int64 decode: {low: int32, high: int32} → milliseconds UTC
  let reactedAt: string = new Date().toISOString();
  const sts = reactionMessage.senderTimestampMs as { low?: number; high?: number } | null | undefined;
  if (sts && typeof sts.low === 'number' && typeof sts.high === 'number') {
    const lo = sts.low >>> 0;  // unsigned 32-bit
    const hi = sts.high >>> 0;
    const ms = hi * 4_294_967_296 + lo;
    // Sanity: after 2020-01-01 (1577836800000ms) and not >1 day in the future
    if (ms > 1_577_836_800_000 && ms < Date.now() + 86_400_000) {
      reactedAt = new Date(ms).toISOString();
    }
  }

  // [FIX 2026-08-11] Reações órfãs (evolution_reactions sem mensagem alvo — 110 casos):
  // se a mensagem ainda não existe (messages.upsert atrasado/perdido), criar um
  // placeholder mínimo para satisfazer a FK (message_id, instance_name) →
  // evolution_messages. Quando a mensagem real chegar, o update path existente
  // (handleIncomingMessage/handleOutgoingWhatsAppMessage) a completa.
  // Best-effort: se o placeholder falhar, a reação ainda é gravada (raw log).
  const { data: targetMsg } = await supabase
    .from('evolution_messages').select('id')
    .eq('message_id', targetExternalId).eq('instance_name', instance).maybeSingle();
  if (!targetMsg) {
    const { error: phErr } = await supabase.from('evolution_messages').upsert({
      message_id: targetExternalId,
      instance_name: instance,
      remote_jid: rawJid,
      from_me: actorFromMe,
      direction: actorFromMe ? 'outbound' : 'inbound',
      message_type: 'unknown', // vocabulário canônico: subtipo não mapeado
      status: 'received',
      created_at: reactedAt,   // aproximação (a reação é posterior à mensagem)
    }, { onConflict: 'message_id,instance_name', ignoreDuplicates: true });
    if (phErr) console.warn(`[evolution_reactions] placeholder warn ${targetExternalId}: ${phErr.message}`);
    else console.log(`[evolution_reactions] placeholder criado para mensagem ausente ${targetExternalId}`);
  }

  // [RAW LOG] Always upsert to public.evolution_reactions (fire-and-forget).
  // ON CONFLICT DO UPDATE captura mudança de emoji e remoções (emoji='').
  // UNIQUE (message_id, instance_name, remote_jid, from_me).
  supabase.from('evolution_reactions').upsert(
    {
      message_id: targetExternalId,
      instance_name: instance,
      remote_jid: rawJid,
      push_name: pushName ?? null,
      emoji,
      from_me: actorFromMe,
      reacted_at: reactedAt,
    },
    { onConflict: 'message_id,instance_name,remote_jid,from_me' },
  )
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn(`[evolution_reactions] upsert warn ${targetExternalId}: ${error.message}`);
    })
    .catch((e: unknown) => console.warn('[evolution_reactions] upsert err:', e instanceof Error ? e.message : String(e)));

  // [CRM PATH] Link to normalized message_reactions quando target encontrado em evo.
  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) { console.log(`Reaction: no connection for instance ${instance}`); return; }
  const { data: targetMessage } = await supabase
    .from('messages').select('id, contact_id').eq('external_id', targetExternalId)
    .eq('whatsapp_connection_id', connection.id).maybeSingle();
  if (!targetMessage) { console.log(`Reaction target not found in CRM: ${targetExternalId} (raw log gravado em evo.evolution_reactions)`); return; }

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

/** Dead Letter Input interface. */
export interface DeadLetterInput {
  event_type: string;
  instance?: string | null;
  payload?: unknown;
  error_message: string;
  error_stack?: string | null;
  request_id?: string | null;
}

/**
 * Roteia um evento com falha de handler para a DLQ `evolution_webhook_dlq`
 * (via views no schema zapp). Colunas mapeadas 1:1 ao schema evo.evolution_webhook_dlq
 * (event_type/instance_name/error_message NOT NULL — defaults defensivos).
 * Fail-safe: nunca lança — perda da DLQ não pode derrubar a resposta 200 ao
 * Evolution (evita retry-storm). request_id vai apenas para o log.
 */
// deno-lint-ignore no-explicit-any
/** route To Dead Letter function. */
export async function routeToDeadLetter(supabase: any, input: DeadLetterInput): Promise<void> {
  try {
    const { error } = await supabase.from('evolution_webhook_dlq').insert({
      event_type: input.event_type || 'unknown',
      instance_name: input.instance || 'unknown',
      // [A-2 2026-07-12] scrub producer secrets (apikey/sender/token) before persisting.
      payload: input.payload == null ? null : scrubWebhookSecrets(input.payload),
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
