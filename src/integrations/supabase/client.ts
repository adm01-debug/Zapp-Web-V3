import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { ExtendedDatabase } from './types-manual';
import { getLogger } from '@/lib/logger';
import { cookieStorage } from './cookieStorage';
import { withRetry } from '@/lib/retry';

const log = getLogger('supabase-client');

// Re-export so callers that need the specific type can use it
/** Re-exported module members. */
export type { Database, ExtendedDatabase };

// ---------------------------------------------------------------------------
// Self-hosted production Supabase (AtomicaBR VPS)
// This is the authoritative backend for the ZAPP Web platform.
// URL is not a secret — all data access is enforced by RLS.
// The anon key MUST come from VITE_SUPABASE_ANON_KEY or
// VITE_SUPABASE_PUBLISHABLE_KEY environment variables.
// DO NOT add a hardcoded key here — use GitHub Secrets / Vercel env vars.
// DO NOT point VITE_SUPABASE_URL at a Lovable Cloud project: the real data
// lives in this self-hosted instance (production data is authoritative).
// ---------------------------------------------------------------------------
const SELF_HOSTED_URL = 'https://supabase.atomicabr.com.br';

// ---------------------------------------------------------------------------
// Hardened configuration detection
// ---------------------------------------------------------------------------
const PLACEHOLDER_TOKENS = new Set([
  'undefined',
  'null',
  'missing-anon-key',
  'your-anon-key',
  'your-project-url',
  'your-supabase-url',
  'your-supabase-anon-key',
  'your_supabase_url',
  'your_supabase_anon_key',
  'changeme',
  'todo',
]);
const SENTINEL_HOST = 'supabase-unconfigured.invalid';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function isPlaceholder(value: string): boolean {
  return value.length === 0 || PLACEHOLDER_TOKENS.has(value.toLowerCase());
}
function isValidSupabaseUrl(value: unknown): boolean {
  const v = normalize(value);
  if (isPlaceholder(v)) return false;
  if (v.toLowerCase().includes(SENTINEL_HOST)) return false;
  return /^https?:\/\/[^\s]+$/i.test(v);
}
function isValidSupabaseKey(value: unknown): boolean {
  const v = normalize(value);
  if (isPlaceholder(v)) return false;
  return v.length >= 20;
}

const envUrl = import.meta.env.VITE_SUPABASE_URL;
// Suporte a ambos os nomes de variável (GitHub secret: VITE_SUPABASE_PUBLISHABLE_KEY)
const envKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isLovableCloudUrl = typeof envUrl === 'string' && envUrl.includes('.supabase.co');

const SUPABASE_URL = !isLovableCloudUrl && isValidSupabaseUrl(envUrl) ? envUrl : SELF_HOSTED_URL;

// Chave vem EXCLUSIVAMENTE de env vars — sem fallback hardcoded.
// Defina VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) no
// ambiente de deploy (Vercel Dashboard / GitHub Secrets → deploy-vps.yml).
const SUPABASE_ANON_KEY = isValidSupabaseKey(envKey) ? envKey : '';

/** is Supabase Configured. */
export const isSupabaseConfigured =
  isValidSupabaseUrl(SUPABASE_URL) && isValidSupabaseKey(SUPABASE_ANON_KEY);

let warnedUnconfigured = false;
/** warn Supabase Unconfigured. */
export function warnSupabaseUnconfigured(context?: string): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  log.warn(
    '[Supabase] Modo degradado: cliente nao configurado' +
      (context ? ` (origem: ${context})` : '') +
      '. Chamadas de rede desativadas.'
  );
}

if (!isSupabaseConfigured) {
  log.error(
    '[Supabase] URL ou chave invalida — verifique VITE_SUPABASE_URL e ' +
    'VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) no ambiente de deploy.'
  );
} else {
  if (isLovableCloudUrl) {
    log.info(
      `[Supabase] VITE_SUPABASE_URL aponta para um projeto Supabase Cloud (.supabase.co: ${envUrl}) — IGNORADO. ` +
        `Usando self-hosted: ${SELF_HOSTED_URL}. ` +
        `Corrija o .env para apontar para a instância self-hosted.`
    );
  } else if (!isValidSupabaseUrl(envUrl) || !isValidSupabaseKey(envKey)) {
    log.info(
      '[Supabase] Usando URL self-hosted (SELF_HOSTED_URL como fallback). ' +
        'Para remover este aviso, defina VITE_SUPABASE_URL no ambiente de deploy.'
    );
  }
  // Log da URL resolvida sempre (nao so DEV) para facilitar diagnostico em prod
  // eslint-disable-next-line no-console
  console.info(
    `[Supabase] Backend resolvido: ${SUPABASE_URL === SELF_HOSTED_URL ? 'self-hosted (AtomicaBR)' : SUPABASE_URL}`
  );
}


const supabaseUrl = isSupabaseConfigured ? SUPABASE_URL : 'https://supabase-unconfigured.invalid';
const supabaseAnonKey = isSupabaseConfigured ? SUPABASE_ANON_KEY : 'missing-anon-key';

const realtimeReconnectAfterMs = (tries: number): number =>
  Math.min(1000 * 2 ** Math.max(0, tries - 1), 30000);

// ---------------------------------------------------------------------------
// Bounded fetch — nenhuma chamada de rede do Supabase pode pendurar para sempre.
//
// O backend self-hosted normalmente responde em <300ms, mas um edge/proxy
// travado ou uma conexao derrubada pode deixar um request pendente
// indefinidamente. Sem limite, auth.getSession() (que faz single-flight de um
// refresh de token) pendura pela janela inteira do race no app e trava o
// bootstrap de auth. Um timeout via AbortController converte qualquer stall em
// falha rapida e limpa: getSession rejeita, o single-flight e liberado e o
// autoRefreshToken se recupera no proximo tick. Um AbortSignal do caller
// (realtime, aborts por request) e respeitado e encadeado.
// ---------------------------------------------------------------------------
const SUPABASE_FETCH_TIMEOUT_MS = 12_000;

// ---------------------------------------------------------------------------
// Concurrency gate — evita rajadas de >6 requests simultâneos que sufocam
// o backend self-hosted com 429 (Too Many Requests).
//
// Contexto: ao clicar num contato, 15+ hooks React disparam queries Supabase
// em paralelo no mesmo microtask. Sem gate, o backend recebe 15+ requests
// simultâneos → rate-limit (429) → retry → mais pressão → cascata de falhas.
//
// Estratégia: token bucket simples — até MAX_CONCURRENT requests em voo;
// excedente espera em fila com dreno serial (1 por vez). Requests de auth
// (/auth/v1/) nunca são enfileirados (precisam de latência mínima).
//
// Cleanup: beforeunload aborta todos os controllers pendentes para evitar
// memory leak por fetches órfãos em SPAs com navegação rápida.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = 6; // requests simultâneos (não-auth)
const CONCURRENT_DRAIN_DELAY_MS = 80; // ms entre cada dreno da fila

// Cooldown global de rate-limit — após um 429, pausa novas aquisições de
// slot por RATE_LIMIT_COOLDOWN_MS e reduz a concorrência máxima para
// MAX_CONCURRENT_DEGRADED, evitando a cascata de retries que piora o 429.
let _rateLimitCooldownUntil = 0;
const RATE_LIMIT_COOLDOWN_MS = 2000; // 2s global pause after 429
const MAX_CONCURRENT_DEGRADED = 4; // reduced concurrency during cooldown

let _inFlight = 0;
let _queue: Array<() => void> = [];
const _activeControllers = new Set<AbortController>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const ctrl of _activeControllers) {
      try { ctrl.abort(new DOMException('Page unload', 'AbortError')); } catch { /* abort errors expected during page unload */ }
    }
    _activeControllers.clear();
    _queue = [];
    _inFlight = 0;
  }, { once: true });
}

/** Concorrência máxima vigente: reduzida durante o cooldown de rate-limit. */
function _getMaxConcurrent(): number {
  return Date.now() < _rateLimitCooldownUntil ? MAX_CONCURRENT_DEGRADED : MAX_CONCURRENT;
}

function _acquireSlot(): Promise<void> {
  const cooldownRemaining = _rateLimitCooldownUntil - Date.now();
  if (cooldownRemaining > 0) {
    // Espera o cooldown terminar antes de adquirir um slot.
    return new Promise((resolve) => {
      setTimeout(() => {
        _acquireSlotInternal(resolve);
      }, cooldownRemaining + 50);
    });
  }
  return new Promise((resolve) => _acquireSlotInternal(resolve));
}

function _acquireSlotInternal(resolve: () => void): void {
  if (_inFlight < _getMaxConcurrent()) {
    _inFlight++;
    resolve();
  } else {
    _queue.push(resolve);
  }
}

function _releaseSlot(): void {
  _inFlight--;
  // Drena UM item da fila por vez com atraso, para não recriar a rajada.
  // NOTA: _acquireSlotInternal já incrementa _inFlight — NÃO incrementar aqui
  // (double-count causava deadlock quando MAX_CONCURRENT era atingido).
  const next = _queue.shift();
  if (next) {
    setTimeout(() => {
      next();
    }, CONCURRENT_DRAIN_DELAY_MS);
  }
}

const makeTimeoutReason = (): unknown =>
  typeof DOMException !== 'undefined'
    ? new DOMException('Supabase request timed out', 'TimeoutError')
    : Object.assign(new Error('Supabase request timed out'), { name: 'TimeoutError' });

const boundedFetch: typeof fetch = async (input, init) => {
  const _requestUrl = getRequestUrl(input);

  // Auth requests nunca passam pelo concurrency gate — precisam de
  // latência mínima para bootstrap rápido.
  if (!isAuthRequest(input)) {
    await _acquireSlot();
  }

  const controller = new AbortController();
  _activeControllers.add(controller);
  const timeoutId = setTimeout(
    () => controller.abort(makeTimeoutReason()),
    SUPABASE_FETCH_TIMEOUT_MS,
  );

  // BUG FIX (2026-08-03): caller signal chaining causes AbortError retry
  // storms with React StrictMode + postgrest-js internal retry.
  //
  // When React StrictMode double-mounts components, the first render's
  // AbortController is cancelled. The caller's signal propagates into
  // boundedFetch via init.signal, which triggers an AbortError in the
  // fetch. postgrest-js then retries (internal maxRetries=2), each
  // attempt immediately aborted again — exhausting retries with:
  //   "All 2 retries exhausted AbortError: signal is aborted without reason"
  //
  // Fix: strip the caller signal — boundedFetch relies ONLY on its own
  // 12s timeout AbortController. The signal chaining was an optimization
  // to avoid stale state on unmount, but the cost (cascading AbortError
  // storms that kill auth bootstrap, roles fetch, and profile fetch) is
  // far worse than a 12s timeout on abandoned requests.
  const { signal: _callerSignal, ...restInit } = init ?? {};

  // Track slot release on all exit paths (success, error, timeout).
  const release = () => {
    if (!isAuthRequest(input)) _releaseSlot();
  };

  return fetch(input, { ...restInit, signal: controller.signal })
    .then((res) => { release(); return res; })
    .catch((err: unknown) => {
      // Reporta APENAS falhas reais de conectividade: timeout do nosso
      // AbortController (TimeoutError) ou erro de rede (TypeError).
      // Aborts iniciados pelo caller (realtime, navegação) são ignorados
      // para não acusar backend-down falsamente.
      const isRealFailure =
        (err instanceof Error && err.name === 'TimeoutError') ||
        err instanceof TypeError;
      if (isRealFailure) {
        // Avisa o monitor de conectividade para marcar backend-down
        // imediatamente (não espera o próximo heartbeat).
        // Dynamic import evita ciclo de módulos (client → monitor → client).
        void import('./connectivityMonitor')
          .then((m) => m.reportSupabaseRequestFailure(err))
          .catch(() => {});
      }
      release();
      throw err;
    })
    .finally(() => {
      clearTimeout(timeoutId);
      _activeControllers.delete(controller);
    });
};

// ---------------------------------------------------------------------------
// Retry policy (F9-04) — o cliente supabase-js era criado sem qualquer retry:
// uma falha de rede transitória (`TypeError: Failed to fetch`), timeout ou um
// 5xx/429 do backend virava erro imediato no componente. Este wrapper envolve
// o boundedFetch em `withRetry` (src/lib/retry.ts):
//
//   - 3 tentativas no total (1 inicial + 2 retentativas), backoff exponencial
//     ~300ms/600ms (+ jitter ≤500ms, cap 900ms) — suficiente para absorver
//     blips sem mascarar indisponibilidade real nem estourar o SLA de UI;
//   - retenta APENAS falhas transitórias: erro de rede (TypeError), timeout
//     (TimeoutError) e HTTP 429/5xx. Nunca 4xx de negócio (400/401/403/404…);
//   - aborts do caller (navegação, realtime, unmount) NUNCA são retentados;
//   - chamadas de auth (/auth/v1/) passam direto: já cobertas pelo timeout do
//     boundedFetch e pelo single-flight do autoRefreshToken — retry aqui
//     criaria dupla temporização e re-execução de refresh token (F9-04 ação 3);
//   - bodies em stream (ReadableStream) passam direto — não podem ser refeitos;
//   - o monitor de conectividade só é acusado APÓS esgotar as tentativas: uma
//     falha que recuperou no retry não marca backend-down (evita falso positivo).
// ---------------------------------------------------------------------------
const SUPABASE_RETRY_MAX_RETRIES = 2; // 2 retentativas → 3 tentativas totais
const SUPABASE_RETRY_BASE_DELAY_MS = 300;
const SUPABASE_RETRY_MAX_DELAY_MS = 900;

/** Erro sintético para status HTTP retentáveis (429/5xx) — o fetch resolve, não rejeita. */
class RetryableHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Supabase request failed with HTTP ${status}`);
    this.name = 'RetryableHttpError';
    this.status = status;
  }
}

const describeFetchError = (err: unknown): string =>
  err instanceof RetryableHttpError
    ? `HTTP ${err.status}`
    : err instanceof Error
      ? err.message
      : String(err);

const isAbortError = (err: unknown): boolean =>
  err instanceof Error && err.name === 'AbortError';

const getRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

/** Chamadas de auth do supabase-js (bootstrap, refresh token) — fora do retry. */
const isAuthRequest = (input: RequestInfo | URL): boolean =>
  getRequestUrl(input).includes('/auth/v1/');

/** Streams de body não podem ser reenviados — fora do retry. */
const hasStreamBody = (init?: RequestInit): boolean =>
  typeof ReadableStream !== 'undefined' && init?.body instanceof ReadableStream;

/** Política F9-04: só falhas transitórias são retentadas. */
const shouldRetryFetchError = (err: unknown): boolean => {
  if (isAbortError(err)) return false; // abort do caller nunca é retentado
  if (err instanceof TypeError) return true; // falha de rede
  if (err instanceof Error && err.name === 'TimeoutError') return true;
  if (err instanceof RetryableHttpError) return err.status === 429 || err.status >= 500;
  return false;
};

/** Reporta ao monitor de conectividade apenas falhas reais (rede/timeout), nunca aborts. */
function reportRealFailure(err: unknown): void {
  const isRealFailure =
    (err instanceof Error && err.name === 'TimeoutError') || err instanceof TypeError;
  if (!isRealFailure) return;
  // Avisa o monitor de conectividade para marcar backend-down imediatamente
  // (não espera o próximo heartbeat). Dynamic import evita ciclo de módulos
  // (client → monitor → client).
  void import('./connectivityMonitor')
    .then((m) => m.reportSupabaseRequestFailure(err))
    .catch(() => {});
}

/** Pool de concorrência com PRIORIZAÇÃO para o backend Supabase self-hosted.
 *
 * SEM este limitador, o browser abre até 6 conexões simultâneas por domínio
 * (HTTP/1.1). Na inbox com 5+ contatos visíveis, cada um dispara 2+ RPCs
 * (get_contact_360_by_phone + rpc_list_messages_lite), totalizando 10+
 * requisições simultâneas. As que excedem o limite ficam em fila no browser
 * (até 4-6s de latência) enquanto o pool Supabase também pode saturar.
 *
 * O semáforo limita a 4 requisições simultâneas para o backend Supabase,
 * garantindo que as demais aguardam em JS (com timeout curto) em vez de
 * congestionar o pool TCP e o connection pool do Supavisor/Kong.
 *
 * PRIORIZAÇÃO: _acquireSupabaseSlot() aceita opção `priority: 'high'`.
 * Requisições high-priority (ex.: contato selecionado) furam a fila FIFO,
 * garantindo que o usuário veja os dados do contato ativo primeiro.
 *
 * Requisições de auth NUNCA passam pelo semáforo (já são bypass no retryFetch). */
const SUPABASE_MAX_CONCURRENT = 4;
let _supabaseInFlight = 0;
const _supabaseQueue: Array<{ resume: () => void; priority: 'normal' | 'high' }> = [];

// Cleanup on page unload: evita memory leak por promises órfãs
// e garante que a fila não cresça sem limite em SPAs com navegação rápida.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    _supabaseQueue.length = 0;
    _supabaseInFlight = 0;
  }, { once: true });
}

function _acquireSupabaseSlot(opts?: { priority?: 'normal' | 'high' }): Promise<void> {
  const priority = opts?.priority ?? 'normal';
  if (_supabaseInFlight < SUPABASE_MAX_CONCURRENT) {
    _supabaseInFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const entry = {
      resume: () => { _supabaseInFlight++; resolve(); },
      priority,
    };
    if (priority === 'high') {
      // Fura a fila: insere após o último high-priority (antes dos normal).
      // Usa loop reverso manual em vez de findLastIndex() para compatibilidade
      // com Safari < 15.4 / iOS < 15.4 (findLastIndex é ES2023).
      let lastHighIdx = -1;
      for (let i = _supabaseQueue.length - 1; i >= 0; i--) {
        if (_supabaseQueue[i].priority === 'high') {
          lastHighIdx = i;
          break;
        }
      }
      if (lastHighIdx >= 0) {
        _supabaseQueue.splice(lastHighIdx + 1, 0, entry);
      } else {
        _supabaseQueue.unshift(entry);
      }
    } else {
      _supabaseQueue.push(entry);
    }
  });
}

function _releaseSupabaseSlot(): void {
  _supabaseInFlight--;
  const next = _supabaseQueue.shift();
  if (next) next.resume();
}

/** Fetch customizado injetado no supabase-js: timeout (boundedFetch) + retry (F9-04) + semáforo de concorrência. */
export const retryFetch: typeof fetch = async (input, init) => {
  if (isAuthRequest(input) || hasStreamBody(init)) {
    // Auth requests nunca devem ser abortados por unmount do React
    // (StrictMode remount abortava o getSession e o supabase-js retentava em loop)
    const { signal: _callerSignal, ...restInit } = init ?? {};
    return boundedFetch(input, restInit as RequestInit).catch((err: unknown) => {
      reportRealFailure(err);
      throw err;
    });
  }

  // Semáforo: adquire slot antes de disparar a requisição.
  // Evita que 10+ RPCs simultâneas saturem o pool TCP e o Supavisor.
  await _acquireSupabaseSlot();
  try {
    return await withRetry(
      async () => {
        const response = await boundedFetch(input, init);
        if (response.status === 429) {
          // Rate-limit: ativa o cooldown global ANTES do retry para que as
          // demais aquisições de slot esperem e não formem cascata de 429.
          _rateLimitCooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          // Não consumimos o body: a resposta será descartada e refeita.
          throw new RetryableHttpError(response.status);
        }
        if (response.status >= 500) {
          // Não consumimos o body: a resposta será descartada e refeita.
          throw new RetryableHttpError(response.status);
        }
        return response;
      },
      {
        maxRetries: SUPABASE_RETRY_MAX_RETRIES,
        baseDelayMs: SUPABASE_RETRY_BASE_DELAY_MS,
        maxDelayMs: SUPABASE_RETRY_MAX_DELAY_MS,
        shouldRetry: shouldRetryFetchError,
        onRetry: (err, attempt) => {
          log.warn(
            `[Supabase] Tentativa ${attempt}/${SUPABASE_RETRY_MAX_RETRIES} falhou ` +
              `(${describeFetchError(err)}); retentando com backoff`
          );
        },
      },
    ).catch((err: unknown) => {
      // Só acusa o monitor após esgotar as tentativas.
      reportRealFailure(err);
      throw err;
    });
  } finally {
    _releaseSupabaseSlot();
  }
};

// ---------------------------------------------------------------------------
// ZAPP Web client — schema 'zapp' (schema canônico de todas as tabelas)
// ---------------------------------------------------------------------------
/** supabase. */
export const supabase = createClient<ExtendedDatabase, 'zapp'>(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'zapp',
  },
  auth: {
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
  global: {
    fetch: retryFetch,
  },
  realtime: {
    reconnectAfterMs: realtimeReconnectAfterMs,
  },
});

if (!isSupabaseConfigured) {
  const originalChannel = supabase.channel.bind(supabase);
  supabase.channel = ((name: string, opts?: Parameters<typeof originalChannel>[1]) => {
    warnSupabaseUnconfigured('realtime');
    const channel = originalChannel(name, opts);
    channel.subscribe = (() => channel) as typeof channel.subscribe;
    return channel;
  }) as typeof supabase.channel;
}

/** SUPABASE_RESOLVED_URL. */
export const SUPABASE_RESOLVED_URL = supabaseUrl;
/** SUPABASE_RESOLVED_ANON_KEY. */
export const SUPABASE_RESOLVED_ANON_KEY = supabaseAnonKey;
