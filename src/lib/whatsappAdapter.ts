/**
 * Serviço único de abstração WhatsApp.
 *
 * Toda parte do app que precisa enviar mensagens, mídia, reações ou consultar
 * presença/status DEVE passar por este adapter. Ele inspeciona o modo ativo
 * do workspace (`getWhatsAppMode`) e roteia para a edge function correta:
 *
 *   - `unofficial` → `evolution-api`        (proxy Evolution / Baileys)
 *   - `official`   → `whatsapp-cloud-send`  (Graph API da Meta)
 *
 * Webhooks de **entrada** seguem a mesma divisão: `getActiveWebhookUrl()`
 * devolve a URL que deve estar configurada no provedor para o modo atual.
 *
 * Decisões importantes:
 *  - Cache de modo de 30s para evitar round-trip por chamada.
 *  - Sticker, reação e localização caem em fallback de texto no modo Cloud
 *    quando a Graph API ainda não suporta o tipo no template/janela 24h —
 *    o serviço relata claramente em `error` em vez de quebrar silenciosamente.
 *  - Templates só existem no modo oficial; chamada no modo Evolution lança
 *    erro explícito para o caller orientar o usuário.
 */
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';
import { toPhone } from '@/lib/jid';

const log = getLogger('whatsappAdapter');

export type WhatsAppMode = 'official' | 'unofficial';

let cachedMode: WhatsAppMode | null = null;
let cacheExpiresAt = 0;

export async function getWhatsAppMode(force = false): Promise<WhatsAppMode> {
  const now = Date.now();
  if (!force && cachedMode && now < cacheExpiresAt) return cachedMode;
  try {
    const { data, error } = await safeClient.rpc<string>('rpc_get_whatsapp_mode');
    if (error) throw error;
    const mode = (data as string) === 'official' ? 'official' : 'unofficial';
    cachedMode = mode;
    cacheExpiresAt = now + 30_000;
    return mode;
  } catch (e) {
    log.warn('getWhatsAppMode fallback', { error: e instanceof Error ? e.message : String(e) });
    return 'unofficial';
  }
}

export function invalidateWhatsAppModeCache() {
  cachedMode = null;
  cacheExpiresAt = 0;
  cachedTransport = null;
  transportExpiresAt = 0;
  cloudCredsCache = null;
}

const DEFAULT_INSTANCE = 'wpp2';

export type WhatsAppTransport = 'cloud' | 'evolution';

export interface ResolvedTransport {
  transport: WhatsAppTransport;
  requestedMode: WhatsAppMode;
  /** True quando o admin pediu official mas caímos para evolution por falta de secrets. */
  degraded: boolean;
  reason?: string;
  missingSecrets?: string[];
}

interface CloudSecretsStatus {
  secrets: { name: string; configured: boolean; length: number }[];
}

const REQUIRED_CLOUD_SECRETS = ['WHATSAPP_CLOUD_PHONE_NUMBER_ID', 'WHATSAPP_CLOUD_ACCESS_TOKEN'];

let cachedTransport: ResolvedTransport | null = null;
let transportExpiresAt = 0;
let cloudCredsCache: { ok: boolean; missing: string[]; expiresAt: number } | null = null;

async function checkCloudCredentials(): Promise<{ ok: boolean; missing: string[] }> {
  const now = Date.now();
  if (cloudCredsCache && now < cloudCredsCache.expiresAt) {
    return { ok: cloudCredsCache.ok, missing: cloudCredsCache.missing };
  }
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-cloud-secrets-status');
    if (error) throw error;
    const list = (data as CloudSecretsStatus)?.secrets ?? [];
    const byName = new Map(list.map((s) => [s.name, s.configured]));
    const missing = REQUIRED_CLOUD_SECRETS.filter((n) => !byName.get(n));
    const result = { ok: missing.length === 0, missing };
    cloudCredsCache = { ...result, expiresAt: now + 30_000 };
    return result;
  } catch (e) {
    log.warn('checkCloudCredentials fallback', {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, missing: REQUIRED_CLOUD_SECRETS };
  }
}

/**
 * Resolve o transporte a usar AGORA, combinando o modo escolhido pelo admin
 * com a disponibilidade real das credenciais. Cache de 30s.
 */
export async function resolveTransport(force = false): Promise<ResolvedTransport> {
  const now = Date.now();
  if (!force && cachedTransport && now < transportExpiresAt) return cachedTransport;

  const requestedMode = await getWhatsAppMode(force);

  if (requestedMode === 'unofficial') {
    const resolved: ResolvedTransport = { transport: 'evolution', requestedMode, degraded: false };
    cachedTransport = resolved;
    transportExpiresAt = now + 30_000;
    return resolved;
  }

  const creds = await checkCloudCredentials();
  const resolved: ResolvedTransport = creds.ok
    ? { transport: 'cloud', requestedMode, degraded: false }
    : {
        transport: 'evolution',
        requestedMode,
        degraded: true,
        reason: `Modo oficial selecionado mas faltam secrets: ${creds.missing.join(', ')}. Usando Evolution como fallback.`,
        missingSecrets: creds.missing,
      };
  if (resolved.degraded) {
    log.warn('transport degraded', {
      reason: resolved.reason,
      missingSecrets: resolved.missingSecrets,
    });
  }

  cachedTransport = resolved;
  transportExpiresAt = now + 30_000;
  return resolved;
}

export function invalidateTransportCache() {
  cachedTransport = null;
  transportExpiresAt = 0;
  cloudCredsCache = null;
}

// ----- Tipos ----------------------------------------------------------------

export interface SendTextParams {
  remoteJid: string;
  text: string;
  instance?: string;
  quotedMessageId?: string;
  mentions?: string[];
}

export interface SendMediaParams {
  remoteJid: string;
  mediaUrl: string;
  type: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  filename?: string;
  mimetype?: string;
  instance?: string;
}

export interface SendAudioParams {
  remoteJid: string;
  audioUrl: string;
  instance?: string;
  ptt?: boolean;
}

export interface SendStickerParams {
  remoteJid: string;
  stickerUrl: string;
  instance?: string;
}

export interface SendReactionParams {
  remoteJid: string;
  messageId: string;
  reaction: string;
  fromMe?: boolean;
  instance?: string;
}

export interface SendLocationParams {
  remoteJid: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  instance?: string;
}

export interface SendContactParams {
  remoteJid: string;
  fullName: string;
  phone: string;
  instance?: string;
}

export interface SendTemplateParams {
  remoteJid: string;
  name: string;
  language?: string;
  components?: any[];
}

export interface PresenceParams {
  remoteJid: string;
  presence: 'composing' | 'paused' | 'recording' | 'available' | 'unavailable';
  instance?: string;
}

export interface MarkAsReadParams {
  remoteJid: string;
  messageIds: string[];
  instance?: string;
}

// ----- Helpers --------------------------------------------------------------

async function invokeCloud(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('whatsapp-cloud-send', { body });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(((data as Record<string, unknown>).error as string | undefined) ?? 'cloud_send_failed');
  }
  return data;
}

async function invokeEvolution(action: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('evolution-api', {
    body: { action, ...body },
  });
  if (error) throw error;
  return data;
}

// ----- Envios ---------------------------------------------------------------

export async function sendText(params: SendTextParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'text',
      text: params.text,
    });
  }
  return invokeEvolution('send-text', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    text: params.text,
    quoted: params.quotedMessageId ? { key: { id: params.quotedMessageId } } : undefined,
    mentioned: params.mentions,
  });
}

export async function sendMedia(params: SendMediaParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: params.type,
      mediaUrl: params.mediaUrl,
      caption: params.caption,
      filename: params.filename,
    });
  }
  return invokeEvolution('send-media', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    mediaUrl: params.mediaUrl,
    mediaType: params.type,
    mimetype: params.mimetype,
    caption: params.caption,
    fileName: params.filename,
  });
}

export async function sendAudio(params: SendAudioParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'audio',
      mediaUrl: params.audioUrl,
    });
  }
  return invokeEvolution('send-audio', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    audio: params.audioUrl,
    ptt: params.ptt ?? true,
  });
}

export async function sendSticker(params: SendStickerParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'sticker',
      mediaUrl: params.stickerUrl,
    });
  }
  return invokeEvolution('send-sticker', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    sticker: params.stickerUrl,
  });
}

export async function sendReaction(params: SendReactionParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'reaction',
      messageId: params.messageId,
      emoji: params.reaction,
    });
  }
  return invokeEvolution('send-reaction', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    key: {
      remoteJid: params.remoteJid,
      id: params.messageId,
      fromMe: params.fromMe ?? true,
    },
    reaction: params.reaction,
  });
}

export async function sendLocation(params: SendLocationParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'location',
      latitude: params.latitude,
      longitude: params.longitude,
      name: params.name,
      address: params.address,
    });
  }
  return invokeEvolution('send-location', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    latitude: params.latitude,
    longitude: params.longitude,
    locationName: params.name,
    locationAddress: params.address,
  });
}

export async function sendContact(params: SendContactParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'contacts',
      contacts: [{ name: { formatted_name: params.fullName }, phones: [{ phone: params.phone }] }],
    });
  }
  return invokeEvolution('send-contact', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    contact: [{ fullName: params.fullName, phoneNumber: params.phone }],
  });
}

export async function sendTemplate(params: SendTemplateParams) {
  const { transport, degraded, reason } = await resolveTransport();
  if (transport !== 'cloud') {
    throw new Error(
      degraded && reason
        ? `Templates exigem Cloud API. ${reason}`
        : 'Templates exigem modo oficial (Cloud API). Ative o modo oficial e configure os secrets.'
    );
  }
  return invokeCloud({
    to: toPhone(params.remoteJid),
    type: 'template',
    template: {
      name: params.name,
      language: params.language ?? 'pt_BR',
      components: params.components,
    },
  });
}

// ----- Sinais (presença / leitura) ------------------------------------------

export async function sendPresence(params: PresenceParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return { skipped: true, reason: 'presence_unsupported_on_cloud_api' };
  }
  return invokeEvolution('send-presence', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    presence: params.presence,
  });
}

export async function markAsRead(params: MarkAsReadParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'read',
      messageIds: params.messageIds,
    });
  }
  return invokeEvolution('mark-as-read', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    readMessages: params.messageIds.map((id) => ({
      remoteJid: params.remoteJid,
      id,
      fromMe: false,
    })),
  });
}

// ----- Webhooks de entrada --------------------------------------------------

function projectFunctionsBase(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  if (supabaseUrl && !supabaseUrl.includes('.supabase.co')) {
    return supabaseUrl.replace(/\/$/, '') + '/functions/v1';
  }
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? '';
  return `https://${projectId}.supabase.co/functions/v1`;
}

/** URL pública do webhook Cloud API (Meta). */
export function getCloudWebhookUrl(): string {
  return `${projectFunctionsBase()}/whatsapp-cloud-webhook`;
}

/** URL pública do webhook Evolution (Baileys). */
export function getEvolutionWebhookUrl(): string {
  return `${projectFunctionsBase()}/evolution-webhook`;
}

/** URL que o provedor ativo deve chamar — escolhida pelo modo do workspace. */
export async function getActiveWebhookUrl(): Promise<string> {
  const { transport } = await resolveTransport();
  return transport === 'cloud' ? getCloudWebhookUrl() : getEvolutionWebhookUrl();
}

/**
 * Façade agrupada para quem prefere `whatsapp.sendText(...)` ao invés de
 * importar as funções soltas. Use uma ou outra — comportamento idêntico.
 */
export const whatsapp = {
  getMode: getWhatsAppMode,
  resolveTransport,
  invalidateModeCache: invalidateWhatsAppModeCache,
  invalidateTransportCache,
  sendText,
  sendMedia,
  sendAudio,
  sendSticker,
  sendReaction,
  sendLocation,
  sendContact,
  sendTemplate,
  sendPresence,
  markAsRead,
  getActiveWebhookUrl,
  getCloudWebhookUrl,
  getEvolutionWebhookUrl,
} as const;
