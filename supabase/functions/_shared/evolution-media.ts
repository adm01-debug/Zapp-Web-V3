// Shared media persistence helpers for Evolution API functions
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isRecord } from "./evolution-helpers.ts";

/** evolution-media utilities and exports. */
export function isValidMediaBytes(bytes: Uint8Array, messageType: string): boolean {
  if (bytes.length < 4) return false;

  if (messageType === 'audio') {
    const isOgg = bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53;
    const isMp3 = (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) ||
                  (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33);
    const isWebm = bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3;
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    return isOgg || isMp3 || isWebm || isWav;
  }

  if (messageType === 'image') {
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isWebp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    return isJpeg || isPng || isWebp;
  }

  if (messageType === 'video') {
    const isMp4 = bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
    const isWebm = bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3;
    return isMp4 || isWebm;
  }

  return true;
}

function detectExtension(respContentType: string, defaultExt: string): string {
  if (respContentType.includes('png')) return 'png';
  if (respContentType.includes('webp')) return 'webp';
  if (respContentType.includes('mp4')) return 'mp4';
  if (respContentType.includes('mpeg')) return 'mp3';
  if (respContentType.includes('pdf')) return 'pdf';
  if (respContentType.includes('opus')) return 'opus';
  return defaultExt;
}

export function isSafeMediaCdnUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    const h = hostname.toLowerCase();
    const exact = new Set(['mmg.whatsapp.net', 'media.whatsapp.net', 'pps.whatsapp.net', 'static.whatsapp.net']);
    if (exact.has(h)) return true;
    if (h.endsWith('.whatsapp.net') || h.endsWith('.whatsapp.com')) return true;
    return false;
  } catch { return false; }
}

export async function persistMediaToStorage(
  supabase: SupabaseClient,
  cdnUrl: string,
  messageType: string,
  messageId: string,
): Promise<string | null> {
  if (!isSafeMediaCdnUrl(cdnUrl)) {
    console.error(`[MEDIA] Rejected unsafe CDN URL for ${messageType}`);
    return null;
  }
  try {
    const resp = await fetch(cdnUrl, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!resp.ok) { console.error(`[MEDIA] Download failed (${resp.status}) for ${messageType}`); return null; }

    const arrayBuf = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.length < 100) { console.error(`[MEDIA] File too small (${bytes.length} bytes)`); return null; }

    if (!isValidMediaBytes(bytes, messageType)) {
      console.warn(`[MEDIA] Downloaded ${messageType} file (${bytes.length} bytes) appears encrypted or corrupted — magic bytes: ${Array.from(bytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')}. Falling back to API.`);
      return null;
    }

    const extMap: Record<string, string> = { image: 'jpg', video: 'mp4', audio: 'ogg', document: 'bin' };
    const contentTypeMap: Record<string, string> = { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/ogg', document: 'application/octet-stream' };
    const respContentType = resp.headers.get('content-type') || contentTypeMap[messageType] || 'application/octet-stream';
    const ext = detectExtension(respContentType, extMap[messageType] || 'bin');

    const safeId = messageId.replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `${messageType}/${safeId}_${Date.now()}.${ext}`;
    const bucket = messageType === 'audio' ? 'audio-messages' : 'whatsapp-media';

    const { error: uploadErr } = await supabase.storage.from(bucket).upload(fileName, bytes, {
      contentType: respContentType, cacheControl: '31536000', upsert: true,
    });
    if (uploadErr) { console.error(`[MEDIA] Upload error for ${messageType}:`, uploadErr); return null; }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    console.log(`[MEDIA] Persisted ${messageType} (${(bytes.length / 1024).toFixed(1)}KB) → ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err) { console.error(`[MEDIA] persistMediaToStorage error:`, err); return null; }
}

export async function persistMediaViaApi(
  supabase: SupabaseClient,
  instance: string,
  data: Record<string, unknown>,
  messageType: string,
  messageId: string,
): Promise<string | null> {
  try {
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
    if (!evolutionUrl || !evolutionKey) return null;

    const baseUrl = evolutionUrl.replace(/\/+$/, '');
    const resp = await fetch(`${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
      body: JSON.stringify({ message: { key: data.key, message: data.message }, convertToMp4: false }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) { console.error(`[MEDIA] getBase64 API error (${resp.status})`); return null; }

    const result = await resp.json();
    const b64 = (result.base64 as string) || (result.data as string) || (result.media as string);
    if (!b64) return null;

    const raw = b64.includes(',') ? b64.split(',')[1] : b64;
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    if (bytes.length < 100) return null;

    const mimeType = (result.mimetype as string) || 'application/octet-stream';
    let ext = 'bin';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('mp4')) ext = 'mp4';
    else if (mimeType.includes('ogg') || mimeType.includes('opus')) ext = 'ogg';
    else if (mimeType.includes('mpeg')) ext = 'mp3';
    else if (mimeType.includes('pdf')) ext = 'pdf';

    const safeId = messageId.replace(/[^a-zA-Z0-9]/g, '');
    const fileName = `${messageType}/${safeId}_${Date.now()}.${ext}`;
    const bucket = messageType === 'audio' ? 'audio-messages' : 'whatsapp-media';

    const { error: uploadErr } = await supabase.storage.from(bucket).upload(fileName, bytes, {
      contentType: mimeType, cacheControl: '31536000', upsert: true,
    });
    if (uploadErr) { console.error(`[MEDIA] base64 upload error:`, uploadErr); return null; }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    console.log(`[MEDIA] Persisted ${messageType} via API (${(bytes.length / 1024).toFixed(1)}KB)`);
    return urlData.publicUrl;
  } catch (err) { console.error(`[MEDIA] persistMediaViaApi error:`, err); return null; }
}

export interface ParsedMessage {
  content: string;
  messageType: string;
  mediaUrl: string | null;
}

export function parseMessageContent(message: Record<string, unknown> | undefined, data: Record<string, unknown>): ParsedMessage {
  const unwrapMessage = (value: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
    if (!value) return undefined;

    const ephemeral = (value.ephemeralMessage as Record<string, unknown> | undefined)?.message;
    if (isRecord(ephemeral)) return unwrapMessage(ephemeral);

    const viewOnce = (value.viewOnceMessage as Record<string, unknown> | undefined)?.message;
    if (isRecord(viewOnce)) return unwrapMessage(viewOnce);

    const viewOnceV2 = (value.viewOnceMessageV2 as Record<string, unknown> | undefined)?.message;
    if (isRecord(viewOnceV2)) return unwrapMessage(viewOnceV2);

    const viewOnceV2Ext = (value.viewOnceMessageV2Extension as Record<string, unknown> | undefined)?.message;
    if (isRecord(viewOnceV2Ext)) return unwrapMessage(viewOnceV2Ext);

    const edited = (value.editedMessage as Record<string, unknown> | undefined)?.message;
    if (isRecord(edited)) return unwrapMessage(edited);

    return value;
  };

  message = unwrapMessage(message);
  let content = '';
  let messageType = 'text';
  let mediaUrl: string | null = null;

  if (!message) return { content, messageType, mediaUrl };

  if (message.conversation) {
    content = message.conversation as string;
  } else if ((message.extendedTextMessage as Record<string, unknown>)?.text) {
    content = (message.extendedTextMessage as Record<string, unknown>).text as string;
  } else if (message.imageMessage) {
    messageType = 'image';
    const img = message.imageMessage as Record<string, unknown>;
    content = (img.caption as string) || '[Imagem]';
    mediaUrl = (img.url as string) || null;
  } else if (message.videoMessage) {
    messageType = 'video';
    const vid = message.videoMessage as Record<string, unknown>;
    content = (vid.caption as string) || '[Vídeo]';
    mediaUrl = (vid.url as string) || null;
  } else if (message.audioMessage) {
    messageType = 'audio';
    content = '[Áudio]';
    mediaUrl = (message.audioMessage as Record<string, unknown>).url as string || null;
  } else if (message.documentMessage) {
    messageType = 'document';
    const doc = message.documentMessage as Record<string, unknown>;
    content = (doc.fileName as string) || '[Documento]';
    mediaUrl = (doc.url as string) || null;
  } else if (message.documentWithCaptionMessage) {
    messageType = 'document';
    const dwc = message.documentWithCaptionMessage as Record<string, unknown>;
    const innerDoc = (dwc.message as Record<string, unknown>)?.documentMessage as Record<string, unknown>;
    content = (innerDoc?.fileName as string) || (innerDoc?.caption as string) || '[Documento]';
    mediaUrl = (innerDoc?.url as string) || null;
  } else if (message.locationMessage) {
    messageType = 'location';
    const loc = message.locationMessage as Record<string, unknown>;
    content = JSON.stringify({ latitude: loc.degreesLatitude, longitude: loc.degreesLongitude });
  } else if (message.stickerMessage || (data.messageType as string) === 'stickerMessage') {
    messageType = 'sticker';
    content = '[Sticker]';
  } else if (message.reactionMessage) {
    messageType = 'reaction';
    content = '';
  } else if (message.contactMessage || message.contactsArrayMessage) {
    messageType = 'contact';
    content = '[Contato]';
  } else if (message.pollCreationMessage) {
    messageType = 'poll';
    content = (message.pollCreationMessage as Record<string, unknown>).name as string || '[Enquete]';
  }

  return { content, messageType, mediaUrl };
}
