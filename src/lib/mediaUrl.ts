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
 */

// ---------------------------------------------------------------------------
// Configuração — NUNCA hardcode http:// ou kong:
// ---------------------------------------------------------------------------

/** URL pública do Supabase self-hosted (AtomicaBR VPS). */
export const SUPABASE_PUBLIC_URL = 'https://supabase.atomicabr.com.br';

/** Base URL para acesso a objetos públicos no Supabase Storage. */
const STORAGE_PUBLIC_BASE = `${SUPABASE_PUBLIC_URL}/storage/v1/object/public`;

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
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Verifica se uma URL pertence ao CDN do WhatsApp checando o hostname real.
 * Usar new URL() em vez de includes() evita bypass via path/query injection
 * (ex: https://evil.com/mmg.whatsapp.net passaria no includes mas falha aqui).
 */
function isWhatsAppCdnHost(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname;
    return hostname === 'mmg.whatsapp.net' || hostname.endsWith('.mmg.whatsapp.net');
  } catch {
    // URL malformada — nunca é CDN do WhatsApp
    return false;
  }
}

/**
 * Verifica se uma URL aponta para um arquivo .enc do WhatsApp (mídia encriptada).
 * Usa pathname em vez de includes() para evitar match em query strings de outros domínios.
 */
function isEncryptedWhatsAppFile(rawUrl: string): boolean {
  try {
    const { pathname } = new URL(rawUrl);
    return pathname.endsWith('.enc');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Funções públicas
// ---------------------------------------------------------------------------

/**
 * Constrói a URL pública a partir de bucket + path.
 *
 * @example
 * resolveMediaUrl('whatsapp-media', 'image/ABC123.jpg')
 * // → 'https://supabase.atomicabr.com.br/storage/v1/object/public/whatsapp-media/image/ABC123.jpg'
 */
export function resolveMediaUrl(bucket: string, path: string): string {
  if (!bucket || !path) return '';
  const cleanPath = path.replace(/^\//, ''); // remove leading slash
  return `${STORAGE_PUBLIC_BASE}/${bucket}/${cleanPath}`;
}

/**
 * Sanitiza qualquer URL de mídia, corrigindo hosts internos em runtime.
 * Defesa em profundidade — garante que URLs com kong:8000 nunca cheguem
 * ao browser mesmo que passem pelo banco ou venham via realtime.
 *
 * Também detecta URLs do CDN WhatsApp (.enc / mmg.whatsapp.net) que são
 * inacessíveis ao browser e retorna null para essas.
 *
 * @returns URL sanitizada, ou null se a mídia não for renderizável.
 */
export function sanitizeMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Detectar URLs WhatsApp CDN (não renderizáveis pelo browser)
  if (isWhatsAppCdnHost(url) || isEncryptedWhatsAppFile(url)) {
    return null; // mídia não renderizável — usar placeholder
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
 */
export function isWhatsAppCdnUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return isWhatsAppCdnHost(url) || isEncryptedWhatsAppFile(url);
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
// Resolução de URL final — combina tudo
// ---------------------------------------------------------------------------

/**
 * Resolve a URL final de uma mensagem de mídia para exibição no browser.
 * Retorna null se a mídia não for renderizável (CDN WhatsApp, expirada, falha).
 *
 * Ordem de preferência:
 * 1. media_bucket + media_path (formato novo, canônico)
 * 2. media_url (formato legado, sanitizado)
 * 3. null (placeholder)
 */
export function resolveMessageMediaUrl(params: {
  mediaBucket?: string | null;
  mediaPath?: string | null;
  mediaUrl?: string | null;
}): string | null {
  const { mediaBucket, mediaPath, mediaUrl } = params;

  // Formato novo (canônico)
  if (mediaBucket && mediaPath) {
    const url = resolveMediaUrl(mediaBucket, mediaPath);
    if (isMediaUrlFailed(url)) return null;
    return url;
  }

  // Formato legado
  if (mediaUrl) {
    const sanitized = sanitizeMediaUrl(mediaUrl);
    if (!sanitized) return null; // CDN WhatsApp ou invalida
    if (isMediaUrlFailed(sanitized)) return null;
    return sanitized;
  }

  return null;
}
