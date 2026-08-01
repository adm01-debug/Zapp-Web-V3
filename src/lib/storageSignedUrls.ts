/**
 * storageSignedUrls.ts — Resolução de mídia via signed URLs (buckets PRIVADOS)
 *
 * CONTEXTO (LGPD, auditoria 2026-08-01):
 *   Os buckets `whatsapp-media` e `audio-messages` contêm PII (mídia de conversas)
 *   e vão ser PRIVADOS. O frontend NÃO pode mais gerar URLs públicas
 *   (/storage/v1/object/public/...) para eles — só signed URLs temporárias.
 *
 * REGRA DE OURO (ADR-001):
 *   - Buckets deliberadamente públicos (avatars, stickers, custom-emojis,
 *     audio-memes, recibos-entrega) → URL direta, sem assinatura, sem rede.
 *   - Qualquer outro bucket → signed URL via createSignedUrl(), com cache em
 *     memória (Map + TTL) para não re-assinar o mesmo path a cada render.
 *   - Fallback: se a assinatura falhar, retorna a URL pública (os buckets ainda
 *     estão públicos em produção — o fallback preserva o funcionamento atual)
 *     e loga warning para rastrear o motivo (ex.: sessão ausente).
 *
 * SESSÃO (BUG-38, 2026-07-27):
 *   createSignedUrl com cliente anon-only falhava. O cliente de
 *   @/integrations/supabase/client é o MESMO para auth + storage
 *   (persistSession + autoRefreshToken via cookieStorage): quando o usuário
 *   está autenticado, o supabase-js anexa o JWT automaticamente ao
 *   createSignedUrl — não há necessidade de getSession() manual aqui.
 *   Prova: os uploads do repo (useKnowledgeBase, useAudioRecorder,
 *   useAudioManagement, useChatScheduleMessage, externalMessageSender) já
 *   assinam com este cliente em produção.
 *
 * USO:
 *   const url = await getSignedMediaUrl('whatsapp-media', path, 604800);
 *   // Buckets públicos: resolve síncrono com URL direta.
 */

import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { isBucketPublic, resolveMediaUrl } from './mediaUrl';

const log = getLogger('storage-signed-urls');

// ---------------------------------------------------------------------------
// Cache em memória (Map + TTL)
// ---------------------------------------------------------------------------

interface CachedSignedUrl {
  url: string;
  expiresAt: number;
}

/** Cache global de sessão — sobrevive a re-renders, não a reloads. */
const signedUrlCache = new Map<string, CachedSignedUrl>();

/**
 * Margem de segurança antes do TTL real do servidor: re-assina antes de a
 * URL expirar de fato, evitando 403 por clock skew ou latência de rede.
 */
const CACHE_SAFETY_MARGIN_MS = 60_000;

/** Limpa o cache de signed URLs (útil em testes / logout). */
export function clearStorageSignedUrlCache(): void {
  signedUrlCache.clear();
}

// ---------------------------------------------------------------------------
// Helper canônico
// ---------------------------------------------------------------------------

/**
 * Resolve a URL de exibição de um objeto do Supabase Storage.
 *
 * - Bucket PÚBLICO → URL direta (síncrona, sem chamada de rede).
 * - Bucket PRIVADO  → signed URL via createSignedUrl(), com cache Map + TTL.
 *
 * @param bucket - nome do bucket (ex.: 'whatsapp-media', 'audio-messages')
 * @param path   - caminho do objeto dentro do bucket
 * @param ttl    - TTL da signed URL em segundos (padrão: 1h; uploads do repo
 *                 usam 604800 = 7 dias para URLs persistidas no banco)
 * @returns URL assinada, ou fallback para URL pública se a assinatura falhar
 *          (warning logado). Nunca lança.
 */
export async function getSignedMediaUrl(
  bucket: string,
  path: string,
  ttl = 3600
): Promise<string | null> {
  if (!bucket || !path) return null;

  // Buckets deliberadamente públicos → URL direta, zero assinatura
  if (isBucketPublic(bucket)) {
    return resolveMediaUrl(bucket, path);
  }

  const cacheKey = `${bucket}/${path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttl);

    if (error || !data?.signedUrl) {
      log.warn(
        `[storageSignedUrls] Falha ao assinar ${bucket}/${path} — ` +
          'usando URL publica como fallback (bucket ainda publico?). ' +
          'Verificar sessao autenticada: createSignedUrl exige JWT.',
        error ?? 'sem signedUrl no retorno'
      );
      return resolveMediaUrl(bucket, path);
    }

    const expiresAt = Date.now() + ttl * 1000 - CACHE_SAFETY_MARGIN_MS;
    signedUrlCache.set(cacheKey, { url: data.signedUrl, expiresAt });
    return data.signedUrl;
  } catch (err: unknown) {
    log.warn(
      `[storageSignedUrls] Excecao ao assinar ${bucket}/${path} — fallback URL publica.`,
      err
    );
    return resolveMediaUrl(bucket, path);
  }
}
