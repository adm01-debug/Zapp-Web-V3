/**
 * providers/cloud/media.ts — Mídia da Meta WhatsApp Cloud API (W4 do desacoplamento)
 *
 * Destino: supabase/functions/_shared/providers/cloud/media.ts
 *
 * Contexto (BUG da simulação): a Cloud API NÃO entrega URL pública assinada no
 * webhook — apenas media_id. Sem este módulo, media_url fica null e o front
 * quebra (imagem/vídeo/áudio sem src). O download exige:
 *   GET https://graph.facebook.com/v21.0/{media_id}
 *   Authorization: Bearer {token}
 *
 * Este módulo espelha o padrão EXATO do evolution-media.ts:
 *   - validação de magic bytes por tipo (imagem jpeg/png/gif/webp, áudio
 *     ogg/mp3/m4a/opus, vídeo mp4, documento pdf/zip);
 *   - nome determinístico {type}/{safeId}.{ext} (sem Date.now() — upsert);
 *   - bucket whatsapp-media (áudio → audio-messages);
 *   - upload via supabase.storage com retry 3x + backoff e upsert: true;
 *   - URL pública via getStoragePublicUrl — os buckets de mídia são PÚBLICOS
 *     por decisão do dono (2026-08-06, BUG-MEDIA; guard no banco impede
 *     reversão via UPDATE comum).
 *
 * REGRA DE SEGURANÇA: NUNCA logar bytes/conteúdo de mídia. Logs apenas com
 * tipo, tamanho (KB), status HTTP e path.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getStoragePublicUrl } from "../../storage-url.ts";

/** Base + versão da Graph API da Meta (fixa por contrato W4). */
export const CLOUD_GRAPH_API_BASE = "https://graph.facebook.com";
export const CLOUD_GRAPH_API_VERSION = "v21.0";

/** Limite de mídia da Cloud API (50MB — mesmo limite do bucket no banco). */
export const MAX_CLOUD_MEDIA_BYTES = 50 * 1024 * 1024;

/** Timeout de download: áudio pode ter vários MB → 90s; demais 30s. */
const TIMEOUT_MS_AUDIO = 90_000;
const TIMEOUT_MS_DEFAULT = 30_000;

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CloudMediaDownloadError {
  code: "UNAUTHORIZED" | "NOT_FOUND" | "SERVER_ERROR" | "TOO_LARGE" | "TIMEOUT" | "NETWORK_ERROR";
  status: number; // 0 = falha de rede/timeout (sem resposta HTTP)
  message: string;
}

export interface CloudMediaDownloadResult {
  ok: boolean;
  /** Presente apenas quando ok === true. Nunca logar este conteúdo. */
  bytes?: Uint8Array;
  mime?: string;
  filename?: string;
  error?: CloudMediaDownloadError;
}

export interface CloudMediaResult {
  media_url: string | null;
  media_bucket: string | null;
  media_path: string | null;
  media_status: "ready" | "failed";
}

// ─── Magic bytes (padrão evolution-media.ts + gif/m4a/opus/pdf) ──────────────

/**
 * Valida os magic bytes do binário contra o tipo declarado. Mesma semântica do
 * evolution-media.ts: tipos não validados (sticker etc.) passam por padrão.
 */
export function isValidCloudMediaBytes(bytes: Uint8Array, type: string): boolean {
  if (bytes.length < 4) return false;

  if (type === "audio") {
    const isOgg = bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53; // OggS
    const isMp3 = (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) ||
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33); // ID3
    const isM4a = bytes.length >= 12 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 && // ftyp
      (bytes[8] === 0x4D && bytes[9] === 0x34 && bytes[10] === 0x41 && bytes[11] === 0x20); // 'M4A '
    const isOpus = bytes[0] === 0x4F && bytes[1] === 0x70 && bytes[2] === 0x75 && bytes[3] === 0x73; // OpusHead
    const isWebm = bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3;
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // RIFF
    return isOgg || isMp3 || isM4a || isOpus || isWebm || isWav;
  }

  if (type === "image") {
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38; // GIF8
    const isWebp = bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50; // WEBP
    return isJpeg || isPng || isGif || isWebp;
  }

  if (type === "video") {
    const isMp4 = bytes.length >= 8 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70; // ftyp
    const isWebm = bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3;
    return isMp4 || isWebm;
  }

  if (type === "document") {
    const isPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B &&
      (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07); // PK (docx/xlsx/pptx)
    return isPdf || isZip;
  }

  return true; // tipos não validados (sticker etc.) — mesmo comportamento do evolution-media.ts
}

// ─── Helpers internos (compartilhados p/ nome determinístico) ────────────────

/** Infere o diretório {type} a partir do mime quando o caller não informou type. */
function typeFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  return "document";
}

/** Extensão determinística a partir do mime (mesma cadeia do evolution-media.ts). */
function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  if (m.includes("mp4") || m.includes("mpeg")) return "mp4";
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("m4a") || m.includes("mp4a")) return "m4a";
  if (m.includes("aac")) return "aac";
  if (m.includes("mp3")) return "mp3";
  if (m.includes("wav") || m.includes("wave")) return "wav";
  if (m.includes("pdf")) return "pdf";
  if (m.includes("quicktime") || m.includes("mov")) return "mov";
  if (m.includes("openxmlformats")) {
    if (m.includes("spreadsheet")) return "xlsx";
    if (m.includes("presentation")) return "pptx";
    return "docx";
  }
  if (m.includes("zip")) return "zip";
  return "bin";
}

/** Bucket por tipo: áudio → audio-messages; demais → whatsapp-media. */
function bucketForType(type: string): string {
  return type === "audio" ? "audio-messages" : "whatsapp-media";
}

/** Extrai filename do Content-Disposition (opcional — a Cloud API não envia sempre). */
function parseFilenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  if (!match) return null;
  const name = match[1].replace(/^"|"$/g, "").trim();
  return name.length > 0 ? name : null;
}

// ─── 1. downloadMedia ────────────────────────────────────────────────────────

/**
 * Baixa o binário da mídia da Cloud API.
 *
 * @param mediaId media_id do webhook da Meta (ex.: "1234567890123456")
 * @param token   access token da Cloud API (Bearer)
 * @param type    tipo da mensagem ('audio' → timeout 90s; demais 30s)
 *
 * Retorna { ok, bytes, mime, filename? } em sucesso; em falha retorna erro
 * estruturado (401/403 → UNAUTHORIZED, 404 → NOT_FOUND, 5xx → SERVER_ERROR,
 * >50MB → TOO_LARGE, timeout → TIMEOUT). NUNCA loga bytes.
 */
export async function downloadMedia(
  mediaId: string,
  token: string,
  type?: string,
): Promise<CloudMediaDownloadResult> {
  const url = `${CLOUD_GRAPH_API_BASE}/${CLOUD_GRAPH_API_VERSION}/${encodeURIComponent(mediaId)}`;
  const timeoutMs = type === "audio" ? TIMEOUT_MS_AUDIO : TIMEOUT_MS_DEFAULT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          status: resp.status,
          message: `Cloud API auth error (${resp.status}) for media ${mediaId}`,
        },
      };
    }
    if (resp.status === 404) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          status: 404,
          message: `Cloud media not found or expired (${mediaId})`,
        },
      };
    }
    if (!resp.ok) {
      return {
        ok: false,
        error: {
          code: "SERVER_ERROR",
          status: resp.status,
          message: `Cloud API error (${resp.status}) for media ${mediaId}`,
        },
      };
    }

    // Guarda antecipada por Content-Length (evita ler body gigante).
    const contentLength = Number(resp.headers.get("content-length") || "0");
    if (contentLength > MAX_CLOUD_MEDIA_BYTES) {
      return {
        ok: false,
        error: {
          code: "TOO_LARGE",
          status: 413,
          message: `Cloud media exceeds 50MB limit (${contentLength} bytes)`,
        },
      };
    }

    const arrayBuf = await resp.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    if (bytes.length > MAX_CLOUD_MEDIA_BYTES) {
      return {
        ok: false,
        error: {
          code: "TOO_LARGE",
          status: 413,
          message: `Cloud media exceeds 50MB limit (${bytes.length} bytes)`,
        },
      };
    }

    // P2-03: normaliza Content-Type (remove parâmetros — ex.: 'audio/ogg; codecs=opus').
    const mime = (resp.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
    const filename = parseFilenameFromDisposition(resp.headers.get("content-disposition"));

    return { ok: true, bytes, mime, filename: filename ?? undefined };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      error: {
        code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
        status: 0,
        message: isTimeout
          ? `Cloud media download timed out after ${timeoutMs}ms (${mediaId})`
          : `Cloud media download failed (${mediaId}): ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── 2. persistMediaToStorage ────────────────────────────────────────────────

/**
 * Persiste o binário no Supabase Storage seguindo o padrão EXATO do
 * evolution-media.ts: valida magic bytes por tipo, nome determinístico
 * {type}/{safeId}.{ext}, bucket whatsapp-media (áudio → audio-messages),
 * upload com retry 3x + backoff e upsert, e retorna a URL pública
 * (getStoragePublicUrl — buckets públicos por decisão do dono 2026-08-06).
 *
 * @returns URL pública em sucesso; null em qualquer falha (mesmo contrato do evolution-media.ts).
 */
export async function persistMediaToStorage(
  bytes: Uint8Array,
  mime: string,
  safeId: string,
  supabase: SupabaseClient<any, any>,
  type?: string,
): Promise<string | null> {
  try {
    const mimeType = (mime || "application/octet-stream").split(";")[0].trim();
    const mediaType = type && type !== "unknown" ? type : typeFromMime(mimeType);

    if (bytes.length < 100) {
      console.warn(`[CLOUD-MEDIA] File too small (${bytes.length} bytes) for ${mediaType}`);
      return null;
    }
    if (!isValidCloudMediaBytes(bytes, mediaType)) {
      console.warn(
        `[CLOUD-MEDIA] Rejected ${mediaType} file (${bytes.length} bytes) — magic bytes mismatch (possible encryption/corruption)`,
      );
      return null;
    }

    const cleanId = safeId.replace(/[^a-zA-Z0-9]/g, "");
    if (!cleanId) {
      console.warn("[CLOUD-MEDIA] Empty safeId after sanitization — skipping upload");
      return null;
    }

    const ext = extFromMime(mimeType);
    // P6-fix: filename determinístico — Date.now() impedia upsert (cada retry = arquivo novo).
    const fileName = `${mediaType}/${cleanId}.${ext}`;
    const bucket = bucketForType(mediaType);

    let uploadErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await supabase.storage.from(bucket).upload(fileName, bytes, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: true,
      });
      uploadErr = error;
      if (!uploadErr) break;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1))); // 1s, 2s
      }
    }
    if (uploadErr) {
      console.error(`[CLOUD-MEDIA] Upload error after retries for ${mediaType}:`, uploadErr);
      return null;
    }

    const publicUrl = getStoragePublicUrl(bucket, fileName);
    console.log(`[CLOUD-MEDIA] Persisted ${mediaType} (${(bytes.length / 1024).toFixed(1)}KB) → ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error("[CLOUD-MEDIA] persistMediaToStorage error:", err);
    return null;
  }
}

// ─── 3. processCloudMedia ────────────────────────────────────────────────────

/**
 * Orquestra download + persistência da mídia da Cloud API.
 *
 * @param mediaId media_id do webhook (ausente/vazio → retorna null, SEM erro)
 * @param token   access token da Cloud API
 * @param supabase client do Supabase para o storage
 * @param type    tipo da mensagem (image/audio/video/document/...)
 *
 * @returns { media_url, media_bucket, media_path, media_status: 'ready' | 'failed' }
 *          ou null quando media_id está ausente.
 */
export async function processCloudMedia(
  mediaId: string,
  token: string,
  supabase: SupabaseClient<any, any>,
  type: string,
): Promise<CloudMediaResult | null> {
  // media_id ausente → null sem erro (contrato W4; evita ruído de log).
  if (!mediaId) return null;

  const downloaded = await downloadMedia(mediaId, token, type);
  if (!downloaded.ok || !downloaded.bytes || !downloaded.mime) {
    console.error(
      `[CLOUD-MEDIA] Download failed for ${type} ${mediaId}: ${downloaded.error?.code ?? "UNKNOWN"} (${downloaded.error?.status ?? 0})`,
    );
    return { media_url: null, media_bucket: null, media_path: null, media_status: "failed" };
  }

  const safeId = mediaId.replace(/[^a-zA-Z0-9]/g, "");
  const url = await persistMediaToStorage(downloaded.bytes, downloaded.mime, safeId, supabase, type);
  if (!url) {
    return { media_url: null, media_bucket: null, media_path: null, media_status: "failed" };
  }

  // Bucket/path determinísticos (mesmos helpers do persist — sem duplicação).
  const mediaType = type && type !== "unknown" ? type : typeFromMime(downloaded.mime);
  const bucket = bucketForType(mediaType);
  const path = `${mediaType}/${safeId}.${extFromMime(downloaded.mime)}`;

  return { media_url: url, media_bucket: bucket, media_path: path, media_status: "ready" };
}
