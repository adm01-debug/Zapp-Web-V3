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
import { toPhone } from '@/lib/jid';
import type {
  SendTextParams,
  SendMediaParams,
  SendAudioParams,
  SendStickerParams,
  SendReactionParams,
  SendLocationParams,
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

export type { WhatsAppMode, WhatsAppTransport, ResolvedTransport } from './whatsappAdapterTypes';
export type {
  SendTextParams,
  SendMediaParams,
  SendAudioParams,
  SendStickerParams,
  SendReactionParams,
  SendLocationParams,
  SendContactParams,
  TemplateComponent,
  SendTemplateParams,
  PresenceParams,
  MarkAsReadParams,
} from './whatsappAdapterTypes';
export {
  getWhatsAppMode,
  resolveTransport,
  invalidateWhatsAppModeCache,
  invalidateTransportCache,
} from './whatsappAdapterTransport';

const DEFAULT_INSTANCE = 'wpp2';

// ----- Helpers --------------------------------------------------------------

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
