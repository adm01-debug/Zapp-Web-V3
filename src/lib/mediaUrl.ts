/**
 * mediaUrl.ts — Ponto canônico de resolução de URL de mídia
 *
 * REGRA DE OURO (ADR-001):
 *   O banco NUNCA armazena URL absoluta. Armazena bucket + path.
 *   A URL é construída aqui, e SOMENTE aqui.
 *
 * PROBLEMA CORRIGIDO:
 *   O Supabase self-hosted usava http://kong:8000 como URL interna do API
 *   Gateway (rede Docker). O browser não resolve esse hostname →
 *   ERR_NAME_NOT_RESOLVED em produção.
 *
 * SOLUÇÃO:
 *   1. Banco: backfill substituiu kong:8000 pelo host público correto.
 *   2. Backend: trigger bloqueia qualquer novo INSERT/UPDATE com host interno.
 *   3. Frontend (este arquivo): sanitizeMediaUrl() corrige na camada de
 *      apresentação como defesa em profundidade, mesmo que algum dado antigo
 *      chegue via realtime ou cache.
 *
 * FIX WhatsApp 403 (Jul/2026):
 *   URLs do CDN WhatsApp (mmg.whatsapp.net, cdn.whatsapp.net, etc.) expiram
 *   rapidamente e retornam 403. Em vez de retornar null (placeholder vazio),
 *   reescrevemos a URL através do media proxy (zapp-media-proxy.adm01.workers.dev)
 *   que obtém um token novo server-side e serve a mídia.
 */

// ---------------------------------------------------------------------------
// Configuração — NUNCA hardcode http:// ou kong:
// ---------------------------------------------------------------------------

/** URL pública do Supabase self-hosted (AtomicaBR VPS). */
export const SUPABASE_PUBLIC_URL = 'https://supabase.atomicabr.com.br';

/** Base URL para acesso a objetos públicos no Supabase Storage. */
const STORAGE_PUBLIC_BASE = `${SUPABASE_PUBLIC_URL}/storage/v1/object/public`;

/**
 * Media proxy URL para rotear URLs de CDN WhatsApp expiradas.
 * O Cloudflare Worker em zapp-media-proxy.adm01.workers.dev atua como proxy
 * reverso, renovando tokens de acesso às mídias do WhatsApp server-side.
 *
 * Quando uma URL do CDN WhatsApp está expirada (retornando 403),
 * o frontend reescreve a URL para passar pelo proxy, que obtém um
 * token novo e serve a mídia via proxy?url=<encoded_url>.
 */
export const MEDIA_PROXY_URL = 'https://zapp-media-proxy.adm01.workers.dev';

/**
 * Domínios de CDN WhatsApp que devem ser roteados através do media proxy.
 * Esses domínios servem mídia com URLs temporárias que expiram rapidamente.
 */
const WHATSAPP_CDN_PATTERNS = [
  'mmg.whatsapp.net',
  'mmg.whatsapp.com',
  'cdn.whatsapp.net',
  'media.whatsapp.net',
  '.whatsapp.net', // fallback genérico para qualquer subdomínio
] as const;

/**
 * Hosts internos que NUNCA devem chegar ao browser.
 * Se chegarem, sanitizeMediaUrl() os corrige em runtime.
 */
const INTERNAL_HOSTS = [
  /https?:\/\/kong(:\d+)?/i,
  /https?:\/\/localhost(:\d+)?/i,
  /https?:\/\/127\.0\.0\.1(:\d+)?/i,
  /https?:\/\/0\.0\.0\.0(:\d+)?/i,
] as const;

// ---------------------------------------------------------------------------
// Funções públicas
// ---------------------------------------------------------------------------

/**
 * Constrói a URL pública a partir de bucket + path.
 *
 * ⚠️ SOMENTE para buckets deliberadamente públicos (PUBLIC_BUCKETS).
 * Para buckets privados (whatsapp-media, audio-messages, team-chat-files),
 * usar getSignedMediaUrl() de @/lib/storageSignedUrls.
 *
 * @example
 * resolveMediaUrl('avatars', 'image/ABC123.jpg')
 * // → 'https://supabase.atomicabr.com.br/storage/v1/object/public/avatars/image/ABC123.jpg'
 */
export function resolveMediaUrl(bucket: string, path: string): string {
  if (!bucket || !path) return '';
  const cleanPath = path.replace(/^\//, ''); // remove leading slash
  return `${STORAGE_PUBLIC_BASE}/${bucket}/${cleanPath}`;
}

/**
 * Verifica se uma URL é de um domínio do CDN WhatsApp.
 * Inclui mmg.whatsapp.net, cdn.whatsapp.net, media.whatsapp.net, etc.
 */
export function isWhatsAppMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return WHATSAPP_CDN_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Rewrite a WhatsApp CDN URL through the media proxy.
 *
 * O proxy (Cloudflare Worker) recebe a URL original como query param
 * e obtém um token fresco do WhatsApp server-side, servindo a mídia
 * sem expor o token ao browser.
 *
 * @param url - URL original do CDN WhatsApp (ex: https://mmg.whatsapp.net/...)
 * @returns URL reescrita através do proxy, ou a URL original se não for WhatsApp
 *
 * @example
 * proxyMediaUrl('https://mmg.whatsapp.net/o1/v/t24/f2/m233/AQPD...')
 * // → 'https://zapp-media-proxy.adm01.workers.dev/proxy?url=https%3A%2F%2Fmmg.whatsapp.net%2F...'
 */
export function proxyMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isWhatsAppMediaUrl(url)) return url;
  try {
    const encoded = encodeURIComponent(url);
    return `${MEDIA_PROXY_URL}/proxy?url=${encoded}`;
  } catch {
    // Se encodeURIComponent falhar (URL muito malformada), retorna null
    return null;
  }
}

/**
 * Sanitiza qualquer URL de mídia, corrigindo hosts internos em runtime.
 * Defesa em profundidade — garante que URLs com kong:8000 nunca cheguem
 * ao browser mesmo que passem pelo banco ou venham via realtime.
 *
 * URLs do CDN WhatsApp (.enc / mmg.whatsapp.net) são reescritas através
 * do media proxy (zapp-media-proxy.adm01.workers.dev) em vez de retornar
 * null — assim o browser pode exibi-las com token renovado server-side.
 *
 * @returns URL sanitizada (possivelmente via proxy), ou null se inválida.
 */
export function sanitizeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // URLs WhatsApp CDN → reescrever através do media proxy
  // (em vez de retornar null como antes do fix WhatsApp-403)
  if (isWhatsAppMediaUrl(url)) {
    return proxyMediaUrl(url);
  }

  // URLs .enc (criptografadas) → também via proxy
  if (url.includes('.enc?')) {
    return proxyMediaUrl(url);
  }

  // Corrigir host interno → host público
  let sanitized = url;
  for (const pattern of INTERNAL_HOSTS) {
    if (pattern.test(sanitized)) {
      // Substituir apenas o host, manter o path intacto
      sanitized = sanitized.replace(pattern, SUPABASE_PUBLIC_URL);
      // Garantir HTTPS
      sanitized = sanitized.replace(/^http:\/\//, 'https://');
      break;
    }
  }

  return sanitized;
}

/**
 * Detecta se uma URL de mídia é do tipo WhatsApp CDN (inacessível ao browser).
 * URLs .enc são AES-256-CBC criptografadas + expiráveis via parâmetro oe=.
 *
 * @deprecated Use isWhatsAppMediaUrl() para detecção mais abrangente.
 */
export function isWhatsAppCdnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return isWhatsAppMediaUrl(url) || url.includes('.enc?');
}

/**
 * Detecta se uma URL WhatsApp CDN expirou.
 * O parâmetro oe= é um Unix timestamp (hex). Se já passou, a URL é inválida.
 */
export function isWhatsAppUrlExpired(url: string | null | undefined): boolean {
  if (!url) return false;
  const match = url.match(/[?&]oe=([0-9A-Fa-f]+)/);
  if (!match) return false;
  const expiresAt = parseInt(match[1], 16) * 1000; // hex → ms
  return Date.now() > expiresAt;
}

// ---------------------------------------------------------------------------
// Registro de buckets privados vs públicos (ADR-001)
// ---------------------------------------------------------------------------

/**
 * Buckets PÚBLICOS: URL construída via /storage/v1/object/public/...
 * Qualquer outro bucket é PRIVADO e requer signed URL (ver storageSignedUrls.ts).
 *
 * Lista canônica (LGPD 2026-08-01): avatars, stickers, custom-emojis,
 * audio-memes, recibos-entrega — NÃO contêm PII de conversas.
 */
export const PUBLIC_BUCKETS = new Set([
  'audio-memes',
  'avatars',
  'custom-emojis',
  'recibos-entrega',
  'stickers',
]);

export function isBucketPublic(bucket: string): boolean {
  return PUBLIC_BUCKETS.has(bucket);
}

// ---------------------------------------------------------------------------
// Cache negativo em memória — evita retry de URLs que falharam na sessão
// ---------------------------------------------------------------------------

/**
 * Cache negativo: URLs que retornaram 4xx/5xx nesta sessão.
 * Evita o loop de retry que causava os 2-3× repetidos no log.
 */
const negativeCache = new Map<string, { failedAt: number; status: number }>();

/** TTL do cache negativo: 10 minutos por sessão. */
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

/** Registra uma URL como falha. */
export function markMediaUrlFailed(url: string, status: number): void {
  negativeCache.set(url, { failedAt: Date.now(), status });
}

/** Verifica se a URL está no cache negativo e ainda dentro do TTL. */
export function isMediaUrlFailed(url: string): boolean {
  const entry = negativeCache.get(url);
  if (!entry) return false;
  if (Date.now() - entry.failedAt > NEGATIVE_CACHE_TTL_MS) {
    negativeCache.delete(url);
    return false;
  }
  return true;
}

/** Limpa o cache negativo (útil em testes). */
export function clearNegativeCache(): void {
  negativeCache.clear();
}

// ---------------------------------------------------------------------------
// Wrapper para Supabase Storage getPublicUrl
// ---------------------------------------------------------------------------

/**
 * Resolve a URL pública de um objeto do Supabase Storage, aplicando sanitização.
 *
 * Substituição canônica de:
 *   const { data } = supabase.storage.from(bucket).getPublicUrl(path);
 *   return data.publicUrl;
 *
 * Por:
 *   return resolvePublicStorageUrl(bucket, path);
 *
 * Garante que URLs com hosts internos (kong:8000) nunca cheguem ao browser,
 * mesmo em ambientes de desenvolvimento ou após falhas de backfill.
 */
export function resolvePublicStorageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!bucket || !path) return null;
  const url = resolveMediaUrl(bucket, path);
  return sanitizeMediaUrl(url);
}

// ---------------------------------------------------------------------------
// Resolução de URL final — combina tudo
// ---------------------------------------------------------------------------

/**
 * Resolve a URL final de uma mensagem de mídia para exibição no browser.
 * Retorna null se a mídia não for renderizável (expirada, falha).
 *
 * URLs do CDN WhatsApp são automaticamente reescritas através do media proxy
 * (zapp-media-proxy.adm01.workers.dev) em vez de retornar null.
 *
 * Ordem de preferência:
 * 1. media_bucket + media_path (formato novo, canônico)
 * 2. media_url (formato legado, sanitizado + proxy se WhatsApp CDN)
 * 3. null (placeholder)
 */
export function resolveMessageMediaUrl(params: {
  mediaBucket?: string | null;
  mediaPath?: string | null;
  mediaUrl?: string | null;
}): string | null {
  const { mediaBucket, mediaPath, mediaUrl } = params;

  // Formato novo (canônico) — apenas buckets públicos têm URL direta
  if (mediaBucket && mediaPath) {
    if (!isBucketPublic(mediaBucket)) {
      // Bucket privado → signed URL obrigatória (getSignedMediaUrl /
      // useSignedMediaUrlBatch); URL pública retornaria 403 após privatização.
      return null;
    }
    const url = resolveMediaUrl(mediaBucket, mediaPath);
    if (isMediaUrlFailed(url)) return null;
    return url;
  }

  // Formato legado — sanitizar (agora inclui proxy para WhatsApp CDN)
  if (mediaUrl) {
    const sanitized = sanitizeMediaUrl(mediaUrl);
    if (!sanitized) return null; // inválida
    if (isMediaUrlFailed(sanitized)) return null;
    return sanitized;
  }

  return null;
}

/**
 * Resolve a URL de um objeto em um bucket PRIVADO via signed URL (async).
 *
 * Para buckets públicos, use resolveMediaUrl() diretamente.
 * Esta função existe para evitar o padrão silencioso de retornar null
 * quando uma URL pública é gerada para um bucket privado (que retornaria 403).
 *
 * @param supabaseClient - cliente Supabase autenticado (from '@/integrations/supabase/client')
 * @param bucket - nome do bucket (deve ser privado — se público, use resolveMediaUrl())
 * @param path - caminho do objeto dentro do bucket
 * @param expiresIn - TTL em segundos (padrão: 7 dias)
 * @returns URL assinada, ou null com erro logado se falhar
 */
export async function resolvePrivateMediaUrl(
  supabaseClient: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null; error: unknown }> } } },
  bucket: string,
  path: string,
  expiresIn = 604800 // 7 days
): Promise<string | null> {
  if (!bucket || !path) return null;
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    // Surface the error so callers know it wasn't a "no media" case
    console.error(`[mediaUrl] Failed to sign ${bucket}/${path}:`, error);
    return null;
  }
  return data.signedUrl;
}
