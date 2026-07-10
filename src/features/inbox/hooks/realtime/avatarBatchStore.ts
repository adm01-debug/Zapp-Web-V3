/**
 * avatarBatchStore — Gerencia o carregamento e cache dos avatares do WhatsApp.
 *
 * Problema: Componentes de conversa e chat montam em paralelo e tentam resolver
 * a URL do avatar (`profile_picture_url`) individualmente via RPC no FATOR X.
 *
 * Solução:
 *  1. Coalesce: Agrupa JIDs solicitados em uma janela de 100ms.
 *  2. Batch RPC: Faz uma única chamada `get_avatars_by_jids_batch(p_jids)`
 *     que retorna `{ jid: url|null }`.
 *  3. Cache: Mantém as URLs em memória (30 min) e propaga via BroadcastChannel
 *     para outras abas evitarem chamadas repetidas.
 *  4. Failover: Se `VITE_EXTERNAL_SUPABASE_*` não estiver configurada (cliente
 *     direto indisponível), cai para o edge function `external-db-proxy`,
 *     que usa service-role secrets server-side. Esse caminho é o que mantém
 *     as fotos aparecendo em deploys sem env client-side (Lovable preview etc.).
 */
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { queryExternalProxy } from '@/lib/externalProxy';
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
 * Resolve a batch via RPC direta (cliente externo) ou via proxy edge function.
 * Sempre retorna `Record<jid, url|null>` — falhas são logadas e viram null.
 */
async function fetchAvatarBatch(jids: string[]): Promise<Record<string, string | null>> {
  if (jids.length === 0) return {};

  // 1. Caminho rápido: cliente externo direto (env vars presentes)
  if (isExternalConfigured) {
    const client = getExternalSupabase();
    if (client) {
      try {
        const { data, error } = await client.rpc(RPC_NAME, { p_jids: jids });
        if (error) {
          log.warn('Direct RPC failed, falling back to proxy', { error: error.message });
        } else {
          return (data ?? {}) as Record<string, string | null>;
        }
      } catch (err) {
        log.warn('Direct RPC threw, falling back to proxy', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // 2. Fallback servidor-side via edge function (sem dependência de env client).
  //    O proxy normaliza a resposta para `{ data: T[] }` — para uma RPC que
  //    devolve um único objeto jsonb, isso vira `data[0]`.
  try {
    const result = await queryExternalProxy<Record<string, string | null>>({
      action: 'rpc',
      rpc: RPC_NAME,
      params: { p_jids: jids },
    });
    if (result.error) {
      log.error('Proxy RPC error', { error: result.error });
      return {};
    }
    const first = Array.isArray(result.data) ? result.data[0] : result.data;
    return (first ?? {}) as Record<string, string | null>;
  } catch (err) {
    log.error('Proxy RPC threw', {
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
