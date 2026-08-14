/**
 * Zap Webb — Evolution API Client (ESCRITA / envio)
 *
 * SECURITY FIX 2026-07-05 (auditoria Claude):
 *  - api_key REMOVIDA da leitura via PostgREST (REVOKE aplicado no DB).
 *  - DB consultado apenas para api_url e health_status via view segura
 *    `evolution_instances_public` (sem api_key, sem instance_token).
 *  - Circuit breaker: 3 erros 401/403 consecutivos → suspende 30 min.
 *  - Jitter no TTL de cache: evita thundering herd em multi-tab.
 *
 * SECURITY FIX 2026-08-14 — Phase 6 Desacoplamento:
 *  - api_key NUNCA chega ao browser (nem via header X-Evolution-Key).
 *  - evoFetch() agora chama edge fn `evolution-proxy` (server-side):
 *    JWT do usuário → proxy valida → Evolution API server-side.
 *  - Browser não conhece nem a URL nem a key da Evolution API.
 *  - CORS entre zapp.atomicabr.com.br e evolution.atomicabr.com.br pode
 *    ser removido após validação desta versão em produção.
 *
 * Endpoints cobertos (proxied server-side via evolution-proxy):
 *  - POST /message/sendText/{instance}
 *  - POST /message/sendMedia/{instance}
 *  - POST /message/sendWhatsAppAudio/{instance}
 *  - PUT  /chat/markChatUnread/{instance}
 *  - GET  /instance/fetchInstances
 *  - GET  /instance/connectionState/{instance}
 */
import { safeClient } from '@/integrations/supabase/safeClient';
import {
  supabase,
  SUPABASE_RESOLVED_URL,
  SUPABASE_RESOLVED_ANON_KEY,
} from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

/** Evolution Credentials interface definition. */
export interface EvolutionCredentials {
  api_url: string;
  /** @deprecated - key nunca retorna ao browser após Phase 6; sempre string vazia */
  api_key: string;
  instance_name: string;
}

const DEFAULT_INSTANCE = (import.meta.env.VITE_ZAPPWEB_INSTANCE as string | undefined) || 'wpp2';

// ─── Cache de URL da instância (sem credenciais) ──────────────────────────
const urlCache = new Map<string, { api_url: string; at: number }>();
const URL_TTL_BASE_MS = 5 * 60_000;
function urlTtlWithJitter(): number {
  return URL_TTL_BASE_MS * (0.8 + Math.random() * 0.4);
}

// ─── Circuit Breaker (auth errors 401/403) ────────────────────────────────
const circuitBreaker = {
  consecutiveAuthErrors: 0,
  openUntil: 0,
  THRESHOLD: 3,
  OPEN_MS: 30 * 60_000,

  isOpen(): boolean {
    if (Date.now() < this.openUntil) return true;
    if (this.openUntil > 0) {
      this.openUntil = 0;
      this.consecutiveAuthErrors = 0;
      log.info('[evolutionClient] circuit breaker CLOSED — retomando chamadas');
    }
    return false;
  },

  recordError(status: number): void {
    if (status === 401 || status === 403) {
      this.consecutiveAuthErrors++;
      if (this.consecutiveAuthErrors >= this.THRESHOLD) {
        this.openUntil = Date.now() + this.OPEN_MS;
        log.error(
          `[evolutionClient] circuit breaker OPEN — ${this.THRESHOLD} erros auth consecutivos. Suspenso por ${this.OPEN_MS / 60000} min.`
        );
      }
    } else {
      this.consecutiveAuthErrors = 0;
    }
  },

  recordSuccess(): void {
    this.consecutiveAuthErrors = 0;
  },
};

function normalizeUrl(url: string): string {
  let u = (url || '').trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
}

/** strip Jid function. */
export function stripJid(numberOrJid: string): string {
  return (numberOrJid || '').replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
}

interface EvolutionInstancePublicRow {
  instance_name: string;
  api_url: string | null;
  is_active: boolean;
}

/**
 * Retorna URL da instância (sem api_key — nunca exposta ao browser).
 * api_key retorna string vazia para compatibilidade de interface.
 */
export async function getEvolutionCredentials(
  instance: string = DEFAULT_INSTANCE
): Promise<EvolutionCredentials> {
  const cached = urlCache.get(instance);
  if (cached && Date.now() - cached.at < urlTtlWithJitter()) {
    return { api_url: cached.api_url, api_key: '', instance_name: instance };
  }

  try {
    const { data: rows } = await safeClient.from<EvolutionInstancePublicRow>(
      'evolution_instances_public',
      (q) =>
        q
          .select('instance_name, api_url, is_active')
          .eq('instance_name', instance)
          .eq('is_active', true)
          .limit(1)
    );
    const data = rows?.[0] ?? null;

    if (data?.api_url) {
      const api_url = normalizeUrl(data.api_url);
      urlCache.set(instance, { api_url, at: Date.now() });
      return { api_url, api_key: '', instance_name: instance };
    }
  } catch (err) {
    log.warn('[evolutionClient] Falha ao carregar api_url da BD:', err);
  }

  return {
    api_url: normalizeUrl(SUPABASE_RESOLVED_URL), // fallback inócuo; proxy não usa api_url do browser
    api_key: '',
    instance_name: instance,
  };
}

/**
 * evoFetch — todas as chamadas vão via evolution-proxy (edge fn server-side).
 * A Evolution API key NUNCA sai do servidor.
 */
async function evoFetch<T>(
  path: string,
  init: RequestInit,
  _instance: string = DEFAULT_INSTANCE
): Promise<T> {
  if (circuitBreaker.isOpen()) {
    const remainingMin = Math.ceil((circuitBreaker.openUntil - Date.now()) / 60_000);
    log.warn(
      `[evolutionClient] circuit breaker OPEN — bloqueando chamada. Abre em ~${remainingMin}min.`
    );
    throw new Error(
      `Evolution API temporariamente suspensa (circuit breaker aberto). Aguarde ${remainingMin} minutos.`
    );
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('[evolutionClient] Sem sessão autenticada — evolution-proxy indisponível.');
  }

  // Parsear o body antes de re-serializar no envelope do proxy
  let parsedBody: unknown = undefined;
  if (init.body) {
    try {
      parsedBody = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    } catch {
      parsedBody = init.body;
    }
  }

  const proxyUrl = `${SUPABASE_RESOLVED_URL}/functions/v1/evolution-proxy`;
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_RESOLVED_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: init.method ?? 'POST',
      path,
      ...(parsedBody !== undefined ? { body: parsedBody } : {}),
    }),
  });

  if (!res.ok) {
    circuitBreaker.recordError(res.status);
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`Evolution proxy ${res.status}: ${body || res.statusText}`), {
      status: res.status,
    });
  }

  circuitBreaker.recordSuccess();

  try {
    return (await res.json()) as T;
  } catch (err) {
    log.error('[evolutionClient] Falha ao processar JSON de resposta do proxy:', err);
    return {} as T;
  }
}

// ─── Mensageria ───────────────────────────────────────────────────────────

/** send Text function. */
export async function sendText(number: string, text: string, instance: string = DEFAULT_INSTANCE) {
  return evoFetch(
    `/message/sendText/${instance}`,
    {
      method: 'POST',
      body: JSON.stringify({ number: stripJid(number), text }),
    },
    instance
  );
}

/** send Media function. */
export async function sendMedia(
  params: {
    number: string;
    mediatype: 'image' | 'video' | 'document';
    media: string;
    caption?: string;
    fileName?: string;
  },
  instance: string = DEFAULT_INSTANCE
) {
  return evoFetch(
    `/message/sendMedia/${instance}`,
    {
      method: 'POST',
      body: JSON.stringify({ ...params, number: stripJid(params.number) }),
    },
    instance
  );
}

/** send Whats App Audio function. */
export async function sendWhatsAppAudio(
  number: string,
  audioUrl: string,
  instance: string = DEFAULT_INSTANCE
) {
  return evoFetch(
    `/message/sendWhatsAppAudio/${instance}`,
    {
      method: 'POST',
      body: JSON.stringify({ number: stripJid(number), audio: audioUrl }),
    },
    instance
  );
}

/** mark Chat Read function. */
export async function markChatRead(number: string, instance: string = DEFAULT_INSTANCE) {
  return evoFetch(
    `/chat/markChatUnread/${instance}`,
    {
      method: 'PUT',
      body: JSON.stringify({ number: stripJid(number), unread: false }),
    },
    instance
  );
}

// ─── Status ──────────────────────────────────────────────────────────────

/**
 * Verifica o estado de conexão da instância.
 */
export async function getConnectionState(
  instance: string = DEFAULT_INSTANCE
): Promise<{ state: string; source: 'api' | 'circuit_open' | 'error' }> {
  if (circuitBreaker.isOpen()) {
    return { state: 'unknown', source: 'circuit_open' };
  }
  try {
    const data = await evoFetch<{ instance?: { state?: string }; state?: string }>(
      `/instance/connectionState/${instance}`,
      { method: 'GET' },
      instance
    );
    const state = data?.instance?.state ?? data?.state ?? 'unknown';
    return { state, source: 'api' };
  } catch (err) {
    log.warn('[evolutionClient] getConnectionState falhou:', err);
    return { state: 'error', source: 'error' };
  }
}

/** fetch Instances function. */
export async function fetchInstances(instance: string = DEFAULT_INSTANCE) {
  return evoFetch<unknown[]>('/instance/fetchInstances', { method: 'GET' }, instance);
}
