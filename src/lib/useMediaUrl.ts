/**
 * useMediaUrl.ts — Hook central para resolução de URLs de mídia
 *
 * PRINCÍPIO (ADR-001 + ADR-002):
 *   - Bucket `whatsapp-media` é PÚBLICO → URL direta, zero signed URL
 *   - Outros buckets privados → signed URL com cache de sessão
 *   - Nunca chamar createSignedUrl() em loop (N+1)
 *
 * BENEFÍCIO:
 *   Elimina ~450 POSTs por page load que eram gerados por createSignedUrl()
 *   chamado 1× por arquivo na listagem de conversas.
 */

import { useMemo, useRef } from 'react';
import { sanitizeMediaUrl, resolveMediaUrl, isMediaUrlFailed, SUPABASE_PUBLIC_URL } from './mediaUrl';

// ---------------------------------------------------------------------------
// Buckets públicos — não precisam de signed URL
// ---------------------------------------------------------------------------

/**
 * Buckets que são públicos no Supabase Storage.
 * Para esses, a URL é construída diretamente sem nenhuma chamada à API.
 * Atualizar quando novos buckets forem tornados públicos.
 */
export const PUBLIC_BUCKETS = new Set([
  'whatsapp-media', // ADR-002: tornado público em 26/07/2026
  'avatars',        // sempre foi público
  'stickers',       // sempre foi público
  'audio-memes',    // sempre foi público
]);

/**
 * Retorna true se o bucket for público e não precisar de signed URL.
 */
export function isPublicBucket(bucket: string): boolean {
  return PUBLIC_BUCKETS.has(bucket);
}

// ---------------------------------------------------------------------------
// Resolução de URL pública (sem network call)
// ---------------------------------------------------------------------------

/**
 * Resolve URL de uma mídia de maneira síncrona e sem network.
 * Prioridade:
 *   1. media_bucket + media_path (formato novo, canônico)
 *   2. media_url sanitizada (formato legado)
 *   3. null → placeholder
 *
 * Para buckets públicos: retorna URL direta.
 * Para buckets privados: retorna null (precisa de signed URL async via useSignedMediaUrl).
 */
export function resolvePublicMediaUrl(params: {
  mediaBucket?: string | null;
  mediaPath?: string | null;
  mediaUrl?: string | null;
  mediaStatus?: string | null;
}): string | null {
  const { mediaBucket, mediaPath, mediaUrl, mediaStatus } = params;

  // Mídia expirada nunca renderiza
  if (mediaStatus === 'expired' || mediaStatus === 'failed') return null;

  // Formato novo (canônico) — se temos bucket + path e é bucket público
  if (mediaBucket && mediaPath) {
    if (isPublicBucket(mediaBucket)) {
      const url = resolveMediaUrl(mediaBucket, mediaPath);
      return isMediaUrlFailed(url) ? null : url;
    }
    // Bucket privado → precisa de signed URL → caller deve usar useSignedMediaUrl
    return null;
  }

  // Formato legado — sanitizar e retornar se for URL pública
  if (mediaUrl) {
    const sanitized = sanitizeMediaUrl(mediaUrl);
    if (!sanitized) return null; // CDN WhatsApp ou invalida
    if (isMediaUrlFailed(sanitized)) return null;
    // Verificar se aponta para nosso storage público
    if (sanitized.startsWith(SUPABASE_PUBLIC_URL)) return sanitized;
    if (sanitized.startsWith('https://zapp-media-proxy.adm01.workers.dev')) return sanitized;
    // URL de storage desconhecido → retornar mesmo assim (pode ser outra CDN)
    return sanitized;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Cache de sessão para signed URLs (buckets privados)
// ---------------------------------------------------------------------------

/** TTL de 50 minutos — signed URLs do Supabase expiram em 60min por padrão. */
const SIGNED_URL_TTL_MS = 50 * 60 * 1000;

interface CachedSignedUrl {
  url: string;
  expiresAt: number;
}

// Cache global de sessão (sobrevive a re-renders, não a reloads)
const signedUrlCache = new Map<string, CachedSignedUrl>();

function getCachedSignedUrl(key: string): string | null {
  const entry = signedUrlCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    signedUrlCache.delete(key);
    return null;
  }
  return entry.url;
}

function setCachedSignedUrl(key: string, url: string): void {
  signedUrlCache.set(key, { url, expiresAt: Date.now() + SIGNED_URL_TTL_MS });
}

export function clearSignedUrlCache(): void {
  signedUrlCache.clear();
}

// ---------------------------------------------------------------------------
// Hook principal — resolve URL de mídia de mensagem
// ---------------------------------------------------------------------------

/**
 * Resolve a URL de exibição de uma mídia de mensagem WhatsApp.
 *
 * Para o bucket `whatsapp-media` (público): zero network calls.
 * Para buckets privados: precisa de chamada assíncrona (não implementado aqui).
 *
 * @example
 * const url = useMessageMediaUrl({
 *   mediaBucket: msg.media_bucket,
 *   mediaPath: msg.media_path,
 *   mediaUrl: msg.media_url,
 *   mediaStatus: msg.media_status,
 * });
 * return url ? <img src={url} /> : <MediaPlaceholder />;
 */
export function useMessageMediaUrl(params: {
  mediaBucket?: string | null;
  mediaPath?: string | null;
  mediaUrl?: string | null;
  mediaStatus?: string | null;
}): string | null {
  return useMemo(
    () => resolvePublicMediaUrl(params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.mediaBucket, params.mediaPath, params.mediaUrl, params.mediaStatus]
  );
}

// ---------------------------------------------------------------------------
// Utilitário para listas — resolve um array de mídias sem loop de signed URLs
// ---------------------------------------------------------------------------

/**
 * Resolve URLs de uma lista de mensagens em uma única passagem.
 * Retorna um Map<messageId, resolvedUrl | null>.
 *
 * NÃO faz nenhuma chamada de rede — apenas resolve URLs de buckets públicos.
 * Para buckets privados, os itens retornarão null.
 */
export function resolveMediaUrlBatch(messages: Array<{
  id: string;
  media_bucket?: string | null;
  media_path?: string | null;
  media_url?: string | null;
  media_status?: string | null;
}>): Map<string, string | null> {
  const result = new Map<string, string | null>();
  for (const msg of messages) {
    result.set(msg.id, resolvePublicMediaUrl({
      mediaBucket: msg.media_bucket,
      mediaPath: msg.media_path,
      mediaUrl: msg.media_url,
      mediaStatus: msg.media_status,
    }));
  }
  return result;
}
