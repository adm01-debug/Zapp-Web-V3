// ============================================================================
// whatsapp-cloud-normalizer.ts — v2 (W3 do decouple-audit)
// ----------------------------------------------------------------------------
// Normaliza webhooks da WhatsApp Cloud API (Meta) para o modelo canônico ZAPP
// (domain/messaging.ts — CanonicalMessage/CanonicalMessageType).
//
// Mudanças v2 vs v1 (248 linhas):
//   1. Cobertura dos 16 tipos Meta → CanonicalMessageType (tabela abaixo);
//      v1 mapeava 10 e destruía button/order/system/request_welcome/ephemeral.
//   2. FIX timestamp: aceita epoch segundos E ISO 8601 (regex \d{4}- detecta
//      ISO → Date.parse; senão parseInt) — nunca 1970 (v1: parseInt parcial
//      de ISO virava epoch 1970).
//   3. FIX entry/messages com null no array: skip defensivo, sem crash.
//   4. Mídia (image/audio/video/document/sticker): media_id, mime_type,
//      sha256, filename, caption → campos media_*; mediaUrl fica null
//      (download é responsabilidade de outro módulo).
//   5. Grupo: context.group_id + from terminando @g.us → remoteJid com
//      @g.us (sem o JID duplo "...@g.us@s.whatsapp.net" da v1) + groupId.
//   6. Quote: context.id → quotedId (quoted_message_id).
//   7. Reaction: content = emoji, reactionTargetId = message_id.
//   8. View-once: viewOnce a partir de media.view_once.
//   9. Erro estruturado: errors[0] → error { code, title } (statuses).
//  10. Statuses: NormalizedStatus mantido (id, timestamp, status
//      sent/delivered/read/failed) + error estruturado.
//  11. Defensivo: entradas null/undefined nunca crasham; mensagem inválida
//      → normalizeMetaMessage retorna null (skip); payload inválido → events [].
//  12. messageType mapeado via META_TO_CANONICAL (domain) + extensão v2 →
//      CanonicalMessageType (12 valores canônicos — drift 'contacts'/
//      'unsupported' da v1 eliminado).
//
// Export preservado: normalizeMetaPayload(payload) → { events, phoneNumberId?,
// validationError? } — mesma assinatura da v1 (quem importa não quebra).
// validateMetaSignature também preservado.
//
// Tabela de cobertura (16 tipos Meta):
//   text            → text
//   image           → image
//   audio           → audio
//   video           → video
//   document        → document
//   location        → location
//   contacts        → contact
//   reaction        → reaction
//   sticker         → sticker
//   button (legacy) → interactive
//   interactive     → interactive
//   order           → unknown
//   system          → unknown
//   request_welcome → unknown
//   ephemeral       → unknown
//   unknown         → unknown
//   (template — extra, já em META_TO_CANONICAL → template)
// ============================================================================

import { z } from "https://esm.sh/zod@3.23.8";
import { MetaWebhookPayloadSchema } from "./webhook-schemas.ts";
import {
  META_TO_CANONICAL,
  type CanonicalMessageType,
  type ChannelAddress,
  type ChannelAccount,
} from "./domain/messaging.ts";

// ─── Tipos normalizados (retrocompat com a v1 + campos canônicos) ──────────

/** Normalized Incoming interface definition. */
export interface NormalizedIncoming {
  kind: 'message';
  // ── CanonicalMessage (E45 domain/messaging.ts) ──
  id: string;
  from: ChannelAddress;
  account: ChannelAccount;
  direction: 'inbound' | 'outbound';
  type: CanonicalMessageType;
  content: string;
  timestamp: number;          // unix seconds (nunca 1970)
  pushName?: string;
  // ── Mídia (download em módulo separado → mediaUrl null por enquanto) ──
  mediaId?: string;
  mediaMimeType?: string;
  mediaSha256?: string;
  mediaFilename?: string;
  mediaCaption?: string;
  mediaUrl?: string | null;
  // ── Reação / quote / grupo / view-once / erro ──
  reactionEmoji?: string;
  reactionTargetId?: string;
  quotedId?: string;
  groupId?: string;
  viewOnce?: boolean;
  error?: { code: number; title: string };
  // ── Legado v1 (testes e parity esperam esses campos) ──
  wamid: string;
  fromPhone: string;          // E.164 sem +
  remoteJid: string;          // <phone>@s.whatsapp.net | <group>@g.us
  messageType: CanonicalMessageType;
  metadata?: Record<string, unknown>;
}

/** Normalized Status interface definition. */
export interface NormalizedStatus {
  kind: 'status';
  id: string;
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: number;
  errorMessage?: string;
  error?: { code: number; title: string };
  recipientPhone?: string;
}

/** Normalized Event type alias. */
export type NormalizedEvent = NormalizedIncoming | NormalizedStatus;

// ─── Tabela de mapeamento Meta → canônico (16 + template) ──────────────────

/**
 * Meta message type → CanonicalMessageType.
 * Reaproveita META_TO_CANONICAL do domínio (11 entradas) e completa com os
 * tipos que a v1 destruía. Todos os 12 valores de CanonicalMessageType são
 * alcançáveis.
 */
export const META_TO_CANONICAL_V2: Readonly<Record<string, CanonicalMessageType>> = {
  ...META_TO_CANONICAL,
  button: 'interactive',
  order: 'unknown',
  system: 'unknown',
  request_welcome: 'unknown',
  ephemeral: 'unknown',
  unknown: 'unknown',
};

// ─── Tipos Meta (payload bruto) ─────────────────────────────────────────────

interface MetaMedia {
  id?: string;
  mime_type?: string;
  sha256?: string;
  view_once?: boolean;
}

interface MetaMessage {
  id?: unknown;
  from?: unknown;
  timestamp?: unknown;
  type?: unknown;
  text?: { body?: string };
  image?: MetaMedia & { caption?: string };
  audio?: MetaMedia & { voice?: boolean };
  video?: MetaMedia & { caption?: string };
  document?: MetaMedia & { filename?: string; caption?: string };
  sticker?: MetaMedia & { animated?: boolean };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: unknown;
  reaction?: { message_id?: string; emoji?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
    nfm_reply?: { response_json?: string };
  };
  order?: { catalog_id?: string; product_items?: unknown[] };
  system?: { body?: string };
  template?: { name?: string; language?: unknown; components?: unknown[] };
  ephemeral?: unknown;
  context?: { id?: string; group_id?: string; forwarded?: boolean };
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface MetaStatus {
  id?: unknown;
  status?: unknown;
  timestamp?: unknown;
  recipient_id?: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface MetaChangeValue {
  messaging_product?: unknown;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: unknown[];
  statuses?: unknown[];
}

const META_STATUSES: ReadonlySet<string> = new Set(['sent', 'delivered', 'read', 'failed']);

// ─── Timestamp seguro (epoch segundos OU ISO 8601 — nunca 1970) ─────────────

/**
 * Converte timestamp da Meta para epoch segundos.
 * - ISO 8601 (detectado por /^\d{4}-\d{2}/) → Date.parse → epoch segundos.
 * - Número ou string numérica → parseInt (aceita ms > 1e12 → /1000).
 * - Inválido/vazio/<=0 → fallback "now" (nunca retorna 1970/0).
 */
export function safeTimestamp(raw: unknown, fallbackNow = true): number {
  const now = (): number => Math.floor(Date.now() / 1000);
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return fallbackNow ? now() : 0;
    return raw > 1e12 ? Math.floor(raw / 1000) : Math.floor(raw);
  }
  if (typeof raw !== 'string') return fallbackNow ? now() : 0;
  const s = raw.trim();
  if (s === '') return fallbackNow ? now() : 0;
  // ISO 8601: "2026-08-14T10:00:00Z" — 4 dígitos + hífen.
  if (/^\d{4}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t) && t > 0) return Math.floor(t / 1000);
    return fallbackNow ? now() : 0;
  }
  const n = parseInt(s, 10);
  if (Number.isNaN(n) || n <= 0) return fallbackNow ? now() : 0;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}

// ─── Normalização por mensagem (defensiva — null para entrada inválida) ────

function normalizeMetaMessage(
  raw: unknown,
  pushName: string | undefined,
  accountId: string | undefined,
): NormalizedIncoming | null {
  // (11) entradas null/undefined/{} nunca crasham.
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  const m = raw as MetaMessage;
  if (typeof m.id !== 'string' || m.id.length === 0) return null;
  if (typeof m.from !== 'string' || m.from.length === 0) return null;

  const rawType = typeof m.type === 'string' && m.type.length > 0 ? m.type : 'unknown';
  const messageType: CanonicalMessageType = META_TO_CANONICAL_V2[rawType] ?? 'unknown';

  // (5) grupo + (6) quote: context.group_id + from @g.us → JID de grupo real
  // (nunca "...@g.us@s.whatsapp.net"); context.id → quotedId.
  const context = m.context;
  const isGroup = m.from.endsWith('@g.us');
  const remoteJid = isGroup ? m.from : `${m.from}@s.whatsapp.net`;
  const groupId = isGroup ? (context?.group_id ?? m.from) : context?.group_id;
  const quotedId = context?.id;

  const timestamp = safeTimestamp(m.timestamp);

  let content = '';
  let mediaId: string | undefined;
  let mediaMimeType: string | undefined;
  let mediaSha256: string | undefined;
  let mediaFilename: string | undefined;
  let mediaCaption: string | undefined;
  let reactionEmoji: string | undefined;
  let reactionTargetId: string | undefined;
  let viewOnce: boolean | undefined;
  const metadata: Record<string, unknown> = { source: 'whatsapp_cloud_api', raw_type: rawType };

  switch (rawType) {
    case 'text':
      content = m.text?.body ?? '';
      break;
    case 'image': {
      const media = m.image;
      mediaId = media?.id;
      mediaMimeType = media?.mime_type;
      mediaSha256 = media?.sha256;
      mediaCaption = media?.caption;
      content = media?.caption ?? '';
      viewOnce = media?.view_once;
      break;
    }
    case 'audio': {
      const media = m.audio;
      mediaId = media?.id;
      mediaMimeType = media?.mime_type;
      mediaSha256 = media?.sha256;
      metadata.voice = media?.voice ?? false;
      viewOnce = media?.view_once;
      break;
    }
    case 'video': {
      const media = m.video;
      mediaId = media?.id;
      mediaMimeType = media?.mime_type;
      mediaSha256 = media?.sha256;
      mediaCaption = media?.caption;
      content = media?.caption ?? '';
      viewOnce = media?.view_once;
      break;
    }
    case 'document': {
      const media = m.document;
      mediaId = media?.id;
      mediaMimeType = media?.mime_type;
      mediaSha256 = media?.sha256;
      mediaFilename = media?.filename;
      mediaCaption = media?.caption;
      content = media?.caption ?? media?.filename ?? '';
      break;
    }
    case 'sticker': {
      const media = m.sticker;
      mediaId = media?.id;
      mediaMimeType = media?.mime_type;
      mediaSha256 = media?.sha256;
      metadata.animated = media?.animated ?? false;
      break;
    }
    case 'location': {
      const loc = m.location;
      content = loc ? (loc.name || loc.address || `${loc.latitude},${loc.longitude}`) : '';
      metadata.location = loc ?? undefined;
      break;
    }
    case 'contacts': {
      const list = Array.isArray(m.contacts) ? m.contacts : [];
      const first = list[0] as { name?: { formatted_name?: string } } | undefined;
      content = first?.name?.formatted_name ?? '';
      metadata.contacts = list;
      break;
    }
    case 'reaction': {
      reactionEmoji = m.reaction?.emoji;
      reactionTargetId = m.reaction?.message_id;
      content = reactionEmoji ?? '';
      break;
    }
    case 'button': {
      // Botão legado → interactive no canônico.
      content = m.button?.text ?? '';
      metadata.button = m.button;
      break;
    }
    case 'interactive': {
      content = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
      metadata.interactive = m.interactive;
      break;
    }
    case 'order': {
      metadata.order = m.order;
      break;
    }
    case 'system': {
      content = m.system?.body ?? '';
      metadata.system = m.system;
      break;
    }
    case 'template': {
      content = m.template?.name ?? '';
      metadata.template = m.template;
      break;
    }
    case 'request_welcome':
    case 'ephemeral':
    case 'unknown':
    default:
      // request_welcome / ephemeral / tipos desconhecidos → 'unknown' (tabela).
      if (rawType === 'ephemeral') metadata.ephemeral = m.ephemeral;
      break;
  }

  // (9) erro estruturado (messages não carregam errors na Meta, mas preservar
  // caso apareça — simétrico aos statuses).
  const err = Array.isArray(m.errors) ? m.errors[0] : undefined;

  const from: ChannelAddress = { channel: 'whatsapp', address: remoteJid };
  const account: ChannelAccount = {
    id: accountId ?? '',
    provider: 'cloud',
    externalRef: accountId ?? '',
  };

  return {
    kind: 'message',
    // canônico
    id: m.id,
    from,
    account,
    direction: 'inbound',
    type: messageType,
    content,
    timestamp,
    pushName,
    // mídia
    mediaId,
    mediaMimeType,
    mediaSha256,
    mediaFilename,
    mediaCaption,
    mediaUrl: mediaId ? null : undefined,
    // reação / quote / grupo / view-once / erro
    reactionEmoji,
    reactionTargetId,
    quotedId,
    groupId,
    viewOnce,
    error: err ? { code: err.code, title: err.title } : undefined,
    // legado v1
    wamid: m.id,
    fromPhone: m.from,
    remoteJid,
    messageType,
    metadata,
  };
}

// ─── Normalização por status (defensiva — null para entrada inválida) ───────

function normalizeMetaStatus(raw: unknown): NormalizedStatus | null {
  if (raw === null || raw === undefined || typeof raw !== 'object') return null;
  const s = raw as MetaStatus;
  if (typeof s.id !== 'string' || s.id.length === 0) return null;

  const rawStatus = typeof s.status === 'string' ? s.status : '';
  const known = META_STATUSES.has(rawStatus);
  const status: NormalizedStatus['status'] = known ? rawStatus as NormalizedStatus['status'] : 'failed';
  const err = Array.isArray(s.errors) ? s.errors[0] : undefined;

  return {
    kind: 'status',
    id: s.id,
    wamid: s.id,
    status,
    timestamp: safeTimestamp(s.timestamp),
    errorMessage: err?.message ?? err?.title ??
      (rawStatus !== '' && !known ? `unknown status '${rawStatus}'` : undefined),
    error: err ? { code: err.code, title: err.title } : undefined,
    recipientPhone: s.recipient_id,
  };
}

// ─── Walk defensivo do envelope ─────────────────────────────────────────────

/**
 * Percorre o envelope Meta sem depender do zod (que rejeita entry com null).
 * Entry null/undefined → skip; change/value null → skip; message/status
 * inválidos → normalize* retorna null → skip.
 */
function walkMetaPayload(
  payload: unknown,
  events: NormalizedEvent[],
  onPhoneNumberId: (id: string) => void,
): void {
  if (payload === null || payload === undefined || typeof payload !== 'object') return;
  const root = payload as { entry?: unknown };
  if (!Array.isArray(root.entry)) return;

  for (const entry of root.entry) {
    // (3) FIX: entry null no array → pular, não crashar.
    if (entry === null || entry === undefined || typeof entry !== 'object') continue;
    const changes = (entry as { changes?: unknown }).changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      if (change === null || change === undefined || typeof change !== 'object') continue;
      const value = (change as { value?: unknown }).value;
      if (value === null || value === undefined || typeof value !== 'object') continue;
      const v = value as MetaChangeValue;

      if (v.metadata?.phone_number_id) onPhoneNumberId(v.metadata.phone_number_id);

      const contactName = v.contacts?.[0]?.profile?.name || undefined;

      if (Array.isArray(v.messages)) {
        for (const m of v.messages) {
          const msg = normalizeMetaMessage(m, contactName, v.metadata?.phone_number_id);
          if (msg) events.push(msg);
        }
      }

      if (Array.isArray(v.statuses)) {
        for (const st of v.statuses) {
          const status = normalizeMetaStatus(st);
          if (status) events.push(status);
        }
      }
    }
  }
}

// ─── API pública (assinatura preservada da v1) ──────────────────────────────

/**
 * Normaliza um payload de webhook da WhatsApp Cloud API (Meta) em eventos
 * canônicos. Assinatura idêntica à v1: { events, phoneNumberId?, validationError? }.
 * - Payload inválido/null/undefined → events [] (nunca throw).
 * - validationError presente quando o envelope falha no zod (informativo —
 *   o walk continua processando entries válidas mesmo assim).
 */
export function normalizeMetaPayload(payload: unknown): {
  events: NormalizedEvent[];
  phoneNumberId?: string;
  validationError?: z.ZodError;
} {
  const events: NormalizedEvent[] = [];
  let phoneNumberId: string | undefined;

  const parsed = MetaWebhookPayloadSchema.safeParse(payload);
  const validationError = parsed.success ? undefined : parsed.error;

  walkMetaPayload(payload, events, (id) => {
    phoneNumberId = id;
  });

  if (validationError) return { events, phoneNumberId, validationError };
  return { events, phoneNumberId };
}

// ─── Assinatura HMAC (preservada da v1) ─────────────────────────────────────

/**
 * Validates Meta webhook signature (X-Hub-Signature-256).
 * Returns true if the signature is valid. Rejects (returns false) when appSecret is empty.
 */
export async function validateMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret) {
    console.error('[meta-webhook] WHATSAPP_APP_SECRET not configured — rejecting all requests');
    return false;
  }
  if (!signatureHeader) return false;
  const expected = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time compare
  if (hex.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
