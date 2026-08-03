/**
 * Build-version watcher.
 *
 * Compares the build id embedded at compile time (`__APP_BUILD_ID__`, injected
 * via vite `define`) against `/version.json` served alongside the deployed
 * bundle. When they diverge — i.e. a new deploy is live but the tab is still
 * running old JS — we purge Cache Storage, unregister every service worker
 * scoped to the origin and force a hard reload so the next paint uses the new
 * bundle.
 *
 * This is a defensive complement to `useServiceWorker` (which only handles the
 * push-only SW lifecycle): even without a controlling SW, browsers and CDNs
 * can serve stale HTML/JS after a deploy — this watcher closes that gap.
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('buildVersion');

// Injected by vite (see vite.config.ts → define). Falls back to 'dev' when the
// bundle is served directly from the Vite dev server without the define pass.
declare const __APP_BUILD_ID__: string;
const CURRENT_BUILD_ID: string =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

const VERSION_URL = '/version.json';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const RELOAD_STATE_KEY = 'zapp-build-reload-state';
const SW_PURGE_FLAG = 'zapp-workbox-purged-once';
const GLOBAL_RELOAD_COUNT_KEY = 'zapp-build-global-reload-count';
const GLOBAL_RELOAD_FIRST_AT_KEY = 'zapp-build-global-reload-first-at';

// Cota de reloads por alvo: até 2 hard reloads para o MESMO targetBuildId,
// dentro de uma janela de 10min desde a primeira tentativa. Um deploy novo
// (targetBuildId diferente) zera o contador — sem isso, 2 deploys seguidos na
// mesma sessão deixariam o mismatch genuíno abortado para sempre.
const MAX_RELOADS_PER_TARGET = 2;
const RELOAD_WINDOW_MS = 10 * 60 * 1000;

// Cota GLOBAL de reloads (qualquer target): no máximo 3 reloads em 15min.
// Evita o cenário onde múltiplos deploys em sequência causam reloads em cascata
// que matam requisições auth em voo (AbortError cascade) e sufocam o backend
// com 429s (cada reload re-dispara 15+ queries simultâneas).
const MAX_GLOBAL_RELOADS = 5;
const GLOBAL_RELOAD_WINDOW_MS = 15 * 60 * 1000;

interface ReloadState {
  targetBuildId: string;
  attempts: number;
  firstAttemptAt: number;
}

let started = false;
let intervalId: ReturnType<typeof setInterval> | undefined;
let workboxChecked = false;

/**
 * Detect Workbox precache entries in CacheStorage (fonte confiavel — nao depende
 * do conteudo servido de /sw.js, que pode vir de cache de CDN). Se detectado,
 * purga tudo e forca reload uma unica vez.
 */
async function detectAndPurgeStaleWorkboxSW(): Promise<void> {
  if (workboxChecked) return;
  workboxChecked = true;
  try {
    if (typeof caches === 'undefined') return;
    const keys = await caches.keys();
    const hasWorkbox = keys.some((k) => /^workbox-(precache|runtime)/i.test(k));
    if (!hasWorkbox) return;
    log.warn('[buildVersion] Workbox cache entries detected — purging.', keys);
    // One-shot isolado: o flag é gravado pelo forceBundleRefresh quando chamado
    // SEM targetBuildId (registro isolado), para não consumir a cota de mismatch.
    const already = sessionStorage.getItem(SW_PURGE_FLAG) === '1';
    if (already) return;
    await forceBundleRefresh('stale-workbox-cache');
  } catch {
    workboxChecked = false;
  }
}

async function purgeClientCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* noop */
  }
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* noop */
  }
}

function readReloadState(): ReloadState | null {
  try {
    const raw = sessionStorage.getItem(RELOAD_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReloadState;
    if (
      typeof parsed?.attempts !== 'number' ||
      typeof parsed.targetBuildId !== 'string' ||
      typeof parsed.firstAttemptAt !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Decide se um reload é permitido e, se for, grava a tentativa.
 *
 * - Com targetBuildId (mismatch genuíno de version.json/SW): registro
 *   estruturado em `zapp-build-reload-state`, cota de 2 reloads por alvo com
 *   expiração de 10min. Alvo diferente → contador zera.
 * - Sem targetBuildId (ex.: purge de workbox stale): registro ISOLADO
 *   one-shot (`zapp-workbox-purged-once`) que não contamina a cota de mismatch.
 *
 * AMBAS as cotas são limitadas por uma cota GLOBAL de sessionStorage:
 * no máximo MAX_GLOBAL_RELOADS reloads em GLOBAL_RELOAD_WINDOW_MS,
 * independente do target. Isto evita que múltiplos deploys em sequência
 * casem reloads em cascata que matam requisições auth (AbortError) e
 * sufocam o backend com 429s.
 *
 * Retorna false quando qualquer cota foi excedida (abort — sem purge, sem reload).
 */
function acquireReloadQuota(targetBuildId?: string): boolean {
  // ── Cota GLOBAL (qualquer target) ──────────────────────────────────
  const now = Date.now();
  try {
    const globalFirstAtRaw = sessionStorage.getItem(GLOBAL_RELOAD_FIRST_AT_KEY);
    const globalFirstAt = globalFirstAtRaw ? Number(globalFirstAtRaw) : 0;
    const globalCountRaw = sessionStorage.getItem(GLOBAL_RELOAD_COUNT_KEY);
    const globalCount = globalCountRaw ? Number(globalCountRaw) : 0;

    if (globalFirstAt > 0 && now - globalFirstAt > GLOBAL_RELOAD_WINDOW_MS) {
      // Janela expirada — zera contador global.
      sessionStorage.setItem(GLOBAL_RELOAD_FIRST_AT_KEY, String(now));
      sessionStorage.setItem(GLOBAL_RELOAD_COUNT_KEY, '0');
    } else if (globalCount >= MAX_GLOBAL_RELOADS) {
      log.error(
        '[buildVersion] Global reload quota exhausted ' +
          `(${globalCount}/${MAX_GLOBAL_RELOADS} in ${Math.round((now - globalFirstAt) / 1000)}s) — ` +
          'aborting to avoid cascade.'
      );
      window.dispatchEvent(
        new CustomEvent('zapp-update-required', {
          detail: { current: CURRENT_BUILD_ID, remote: targetBuildId ?? 'unknown', reason: 'global-quota' },
        }),
      );
      return false;
    }
  } catch {
    /* storage full / disabled — proceed */
  }

  if (!targetBuildId) {
    try {
      if (sessionStorage.getItem(SW_PURGE_FLAG) === '1') return false;
      sessionStorage.setItem(SW_PURGE_FLAG, '1');
    } catch {
      /* storage full / disabled — reload anyway */
    }
    _bumpGlobalReloadCount();
    return true;
  }

  let state = readReloadState();
  if (
    !state ||
    state.targetBuildId !== targetBuildId ||
    now - state.firstAttemptAt > RELOAD_WINDOW_MS
  ) {
    // Primeira tentativa para este alvo (ou registro expirado) — zera contador.
    state = { targetBuildId, attempts: 0, firstAttemptAt: now };
  }
  if (state.attempts >= MAX_RELOADS_PER_TARGET) {
    window.dispatchEvent(
      new CustomEvent('zapp-update-required', {
        detail: { current: CURRENT_BUILD_ID, remote: targetBuildId, reason: 'per-target-quota' },
      }),
    );
    return false;
  }
  state.attempts += 1;
  try {
    sessionStorage.setItem(RELOAD_STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / disabled — reload anyway */
  }
  _bumpGlobalReloadCount();
  return true;
}

/** Incrementa o contador global de reloads (sessionStorage). */
function _bumpGlobalReloadCount(): void {
  try {
    const raw = sessionStorage.getItem(GLOBAL_RELOAD_COUNT_KEY);
    const count = raw ? Number(raw) : 0;
    sessionStorage.setItem(GLOBAL_RELOAD_COUNT_KEY, String(count + 1));
    if (!sessionStorage.getItem(GLOBAL_RELOAD_FIRST_AT_KEY)) {
      sessionStorage.setItem(GLOBAL_RELOAD_FIRST_AT_KEY, String(Date.now()));
    }
  } catch { /* noop */ }
}

/**
 * Wipe caches + SW and force a hard reload. Guarded so a broken deploy cannot
 * pin the tab in an infinite reload loop: a per-target quota (2 reloads, 10min
 * window) bails out and surfaces a `zapp-update-required` event instead of
 * purging/unregistering blindly.
 *
 * A decisão de cota acontece ANTES de qualquer purge — no abort não
 * desregistramos SWs nem limpamos caches (evita o ciclo unregister →
 * re-register → activate que gerava spam de logs e deixava o app morto).
 */
export async function forceBundleRefresh(
  reason: string,
  targetBuildId?: string,
): Promise<void> {
  log.warn('[buildVersion] Forcing bundle refresh:', reason, { targetBuildId });
  if (!acquireReloadQuota(targetBuildId)) {
    // acquireReloadQuota já disparou zapp-update-required com o reason
    // apropriado (ex.: 'global-quota'). Não disparar duplicado aqui.
    log.error(
      '[buildVersion] Version mismatch persists after reload — aborting to avoid loop.',
      { targetBuildId },
    );
    return;
  }
  await purgeClientCaches();
  // Bypass query param — CDNs that respeitam query invalidam o cache-edge.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_bv', String(Date.now()));
    window.location.replace(url.toString());
    return;
  } catch {
    window.location.reload();
  }
}

// Timeout para o fetch de version.json: evita que um stall de rede/CDN
// pendure o intervalo de verificação indefinidamente. 10s é conservador —
// version.json tem poucos bytes e o server costuma responder em <100ms.
const VERSION_CHECK_TIMEOUT_MS = 10_000;

async function checkVersion(): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VERSION_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`${VERSION_URL}?ts=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      signal: controller.signal,
      // FIX 2026-07-28: Seguir manualmente em vez de seguir redirects SSO do Vercel.
      // Deploys em zapp-web-v3-*.vercel.app podem estar atrás de vercel.com SSO
      // (login obrigatório) que redireciona /version.json → /login. Sem isso,
      // checkVersion faz loop eterno de fetch + forceBundleRefresh + reload.
      redirect: 'manual',
    });
    // FIX 2026-07-28: Tratar 3xx como "ambiente protegido" — não atualizar build id.
    // Evita loop de reload quando o deploy está protegido por SSO.
    if (res.status >= 300 && res.status < 400) {
      log.warn(
        `[buildVersion] ${VERSION_URL} returned ${res.status} (redirect/SSO) — skipping version check.`,
      );
      return;
    }
    if (!res.ok) return;
    // Valida o content-type ANTES de res.json(): quando /version.json cai no
    // rewrite SPA (deploy sem o arquivo), o servidor responde text/html e
    // res.json() lançaria SyntaxError — engolido pelo catch vazio, deixando o
    // watcher permanentemente cego. Aqui logamos e saímos sem forçar refresh.
    const contentType = res.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      log.warn(
        '[buildVersion] version.json returned non-JSON (likely SPA fallback)',
        { contentType },
      );
      return;
    }
    const payload = (await res.json()) as { buildId?: string } | null;
    const remote = payload?.buildId;
    if (!remote || remote === CURRENT_BUILD_ID) {
      if (remote === CURRENT_BUILD_ID) {
        // Build atual bate com o servidor — limpa TODAS as flags de guarda para
        // evitar que uma sessao antiga fique presa em estado de "purga".
        try {
          sessionStorage.removeItem(RELOAD_STATE_KEY);
          sessionStorage.removeItem(SW_PURGE_FLAG);
          sessionStorage.removeItem(GLOBAL_RELOAD_COUNT_KEY);
          sessionStorage.removeItem(GLOBAL_RELOAD_FIRST_AT_KEY);
        } catch { /* noop */ }
      }
      return;
    }
    await forceBundleRefresh(
      `client=${CURRENT_BUILD_ID} server=${remote}`,
      remote,
    );
  } catch {
    /* offline / timeout / network hiccup — retry next tick */
  } finally {
    clearTimeout(timeoutId);
  }
}

function isSkippableEnv(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
    if (typeof window === 'undefined') return true;
    if (window.self !== window.top) return true;
    const host = window.location.hostname;
    if (
      host.startsWith('id-preview--') ||
      host.startsWith('preview--') ||
      host === 'lovableproject.com' || host.endsWith('.lovableproject.com') ||
      host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com') ||
      host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')
    ) return true;
    // FIX 2026-07-28: Pular watcher em .vercel.app enquanto SSO protection estiver ativa.
    // Sem isso, checkVersion busca /version.json -> 302 -> vercel.com/login -> loop.
    if (host.endsWith('.vercel.app')) return true;
    if (new URL(window.location.href).searchParams.get('sw') === 'off') return true;
  } catch { /* noop */ }
  return false;
}

/**
 * Idempotent. Safe to call from React effects; a second call is a no-op.
 * Should NOT run in Lovable preview/iframe/dev — the caller is responsible for
 * that check (same policy as useServiceWorker).
 */
export function startBuildVersionWatcher(): () => void {
  if (started || typeof window === 'undefined') return () => undefined;
  if (isSkippableEnv()) return () => undefined;
  started = true;

  // Timestamp da inicialização para evitar checks prematuras no 1o minuto.
  const watcherStartedAt = Date.now();
  // Só permite check de versão após 30s do boot — dá tempo do auth bootstrap
  // terminar (getSession, fetchProfile, fetchRoles). Evita que um reload
  // mate requisições auth em voo → AbortError cascade.
  const MIN_BOOT_DELAY_MS = 30_000;

  const safeCheckVersion = () => {
    if (Date.now() - watcherStartedAt < MIN_BOOT_DELAY_MS) return;
    void checkVersion();
  };

  // Kick off first check after the tab is idle so we don't fight first paint.
  const kickoff = window.setTimeout(() => {
    void detectAndPurgeStaleWorkboxSW();
    safeCheckVersion();
  }, MIN_BOOT_DELAY_MS);

  intervalId = setInterval(() => { safeCheckVersion(); }, POLL_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void detectAndPurgeStaleWorkboxSW();
      safeCheckVersion();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  const onFocus = () => {
    void detectAndPurgeStaleWorkboxSW();
    safeCheckVersion();
  };
  window.addEventListener('focus', onFocus);

  return () => {
    clearTimeout(kickoff);
    if (intervalId) clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onFocus);
    started = false;
  };
}

/**
 * Build id this tab is currently running (compile-time constant injected by
 * vite). Consumers compare against it to decide whether a freshly-activated
 * service worker — or a version.json entry — is genuinely newer than the bundle
 * this tab loaded, preventing spurious reloads when the ids already match.
 */
export function getCurrentBuildId(): string {
  return CURRENT_BUILD_ID;
}

export const __TEST__ = {
  CURRENT_BUILD_ID,
  RELOAD_STATE_KEY,
  SW_PURGE_FLAG,
  GLOBAL_RELOAD_COUNT_KEY,
  GLOBAL_RELOAD_FIRST_AT_KEY,
  MAX_RELOADS_PER_TARGET,
  MAX_GLOBAL_RELOADS,
  RELOAD_WINDOW_MS,
  GLOBAL_RELOAD_WINDOW_MS,
  readReloadState,
};
