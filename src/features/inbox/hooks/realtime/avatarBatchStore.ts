/**
 * avatarBatchStore — Gerencia o carregamento e cache dos avatares do WhatsApp.
 *
 * Problema: Componentes de conversa e chat montam em paralelo e tentam resolver
 * a URL do avatar (`profile_picture_url`) individualmente via RPC no Evolution DB.
 *
 * Solução:
 *  1. Coalesce: Agrupa JIDs solicitados em uma janela de 100ms.
 *  2. Batch RPC: Faz uma única chamada `get_avatars_by_jids_batch(p_jids)`
 *     que retorna `{ jid: url|null }`.
 *  3. Cache: Mantém as URLs em memória (30 min) e propaga via BroadcastChannel
 *     para outras abas evitarem chamadas repetidas.
 *  4. Failover: Se a RPC `get_avatars_by_jids_batch` não existir no banco,
 *     loga em debug e devolve `null` (UI cai no AvatarFallback com iniciais).
 */
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('AvatarBatchStore');

const BATCH_WINDOW_MS = 100;
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutos
const NEGATIVE_TTL_MS = 1000 * 60 * 5; // null persiste por 5 min (não 30) para
// dar chance ao backend popular a foto.
const BC_NAME = 'avatar-updates';
const RPC_NAME = 'get_avatars_by_jids_batch';

interface AvatarCacheEntry {
  url: string | null;
  expiresAt: number;
}

// In-memory cache
const avatarCache = new Map<string, AvatarCacheEntry>();
// JIDs aguardando processamento na janela atual
const pendingJids = new Set<string>();
// Promises de resolução para JIDs em voo
const resolvers = new Map<string, Array<(url: string | null) => void>>();
// Timer da janela de batch
let batchTimer: ReturnType<typeof setTimeout> | null = null;
// Canal de broadcast para sync entre abas
let bc: BroadcastChannel | null = null;

if (typeof window !== 'undefined') {
  try {
    bc = new BroadcastChannel(BC_NAME);
    bc.onmessage = (e) => {
      const { jid, url } = e.data;
      if (jid && url !== undefined) {
        avatarCache.set(jid, {
          url,
          expiresAt: Date.now() + (url ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
        });
        const list = resolvers.get(jid);
        if (list) {
          list.forEach((resolve) => resolve(url));
          resolvers.delete(jid);
        }
      }
    };
  } catch {
    /* BroadcastChannel indisponível */
  }
}

/**
 * Resolve a batch via RPC direta no Supabase consolidado (schema `zapp`).
 * Sempre retorna `Record<jid, url|null>` — falhas são logadas e viram null.
 */
async function fetchAvatarBatch(jids: string[]): Promise<Record<string, string | null>> {
  if (jids.length === 0) return {};

  try {
    const { data, error } = await (supabase.rpc as unknown as (
      name: string,
      params?: Record<string, unknown>
    ) => Promise<{
      data: unknown;
      error: { code?: string; message?: string } | null;
    }>)(RPC_NAME, { p_jids: jids });
    if (error) {
      const isMissing = error.code === '42883' || error.message?.includes('does not exist');
      if (isMissing) {
        log.debug('Avatar batch RPC not available, using fallback avatars');
      } else {
        log.warn('Direct RPC failed', { error: error.message });
      }
      return {};
    }

    // A função retorna TABLE(remote_jid, avatar_url) — normaliza para o
    // contrato do store: Record<jid, url|null>.
    const rows = (Array.isArray(data) ? data : data == null ? [] : [data]) as Array<{
      remote_jid?: unknown;
      avatar_url?: unknown;
    }>;
    const map: Record<string, string | null> = {};
    for (const row of rows) {
      if (row && typeof row.remote_jid === 'string') {
        map[row.remote_jid] =
          typeof row.avatar_url === 'string' && row.avatar_url ? row.avatar_url : null;
      }
    }
    return map;
  } catch (err) {
    log.debug('Direct RPC unavailable for avatars', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

async function processBatch() {
  batchTimer = null;
  const jidsToFetch = Array.from(pendingJids);
  pendingJids.clear();

  if (jidsToFetch.length === 0) return;

  const results = await fetchAvatarBatch(jidsToFetch);

  jidsToFetch.forEach((jid) => {
    const url = results[jid] ?? null;
    resolveJid(jid, url);
    bc?.postMessage({ jid, url });
  });
}

function resolveJid(jid: string, url: string | null) {
  avatarCache.set(jid, {
    url,
    expiresAt: Date.now() + (url ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });
  const list = resolvers.get(jid);
  if (list) {
    list.forEach((resolve) => resolve(url));
    resolvers.delete(jid);
  }
}

/**
 * Solicita a URL do avatar de um contato.
 * Retorna do cache se disponível, caso contrário entra no próximo lote.
 * Nunca lança — falhas viram `null` para o caller renderizar fallback.
 */
/** Returns the avatar URL for a contact JID, using cache when valid; otherwise coalesces into the next batch RPC call (100ms window). Never throws — failures return null. */
export async function getContactAvatar(jid: string): Promise<string | null> {
  if (!jid) return null;

  // 1. Check cache
  const cached = avatarCache.get(jid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // 2. Already in-flight?
  return new Promise((resolve) => {
    const list = resolvers.get(jid) || [];
    list.push(resolve);
    resolvers.set(jid, list);

    if (list.length === 1) {
      // First one to ask: add to pending and schedule flush
      pendingJids.add(jid);
      if (!batchTimer) {
        batchTimer = setTimeout(processBatch, BATCH_WINDOW_MS);
      }
    }
  });
}

/** Pre-popula o cache (usado quando a lista de contatos já traz a URL). */
export function seedAvatarCache(jid: string, url: string | null) {
  if (!jid) return;
  avatarCache.set(jid, {
    url,
    expiresAt: Date.now() + (url ? CACHE_TTL_MS : NEGATIVE_TTL_MS),
  });
}

/** Limpa o cache (para testes ou quando o usuário muda de workspace). */
export function clearAvatarCache() {
  avatarCache.clear();
  resolvers.clear();
  pendingJids.clear();
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
}
