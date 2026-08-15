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
 *
 * Fluxo dual-mode (envio):
 *  - `remoteJid` de grupo (termina em `@g.us`) → SEMPRE `evolution-api`.
 *    Grupos não existem na Meta Cloud API (Graph API) — roteá-los pelo modo
 *    mandaria um destino impossível para o Cloud.
 *  - Demais destinos → transporte resolvido pelo modo do workspace
 *    (`rpc_get_whatsapp_mode` com cache de 30s): `unofficial` → evolution,
 *    `official` → cloud (com fallback degradado para evolution se faltarem
 *    secrets). `unofficial` é o default — comportamento de produção atual
 *    permanece idêntico (no-op).
 *  - `listGroups` (sync de grupos) continua via Evolution direto: groups sync
 *    só existe no Baileys e nunca passa por resolução de modo.
 */
import { supabase } from '@/integrations/supabase/client';
import { toPhone } from '@/lib/jid';
import type {
  SendTextParams,
  SendMediaParams,
  SendAudioParams,
  SendStickerParams,
  SendReactionParams,
  SendLocationParams,
  SendInteractiveParams,
  SendContactParams,
  SendTemplateParams,
  PresenceParams,
  MarkAsReadParams,
} from './whatsappAdapterTypes';
import {
  getWhatsAppMode,
  resolveTransport,
  invalidateWhatsAppModeCache,
  invalidateTransportCache,
} from './whatsappAdapterTransport';

/** Re-exported module members. */
export type { WhatsAppMode, WhatsAppTransport, ResolvedTransport } from './whatsappAdapterTypes';
/** Re-exported module members. */
export type {
  SendTextParams,
  SendMediaParams,
  SendAudioParams,
  SendStickerParams,
  SendReactionParams,
  SendLocationParams,
  SendInteractiveParams,
  SendContactParams,
  TemplateComponent,
  SendTemplateParams,
  PresenceParams,
  MarkAsReadParams,
} from './whatsappAdapterTypes';
/** Re-exported module members. */
export {
  getWhatsAppMode,
  resolveTransport,
  invalidateWhatsAppModeCache,
  invalidateTransportCache,
} from './whatsappAdapterTransport';
import { ACTIVE_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

const DEFAULT_INSTANCE = ACTIVE_WHATSAPP_INSTANCE;

// ----- Helpers --------------------------------------------------------------

/** True quando `remoteJid` é grupo do WhatsApp — grupos só existem na Evolution (Baileys). */
function isGroupJid(remoteJid: string): boolean {
  return remoteJid.endsWith('@g.us');
}

/** Calls the `whatsapp-cloud-send` edge function with `body` and throws on HTTP or API-level errors. */
async function invokeCloud(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('whatsapp-cloud-send', { body });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error(
      ((data as Record<string, unknown>).error as string | undefined) ?? 'cloud_send_failed'
    ); // ignore-audit: narrows Supabase query result to local interface
  }
  return data;
}

/** Calls the `evolution-api` edge function for the given `action`, merging it with `body`, and throws on error. */
async function invokeEvolution(action: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('evolution-api', {
    body: { action, ...body },
  });
  if (error) throw error;
  return data;
}

// ----- Envios ---------------------------------------------------------------

/** send Text function. */
export async function sendText(params: SendTextParams) {
  // Dual-mode: grupos (@g.us) não existem na Meta Cloud API → Evolution sempre
  // (sem round-trip de modo; demais destinos seguem o modo do workspace).
  const transport = isGroupJid(params.remoteJid)
    ? 'evolution'
    : (await resolveTransport()).transport;
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

/** send Media function. */
export async function sendMedia(params: SendMediaParams) {
  // Dual-mode: grupos (@g.us) não existem na Meta Cloud API → Evolution sempre
  // (sem round-trip de modo; demais destinos seguem o modo do workspace).
  const transport = isGroupJid(params.remoteJid)
    ? 'evolution'
    : (await resolveTransport()).transport;
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

/** send Audio function. */
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
    encoding: params.encoding,
    mediaHash: params.mediaHash,
  });
}

/** send Sticker function. */
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

/** send Reaction function. */
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

/** send Location function. */
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

/** send Contact function. */
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

/** send Interactive function. */
export async function sendInteractive(params: SendInteractiveParams) {
  const { transport } = await resolveTransport();
  if (transport === 'cloud') {
    // A edge function whatsapp-cloud-send ainda nao aceita `interactive` no
    // enum de `type` (zod rejeita com 400) — a chamada abaixo falha de forma
    // explicita, sem falso sucesso, ate o schema Cloud ganhar suporte.
    return invokeCloud({
      to: toPhone(params.remoteJid),
      type: 'interactive',
      interactive: {
        type: params.type === 'list' ? 'list' : params.type === 'cta_url' ? 'cta_url' : 'button',
        header:
          params.header?.type === 'text' && params.header.text
            ? { type: 'text', text: params.header.text }
            : undefined,
        body: { text: params.body },
        footer: params.footer ? { text: params.footer } : undefined,
        action:
          params.type === 'list'
            ? { button: params.listButtonText, sections: params.sections }
            : {
                buttons: params.buttons?.map((b) => ({
                  type: 'reply',
                  reply: { id: b.id, title: b.title },
                })),
              },
      },
    });
  }
  return invokeEvolution(params.type === 'list' ? 'send-list' : 'send-buttons', {
    instanceName: params.instance ?? DEFAULT_INSTANCE,
    number: toPhone(params.remoteJid),
    text: params.body,
    header: params.header?.text,
    footer: params.footer,
    // Formato nativo Evolution: buttons[{ buttonId, buttonText:{displayText} }]
    buttons: params.buttons?.map((b) => ({
      buttonId: b.id,
      buttonText: { displayText: b.title },
    })),
    list: params.sections
      ? {
          title: params.body,
          description: params.footer,
          buttonText: params.listButtonText,
          sections: params.sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({
              rowId: r.id,
              title: r.title,
              description: r.description,
            })),
          })),
        }
      : undefined,
  });
}

/** send Template function. */
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

/** send Presence function. */
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

/** mark As Read function. */
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

// ── Verbos de gerenciamento de instância/conexão ──────────────────────────

export interface ConnectParams { instanceName: string }
export async function connectInstance(params: ConnectParams) {
  return invokeEvolution('connect', { instanceName: params.instanceName });
}

export interface ListGroupsParams { instanceName: string; getParticipants?: boolean }
export async function listGroups(params: ListGroupsParams) {
  return invokeEvolution('list-groups', {
    instanceName: params.instanceName,
    getParticipants: params.getParticipants ? 'true' : 'false',
  });
}

export interface GetQrCodeParams { instanceName: string }
export async function getQrCode(params: GetQrCodeParams) {
  return invokeEvolution('get-qrcode', { instanceName: params.instanceName });
}

export interface RestartInstanceParams { instanceName: string }
export async function restartInstance(params: RestartInstanceParams) {
  return invokeEvolution('restart-instance', { instanceName: params.instanceName });
}

export async function listInstances() {
  return invokeEvolution('list-instances', {});
}


// ── Helper para sub-path invokes (routing por caminho, não por action) ───
async function invokeEvolutionPath(path: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(`evolution-api/${path}`, {
    method: 'POST',
    body,
  });
  if (error) throw error;
  return data;
}

// ── WhatsApp Status (Stories) ────────────────────────────────────────────
export interface FindStatusMessagesParams { instanceName: string; page?: number; offset?: number }
export async function findStatusMessages(params: FindStatusMessagesParams) {
  return invokeEvolutionPath('find-status-messages', {
    instanceName: params.instanceName,
    page: params.page ?? 1,
    offset: params.offset ?? 200,
  });
}

export interface SendChatPresenceParams { instanceName: string; number: string; presence?: string; delay?: number }
export async function sendChatPresence(params: SendChatPresenceParams) {
  return invokeEvolutionPath('send-chat-presence', {
    instanceName: params.instanceName,
    number: params.number,
    presence: params.presence ?? 'paused',
    delay: params.delay ?? 0,
  });
}

// ── Webhook management ────────────────────────────────────────────────────
export interface GetWebhookConfigParams { instanceName: string }
export async function getWebhookConfig(params: GetWebhookConfigParams) {
  return invokeEvolutionPath('get-webhook', { instanceName: params.instanceName });
}

export interface SetWebhookConfigParams { instanceName: string; webhook: Record<string, unknown> }
export async function setWebhookConfig(params: SetWebhookConfigParams) {
  return invokeEvolutionPath('set-webhook', {
    instanceName: params.instanceName,
    webhook: params.webhook,
  });
}

// ── Gerenciamento de instâncias ───────────────────────────────────────────

export interface CreateInstanceParams {
  instanceName: string;
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS-CLOUD';
  qrcode?: boolean;
}
export async function createInstance(params: CreateInstanceParams) {
  return invokeEvolution('create-instance', {
    instanceName: params.instanceName,
    integration: params.integration ?? 'WHATSAPP-BAILEYS',
    qrcode: params.qrcode ?? true,
  });
}

export interface RequestPairingCodeParams { instanceName: string; number: string }
export async function requestPairingCode(params: RequestPairingCodeParams) {
  return invokeEvolution('pairing-code', {
    instanceName: params.instanceName,
    number: params.number,
  });
}

// ── Video circular (PTV) — usa FormData, adapter passa direto ────────────
// TODO-F3-sendPtv: sendPtv usa FormData multipart (não JSON).
// Evolution API detecta o content-type e roteia para /message/sendPtv/{instance}.
// A chamada direta a supabase.functions.invoke é necessária neste caso.
export async function sendPtv(formData: FormData) {
  const { data, error } = await supabase.functions.invoke('evolution-api', {
    body: formData,
  });
  if (error) throw error;
  return data;
}

// ----- Webhooks de entrada --------------------------------------------------

/** Returns the Supabase Functions base URL, preferring the self-hosted instance when VITE_SUPABASE_URL is not a managed `.supabase.co` host. */
function projectFunctionsBase(): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  if (supabaseUrl && !supabaseUrl.includes('.supabase.co')) {
    return supabaseUrl.replace(/\/$/, '') + '/functions/v1';
  }
  return 'https://supabase.atomicabr.com.br/functions/v1';
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
  sendInteractive,
  sendContact,
  sendTemplate,
  sendPresence,
  markAsRead,
  connectInstance,
  listGroups,
  getQrCode,
  restartInstance,
  listInstances,
  findStatusMessages,
  sendChatPresence,
  getWebhookConfig,
  setWebhookConfig,
  createInstance,
  requestPairingCode,
  sendPtv,
  getActiveWebhookUrl,
  getCloudWebhookUrl,
  getEvolutionWebhookUrl,
} as const;
