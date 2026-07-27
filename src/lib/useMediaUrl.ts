/**
 * useMediaUrl.ts — Hook central para resolução de URLs de mídia
 *
 * PRINCÍPIO (ADR-001 + ADR-003 revogando ADR-002):
 *   - Bucket `whatsapp-media` é PRIVADO → signed URL com cache de 50min
 *   - Outros buckets públicos (avatars, stickers) → URL direta, zero signed URL
 *   - Nunca chamar createSignedUrl() em loop (N+1) — usar useSignedMediaUrlBatch
 *
 * SOLUÇÃO PARA N+1:
 *   Em vez de 450 POST /storage/sign por page load, um único
 *   createSignedUrls(allPaths[], 3600) por bucket por render cycle.
 *   Redução: ~450 chamadas → ≤ 1 por bucket.
 *
 * HISTÓRICO DE DECISÃO:
 *   ADR-001: Signed URLs com cache de sessão (arquitetura original)
 *   ADR-002: Tornar whatsapp-media público para eliminar N+1 (26/07/2026)
 *            → REVOGADA: violação LGPD — bucket público expõe PII
 *   ADR-003: Reverter para privado + batch signing (este arquivo)
 */

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeMediaUrl, resolveMediaUrl, isMediaUrlFailed, SUPABASE_PUBLIC_URL } from './mediaUrl';

// ---------------------------------------------------------------------------
// Buckets públicos — não precisam de signed URL
// ---------------------------------------------------------------------------

/**
 * Buckets que são públicos no Supabase Storage.
 * Para esses, a URL é construída diretamente sem nenhuma chamada à API.
 *
 * IMPORTANTE: `whatsapp-media` foi removido daqui em ADR-003.
 * Para adicionar um bucket aqui: garantir que não contém PII (LGPD).
 */
export const PUBLIC_BUCKETS = new Set([
  'avatars',      // fotos de perfil — sempre público
  'stickers',     // figurinhas — sempre público
  'audio-memes',  // sons de notificação — sempre público
  'custom-emojis', // emojis customizados — sempre público
]);

/**
 * Retorna true se o bucket for público e não precisar de signed URL.
 */
export function isPublicBucket(bucket: string): boolean {
  return PUBLIC_BUCKETS.has(bucket);
}

// ---------------------------------------------------------------------------
// Resolução de URL pública (sem network call) — somente buckets públicos
// ---------------------------------------------------------------------------

/**
 * Resolve URL de uma mídia de maneira síncrona e sem network.
 * Prioridade:
 *   1. media_bucket + media_path (formato novo, canônico) — se bucket público
 *   2. media_url sanitizada (formato legado)
 *   3. null → placeholder
 *
 * Para buckets públicos: retorna URL direta.
 * Para buckets privados: retorna null → use useSignedMediaUrlBatch().
 */
export function resolvePublicMediaUrl(params: {
  mediaBucket?: string | null;
  mediaPath?: string | null;
  mediaUrl?: string | null;
  mediaStatus?: string | null;
}): string | null {
  const { mediaBucket, mediaPath, mediaUrl, mediaStatus } = params;

  // Mídia expirada ou falha nunca renderiza
  if (mediaStatus === 'expired' || mediaStatus === 'failed') return null;

  // Formato novo (canônico) — se temos bucket + path
  if (mediaBucket && mediaPath) {
    if (isPublicBucket(mediaBucket)) {
      const url = resolveMediaUrl(mediaBucket, mediaPath);
      return isMediaUrlFailed(url) ? null : url;
    }
    // Bucket privado → caller deve usar useSignedMediaUrlBatch
    return null;
  }

  // Formato legado — sanitizar e retornar
  if (mediaUrl) {
    const sanitized = sanitizeMediaUrl(mediaUrl);
    if (!sanitized) return null; // CDN WhatsApp ou inválida
    if (isMediaUrlFailed(sanitized)) return null;
    if (sanitized.startsWith(SUPABASE_PUBLIC_URL)) return sanitized;
    try {
      const parsed = new URL(sanitized);
      if (parsed.origin === 'https://zapp-media-proxy.adm01.workers.dev') return sanitized;
    } catch { /* invalid URL */ }
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
// Hook de batch signing — resolve URLs privadas em UMA chamada por bucket
// ---------------------------------------------------------------------------

export interface MediaItem {
  id: string;
  media_bucket?: string | null;
  media_path?: string | null;
  media_url?: string | null;
  media_status?: string | null;
}

/**
 * Resolve URLs de uma lista de mensagens de forma eficiente:
 * - Buckets públicos → URL direta (síncrona, sem rede)
 * - Buckets privados → UMA chamada createSignedUrls() por bucket (async)
 *
 * ANTI-PADRÃO RESOLVIDO: Antes, chamávamos createSignedUrl() 1× por item
 * gerando ~450 POSTs por page load. Agora: ≤ 1 POST por bucket por render.
 *
 * @example
 * // No componente que renderiza a lista de conversas:
 * const { signedUrls, loading } = useSignedMediaUrlBatch(messages, supabase);
 * // Em cada MessageBubble:
 * const url = signedUrls.get(msg.id) ?? resolvePublicMediaUrl(msg);
 */
export function useSignedMediaUrlBatch(
  items: MediaItem[],
  supabase: SupabaseClient
): { signedUrls: Map<string, string | null>; loading: boolean } {
  const [signedUrls, setSignedUrls] = useState<Map<string, string | null>>(new Map);
  const [loading, setLoading] = useState(false);

  // Estabilizar a referência dos items para evitar re-fetch desnecessário
  const itemsKey = useMemo(
    () => items.map(i => `${i.media_bucket ?? ''}:${i.media_path ?? ''}`).join('|'),
    [items]
  );

  useEffect(() => {
    // Separar itens que precisam de signed URL (bucket privado + path)
    const privatePaths: Array<{ id: string; bucket: string; path: string }> = [];
    const immediateResult = new Map<string, string | null>();

    for (const item of items) {
      if (!item.media_bucket || !item.media_path) {
        // Tentar formato legado (público)
        immediateResult.set(item.id, resolvePublicMediaUrl(item));
        continue;
      }

      if (isPublicBucket(item.media_bucket)) {
        // Bucket público — URL síncrona
        immediateResult.set(item.id, resolvePublicMediaUrl(item));
        continue;
      }

      // Bucket privado — verificar cache primeiro
      const cacheKey = `${item.media_bucket}/${item.media_path}`;
      const cached = getCachedSignedUrl(cacheKey);
      if (cached) {
        immediateResult.set(item.id, cached);
      } else {
        // Precisa de signed URL
        privatePaths.push({ id: item.id, bucket: item.media_bucket, path: item.media_path });
        immediateResult.set(item.id, null); // placeholder até chegar o signed URL
      }
    }

    // Atualizar imediatamente com o que já temos (sem esperar async)
    setSignedUrls(new Map(immediateResult));

    if (privatePaths.length === 0) return;

    // Agrupar por bucket para minimizar chamadas à API
    const byBucket = new Map<string, Array<{ id: string; path: string }>>();
    for (const item of privatePaths) {
      if (!byBucket.has(item.bucket)) byBucket.set(item.bucket, []);
      byBucket.get(item.bucket)!.push({ id: item.id, path: item.path });
    }

    setLoading(true);

    // UMA createSignedUrls() por bucket — este é o anti-N+1
    const promises = Array.from(byBucket.entries()).map(async ([bucket, pathItems]) => {
      const paths = pathItems.map(p => p.path);
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 3600); // 60min TTL no servidor

      if (error || !data) {
        console.warn(`[useSignedMediaUrlBatch] Erro ao assinar ${paths.length} paths de ${bucket}:`, error);
        return pathItems.map(p => ({ id: p.id, url: null as string | null }));
      }

      return pathItems.map((item, idx) => {
        const signedUrl = data[idx]?.signedUrl ?? null;
        if (signedUrl) {
          // Cachear para 50min
          setCachedSignedUrl(`${bucket}/${item.path}`, signedUrl);
        }
        return { id: item.id, url: signedUrl };
      });
    });

    Promise.all(promises)
      .then(results => {
        setSignedUrls(prev => {
          const next = new Map(prev);
          for (const batch of results) {
            for (const { id, url } of batch) {
              next.set(id, url);
            }
          }
          return next;
        });
      })
      .catch(err => {
        console.error('[useSignedMediaUrlBatch] Erro inesperado:', err);
      })
      .finally(() => setLoading(false));
  }, [itemsKey, supabase]);

  return { signedUrls, loading };
}

// ---------------------------------------------------------------------------
// Hook principal — resolve URL de mídia de uma única mensagem
// ---------------------------------------------------------------------------

/**
 * Resolve a URL de exibição de uma mídia de mensagem WhatsApp.
 *
 * Para buckets públicos (avatars, stickers): zero network calls.
 * Para buckets privados (whatsapp-media): retorna null se não houver
 * signed URL em cache. Use useSignedMediaUrlBatch() no nível da lista.
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
  /** URL pré-resolvida pelo batch (de useSignedMediaUrlBatch) */
  preResolvedSignedUrl?: string | null;
}): string | null {
  return useMemo(() => {
    // Prioridade: URL pré-resolvida pelo batch signer
    if (params.preResolvedSignedUrl) return params.preResolvedSignedUrl;

    // Fallback: resolução pública (funciona para buckets públicos)
    const publicUrl = resolvePublicMediaUrl(params);
    if (publicUrl) return publicUrl;

    // Tentar cache local de signed URL (para buckets privados já carregados)
    if (params.mediaBucket && params.mediaPath && !isPublicBucket(params.mediaBucket)) {
      const cacheKey = `${params.mediaBucket}/${params.mediaPath}`;
      return getCachedSignedUrl(cacheKey);
    }

    return null;
  }, [
    params.mediaBucket,
    params.mediaPath,
    params.mediaUrl,
    params.mediaStatus,
    params.preResolvedSignedUrl,
  ]);
}

// ---------------------------------------------------------------------------
// Utilitário para listas — resolve URL pública de um array de mídias
// ---------------------------------------------------------------------------

/**
 * Resolve URLs públicas de uma lista de mensagens em uma única passagem.
 * Retorna Map<messageId, resolvedUrl | null>.
 *
 * NÃO faz chamadas de rede — apenas resolve URLs de buckets públicos.
 * Para buckets privados (whatsapp-media), use useSignedMediaUrlBatch().
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
