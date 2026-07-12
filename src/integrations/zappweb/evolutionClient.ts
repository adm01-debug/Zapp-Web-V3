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
 * INTEGRAÇÃO FULL v3 2026-07-06:
 *  - api_key agora resolvida em RUNTIME via edge fn `evolution-credentials`
 *    (JWT do usuário → Vault → header X-Evolution-Key). O secret deixa de
 *    depender de build-time e NUNCA entra no bundle público do Vite.
 *  - VITE_EVOLUTION_API_KEY passa a ser OVERRIDE opcional (emergência /
 *    rotação manual) — produção não exige mais env var no Vercel.
 *  - Cache da key: TTL 55s (< max-age=60 da fn) + jitter, single-flight
 *    (multi-componente/multi-tab não estoura a fn), bust automático em
 *    401/403 (rotação server-side é absorvida no request seguinte).
 *
 * Endpoints cobertos:
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

export interface EvolutionCredentials {
  api_url: string;
  api_key: string;
  instance_name: string;
}

const DEFAULT_URL =
  (import.meta.env.VITE_EVOLUTION_API_URL as string | undefined) ||
  'https://evolution.atomicabr.com.br';

/**
 * OVERRIDE opcional (emergência/rotação manual fora de banda). Quando ausente
 * — o caso padrão em produção — a key é obtida em runtime via edge fn
 * `evolution-credentials` (JWT-gated, Vault-backed). Assim o secret nunca é
 * embutido no bundle público.
 */
const ENV_KEY_OVERRIDE = (import.meta.env.VITE_EVOLUTION_API_KEY as string | undefined) || '';

const DEFAULT_INSTANCE = (import.meta.env.VITE_ZAPPWEB_INSTANCE as string | undefined) || 'wpp2';

// ─── Cache de URL (sem credenciais) ───────────────────────────────────────
const urlCache = new Map<string, { api_url: string; at: number }>();
// TTL base 5 min com ±20% jitter para evitar thundering herd em multi-tab
const URL_TTL_BASE_MS = 5 * 60_000;
function urlTtlWithJitter(): number {
  return URL_TTL_BASE_MS * (0.8 + Math.random() * 0.4);
}

// ─── Cache da api_key (edge fn evolution-credentials) ────────────────────
const KEY_TTL_BASE_MS = 55_000; // < Cache-Control max-age=60 da edge fn
let keyCache: { key: string; at: number } | null = null;
let keyInflight: Promise<string> | null = null;
function keyTtlWithJitter(): number {
  return KEY_TTL_BASE_MS * (0.9 + Math.random() * 0.2);
}

/** Invalida o cache da key (rotação server-side detectada via 401/403). */
function bustKeyCache(): void {
  keyCache = null;
}

async function fetchKeyFromEdge(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    log.warn(
      '[evolutionClient] Sem sessão autenticada — edge fn evolution-credentials indisponível.'
    );
    return '';
  }
  const res = await fetch(`${SUPABASE_RESOLVED_URL}/functions/v1/evolution-credentials`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_RESOLVED_ANON_KEY,
    },
  });
  if (!res.ok) {
    log.warn(`[evolutionClient] evolution-credentials respondeu ${res.status} — key indisponível.`);
    return '';
  }
  const key = res.headers.get('X-Evolution-Key') ?? '';
  if (!key) {
    log.warn(
      '[evolutionClient] evolution-credentials 200 sem header X-Evolution-Key (checar Access-Control-Expose-Headers).'
    );
  }
  return key;
}

/**
 * Resolve a api_key: override de env (se definido) → cache → edge fn
 * (single-flight). Retorna '' quando nenhuma fonte está disponível;
 * evoFetch converte em erro claro para o caller.
 */
async function getEvolutionApiKey(): Promise<string> {
  if (ENV_KEY_OVERRIDE) return ENV_KEY_OVERRIDE;
  if (keyCache && Date.now() - keyCache.at < keyTtlWithJitter()) {
    return keyCache.key;
  }
  if (!keyInflight) {
    keyInflight = fetchKeyFromEdge()
      .then((key) => {
        if (key) keyCache = { key, at: Date.now() };
        return key;
      })
      .catch((err: unknown) => {
        log.warn('[evolutionClient] Falha ao buscar key na edge fn:', err);
        return '';
      })
      .finally(() => {
        keyInflight = null;
      });
  }
  return keyInflight;
}

// ─── Circuit Breaker (auth errors 401/403) ────────────────────────────────
const circuitBreaker = {
  consecutiveAuthErrors: 0,
  openUntil: 0,
  THRESHOLD: 3,
  OPEN_MS: 30 * 60_000, // 30 minutos

  isOpen(): boolean {
    if (Date.now() < this.openUntil) return true;
    if (this.openUntil > 0) {
      // Resetar ao fechar
      this.openUntil = 0;
      this.consecutiveAuthErrors = 0;
      log.info('[evolutionClient] circuit breaker CLOSED — retomando chamadas');
    }
    return false;
  },

  recordError(status: number): void {
    if (status === 401 || status === 403) {
      // Key pode ter sido rotacionada no Vault — próxima tentativa refaz o
      // fetch na edge fn em vez de reutilizar uma key possivelmente morta.
      bustKeyCache();
      this.consecutiveAuthErrors++;
      if (this.consecutiveAuthErrors >= this.THRESHOLD) {
        this.openUntil = Date.now() + this.OPEN_MS;
        log.error(
          `[evolutionClient] circuit breaker OPEN — ${
            this.THRESHOLD
          } erros auth consecutivos. Suspenso por ${this.OPEN_MS / 60000} min.`
        );
      }
    } else {
      // Erros não-auth não contam para o circuit breaker
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

export function stripJid(numberOrJid: string): string {
  return (numberOrJid || '').replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '');
}

/**
 * Retorna credenciais para a instância solicitada.
 *
 * api_url: consultado via `evolution_instances_public` (view segura, sem api_key).
 * api_key: override de env OU runtime via edge fn `evolution-credentials`
 *          (nunca lida do banco pelo browser — REVOKE de 2026-07-05 mantido).
 */
export async function getEvolutionCredentials(
  instance: string = DEFAULT_INSTANCE
): Promise<EvolutionCredentials> {
  const api_key = await getEvolutionApiKey();

  // Cache de URL (sem credenciais)
  const cached = urlCache.get(instance);
  if (cached && Date.now() - cached.at < urlTtlWithJitter()) {
    return { api_url: cached.api_url, api_key, instance_name: instance };
  }

  try {
    // Consulta view SEGURA — sem api_key, sem instance_token (REVOKE aplicado 2026-07-05)
    const { data: rows } = await safeClient.from<{
      instance_name: string;
      api_url: string;
      is_active: boolean;
    }>('evolution_instances_public', (q) =>
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
      return { api_url, api_key, instance_name: instance };
    }
  } catch (err) {
    log.warn('[evolutionClient] Falha ao carregar api_url da BD, usando fallback env:', err);
  }

  return {
    api_url: normalizeUrl(DEFAULT_URL),
    api_key,
    instance_name: instance,
  };
}

async function evoFetch<T>(
  path: string,
  init: RequestInit,
  instance: string = DEFAULT_INSTANCE
): Promise<T> {
  // Circuit breaker check
  if (circuitBreaker.isOpen()) {
    const remainingMin = Math.ceil((circuitBreaker.openUntil - Date.now()) / 60_000);
    log.warn(
      `[evolutionClient] circuit breaker OPEN — bloqueando chamada. Abre em ~${remainingMin}min.`
    );
    throw new Error(
      `Evolution API temporariamente suspensa (circuit breaker aberto). Aguarde ${remainingMin} minutos.`
    );
  }

  const creds = await getEvolutionCredentials(instance);
  if (!creds.api_key) {
    throw new Error(
      'Evolution API key indisponível: sessão expirada/edge fn evolution-credentials inacessível. ' +
        'Refaça o login ou defina VITE_EVOLUTION_API_KEY como override de emergência.'
    );
  }

  const url = `${creds.api_url}${path}`;
  const headers = new Headers(init.headers);
  headers.set('apikey', creds.api_key);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers });

  if (!res.ok) {
    circuitBreaker.recordError(res.status);
    const body = await res.text().catch(() => '');
    const err = Object.assign(new Error(`Evolution API ${res.status}: ${body || res.statusText}`), {
      status: res.status,
    });
    throw err;
  }

  circuitBreaker.recordSuccess();

  try {
    return (await res.json()) as T;
  } catch (err) {
    log.error('[evolutionClient] Falha ao processar JSON de resposta:', err);
    return {} as T;
  }
}

// ─── Mensageria ───────────────────────────────────────────────────────────

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

export async function sendMedia(
  params: {
    number: string;
    mediatype: 'image' | 'video' | 'document';
    media: string; // URL pública
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
 * Guarda-se contra circuit breaker aberto — retorna 'unknown' nesse caso.
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

export async function fetchInstances(instance: string = DEFAULT_INSTANCE) {
  return evoFetch<unknown[]>('/instance/fetchInstances', { method: 'GET' }, instance);
}