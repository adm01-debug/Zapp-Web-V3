/**
 * Monitor singleton de conectividade com o backend Supabase.
 *
 * Detecta dois cenários distintos de perda de conectividade:
 *  1. Browser offline        → `'offline'`       (eventos window online/offline)
 *  2. Backend inacessível    → `'backend-down'`  (browser online, mas o servidor
 *     Supabase não responde: rede bloqueada, VPS fora do ar, DNS/Kong/proxy down)
 *
 * O caso 2 NÃO é coberto por `navigator.onLine` e era o buraco do F19: o app
 * ficava mudo quando o Supabase caía. O monitor faz um heartbeat periódico em
 * `${SUPABASE_RESOLVED_URL}/auth/v1/health` com timeout curto e considera
 * "alcançável" QUALQUER resolução do fetch. O probe usa `mode: 'no-cors'` SEM
 * headers custom (GET simples, sem preflight CORS): a resposta é opaca (status
 * 0, invisível para o JS), mas se o fetch resolveu, a rede/back-end respondeu,
 * logo a infraestrutura está de pé. Só um `TypeError` (falha real de
 * rede/DNS/timeout/abort — ou seja, nada respondeu) marca `'backend-down'`.
 *
 * Arquitetura:
 *  - Singleton com pub/sub — N componentes podem consumir o mesmo estado sem
 *    multiplicar pings.
 *  - Heartbeat inicia com o 1º subscriber e para com o último (não fica
 *    pingando em página de login isolada).
 *  - `reportSupabaseRequestFailure()` permite que o `boundedFetch` do client
 *    acuse falha real de request e acelere a detecção (em vez de esperar o
 *    próximo heartbeat).
 *  - URL/chave resolvidas via dynamic import de `./client` para evitar ciclo
 *    de módulos (client.ts → monitor → client.ts).
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('supabase-connectivity');

export type SupabaseConnectivityStatus = 'online' | 'offline' | 'backend-down';

export interface SupabaseConnectivityInfo {
  lastCheckedAt: number | null;
  latencyMs: number | null;
}

export type SupabaseConnectivityListener = (
  status: SupabaseConnectivityStatus,
  info: SupabaseConnectivityInfo
) => void;

// Polling consolidado (FIX onda-bugs-console-v1): heartbeat a cada 60s
// (antes 20s — o log de produção mostrava ~60s) e PAUSA quando a aba está
// oculta (visibilitychange): nada de health check em background.
const HEARTBEAT_INTERVAL_MS = 60_000;
const PING_TIMEOUT_MS = 6_000;
/** Debounce mínimo entre pings espontâneos (retry explícito ignora). */
const MIN_PING_INTERVAL_MS = 60_000;

let status: SupabaseConnectivityStatus = 'online';
let lastCheckedAt: number | null = null;
let latencyMs: number | null = null;
let browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let visibilityHandlerAttached = false;
let listenerCount = 0;
let pingInFlight = false;
let lastPingAt = 0;
const listeners = new Set<SupabaseConnectivityListener>();

function notifyListeners(): void {
  const info: SupabaseConnectivityInfo = { lastCheckedAt, latencyMs };
  listeners.forEach((listener) => {
    try {
      listener(status, info);
    } catch (err) {
      log.warn('Listener de conectividade lançou erro', err);
    }
  });
}

function setStatus(next: SupabaseConnectivityStatus): void {
  if (status === next) return;
  status = next;
  log.info(`[Supabase] Conectividade: ${status}`);
  notifyListeners();
}

/** Status atual (leitura síncrona para estado inicial do hook). */
export function getSupabaseConnectivityStatus(): SupabaseConnectivityStatus {
  return status;
}

/** Última checagem (síncrona). */
export function getSupabaseConnectivityInfo(): SupabaseConnectivityInfo {
  return { lastCheckedAt, latencyMs };
}

/**
 * Pinga o health endpoint do Supabase.
 * @param force — ignora o debounce (usado em retry explícito do usuário).
 * @returns true se o fetch resolveu (qualquer resposta, inclusive opaca do
 * `mode: 'no-cors'`, significa backend alcançável; status HTTP não é legível
 * com no-cors e não importa para o health probe).
 */
export async function pingSupabaseBackend(force = false): Promise<boolean> {
  const now = Date.now();
  if (!force && now - lastPingAt < MIN_PING_INTERVAL_MS) {
    return status === 'online';
  }
  if (pingInFlight) return status === 'online';
  lastPingAt = now;
  pingInFlight = true;

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    let url = 'https://supabase.atomicabr.com.br';
    try {
      const mod = await import('./client');
      url = mod.SUPABASE_RESOLVED_URL;
    } catch {
      // fallback mantém o ping funcional mesmo se o client não carregar
    }

    // GET simples com mode 'no-cors': NENHUM header custom (nem apikey, nem
    // Accept — Accept fica no default do browser), então o browser NÃO dispara
    // preflight CORS. Com no-cors a resposta é opaca (status 0, corpo
    // invisível), mas isso não importa para o health probe: se o fetch
    // RESOLVEU, a rede/back-end respondeu (Kong de pé, mesmo que ainda
    // reiniciando rotas) = alcançável. TypeError só ocorre em falha real de
    // rede/DNS/timeout. Isso elimina o falso backend-down de produção causado
    // pelo preflight do header apikey durante o restart do Kong.
    await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });

    // Fetch resolveu = backend alcançável (resposta opaca não expõe status
    // HTTP — irrelevante para o health probe: qualquer resposta, inclusive
    // 401/opaca, significa que o Kong respondeu e a infraestrutura está de pé).
    latencyMs = Date.now() - started;
    lastCheckedAt = Date.now();
    setStatus(browserOnline ? 'online' : 'offline');
    return true;
  } catch {
    // Timeout, DNS falhou, conexão recusada, rede caiu → backend inacessível.
    latencyMs = Date.now() - started;
    lastCheckedAt = Date.now();
    setStatus(browserOnline ? 'backend-down' : 'offline');
    return false;
  } finally {
    clearTimeout(timer);
    pingInFlight = false;
  }
}

/**
 * Acusação de falha real de request vinda do `boundedFetch` do client.
 * Acelera a detecção: em vez de esperar o heartbeat (até 20s), marca
 * `'backend-down'` na hora e agenda um re-ping para confirmar.
 */
export function reportSupabaseRequestFailure(_error?: unknown): void {
  if (!browserOnline) {
    setStatus('offline');
    return;
  }
  if (status !== 'backend-down') {
    setStatus('backend-down');
  }
  // Re-checagem imediata (sem debounce) para confirmar/desmentir a falha.
  void pingSupabaseBackend(true).catch(() => {});
}

/** Retry explícito (botão "Tentar novamente" da UI). */
export function retrySupabaseConnectivityCheck(): Promise<boolean> {
  return pingSupabaseBackend(true);
}

function handleBrowserOffline(): void {
  browserOnline = false;
  setStatus('offline');
}

function handleBrowserOnline(): void {
  browserOnline = true;
  // Rede voltou — confirma se o backend também voltou antes de declarar online.
  void pingSupabaseBackend(true).catch(() => {});
}

/**
 * Aba oculta → PAUSA o heartbeat (nada de ping em background); voltou a ficar
 * visível → re-checa na hora (respeitando o debounce mínimo de 60s via
 * pingSupabaseBackend sem force) e retoma o intervalo se estava pausado.
 */
function handleVisibilityChange(): void {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') {
    void pingSupabaseBackend().catch(() => {});
    if (!heartbeatTimer) startHeartbeatInterval();
  } else if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function attachVisibilityListener(): void {
  if (visibilityHandlerAttached || typeof document === 'undefined') return;
  visibilityHandlerAttached = true;
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

function detachVisibilityListener(): void {
  if (!visibilityHandlerAttached) return;
  visibilityHandlerAttached = false;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function startHeartbeatInterval(): void {
  if (heartbeatTimer) return;
  // Aba oculta no boot: não inicia o intervalo (visibilitychange retoma).
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  heartbeatTimer = setInterval(() => {
    void pingSupabaseBackend().catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
}

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  if (typeof window !== 'undefined') {
    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('online', handleBrowserOnline);
  }
  attachVisibilityListener();
  startHeartbeatInterval();
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('offline', handleBrowserOffline);
    window.removeEventListener('online', handleBrowserOnline);
  }
  detachVisibilityListener();
}

/**
 * Assina mudanças de conectividade. Inicia o heartbeat no 1º subscriber e
 * para no último. Retorna unsubscribe.
 */
export function subscribeSupabaseConnectivity(
  listener: SupabaseConnectivityListener
): () => void {
  listeners.add(listener);
  listenerCount += 1;
  if (listenerCount === 1) startHeartbeat();
  return () => {
    listeners.delete(listener);
    listenerCount = Math.max(0, listenerCount - 1);
    if (listenerCount === 0) stopHeartbeat();
  };
}

/** Reset completo — apenas para testes (vitest). */
export function __resetSupabaseConnectivityForTests(): void {
  stopHeartbeat();
  listeners.clear();
  listenerCount = 0;
  status = 'online';
  lastCheckedAt = null;
  latencyMs = null;
  browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  pingInFlight = false;
  lastPingAt = 0;
}
