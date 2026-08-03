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
// DO NOT replace with a Lovable Cloud project: the real data lives here.
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
      `[Supabase] VITE_SUPABASE_URL aponta para Lovable Cloud (${envUrl}) — IGNORADO. ` +
        `Usando self-hosted: ${SELF_HOSTED_URL}. ` +
        `Corrija .env para evitar confusao.`
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

const makeTimeoutReason = (): unknown =>
  typeof DOMException !== 'undefined'
    ? new DOMException('Supabase request timed out', 'TimeoutError')
    : Object.assign(new Error('Supabase request timed out'), { name: 'TimeoutError' });

const boundedFetch: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(makeTimeoutReason()),
    SUPABASE_FETCH_TIMEOUT_MS,
  );

  const callerSignal = init?.signal ?? undefined;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener(
        'abort',
        () => controller.abort(callerSignal.reason),
        { once: true },
      );
    }
  }

  return fetch(input, { ...init, signal: controller.signal })
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
      throw err;
    })
    .finally(() => clearTimeout(timeoutId));
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

/** Fetch customizado injetado no supabase-js: timeout (boundedFetch) + retry (F9-04). */
export const retryFetch: typeof fetch = (input, init) => {
  if (isAuthRequest(input) || hasStreamBody(init)) {
    // Auth requests nunca devem ser abortados por unmount do React
    // (StrictMode remount abortava o getSession e o supabase-js retentava em loop)
    const { signal: _callerSignal, ...restInit } = init ?? {};
    return boundedFetch(input, restInit as RequestInit).catch((err: unknown) => {
      reportRealFailure(err);
      throw err;
    });
  }

  return withRetry(
    async () => {
      const response = await boundedFetch(input, init);
      if (response.status === 429 || response.status >= 500) {
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
