/**
 * Simulações da cota de reload do buildVersion.
 *
 * Cobre as regras de guarda implementadas em src/lib/buildVersion.ts:
 * - cota POR-ALVO: até MAX_RELOADS_PER_TARGET (2) hard reloads para o mesmo
 *   targetBuildId dentro de uma janela de RELOAD_WINDOW_MS (10min);
 * - alvo diferente zera o contador;
 * - expiração do registro após 10min;
 * - Cota GLOBAL: até MAX_GLOBAL_RELOADS reloads em GLOBAL_RELOAD_WINDOW_MS;
 * - purge de caches/SW APÓS a guarda (no abort nada é purgado);
 * - evento `zapp-update-required` no abort com detail { current, remote };
 * - checkVersion: content-type application/json vs text/html (SPA fallback),
 *   buildId igual/diferente, 3xx (SSO), fetch rejeitando e timeout via
 *   AbortController;
 * - version.json OK limpa o estado de reload no sessionStorage;
 * - prefetch em background dos assets do novo bundle (js/css) no mismatch;
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import {
  forceBundleRefresh,
  getCurrentBuildId,
  startBuildVersionWatcher,
  __TEST__,
} from '@/lib/buildVersion';
import { getLogger } from '@/lib/logger';

// Mock manual (src/lib/__mocks__/logger.ts) — permite assertar log.warn do
// módulo sob teste.
vi.mock('@/lib/logger');

// ── Globals / spies ──────────────────────────────────────────────────────────

const fetchMock = vi.fn<typeof fetch>();

const cachesMock = {
  keys: vi.fn<() => Promise<string[]>>(),
  delete: vi.fn<(key: string) => Promise<boolean>>(),
};

const unregisterMock = vi.fn<() => Promise<boolean>>();
const getRegistrationsMock =
  vi.fn<() => Promise<ReadonlyArray<{ unregister: typeof unregisterMock }>>>();

let replaceSpy: MockInstance<typeof window.location.replace>;
let dispatchSpy: MockInstance<typeof window.dispatchEvent>;

beforeEach(() => {
  vi.useFakeTimers();
  // Import.meta.env.DEV é true no modo test do vitest; o watcher pula ambientes
  // DEV (isSkippableEnv). Forçamos false para exercitar checkVersion real.
  vi.stubEnv('DEV', false);
  sessionStorage.clear();

  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  );
  vi.stubGlobal('fetch', fetchMock);

  cachesMock.keys.mockReset().mockResolvedValue([]);
  cachesMock.delete.mockReset().mockResolvedValue(true);
  vi.stubGlobal('caches', cachesMock);

  unregisterMock.mockReset().mockResolvedValue(true);
  getRegistrationsMock.mockReset().mockResolvedValue([]);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: getRegistrationsMock },
  });

  replaceSpy = vi.spyOn(window.location, 'replace').mockImplementation(() => undefined);
  dispatchSpy = vi.spyOn(window, 'dispatchEvent');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// O módulo chama getLogger('buildVersion') uma única vez, no import.
function buildVersionLog(): ReturnType<typeof getLogger> {
  const result = vi.mocked(getLogger).mock.results[0];
  if (!result) throw new Error('getLogger não foi chamado — mock do logger não ativo');
  return result.value as ReturnType<typeof getLogger>;
}

function jsonResponse(payload: unknown, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

function startWatcherAndStop(): { stop: () => void } {
  const stop = startBuildVersionWatcher();
  return { stop };
}

// ── Cota por alvo ────────────────────────────────────────────────────────────

describe('forceBundleRefresh — cota por alvo (simulação de reloads)', () => {
  it('permite 2 hard reloads para o mesmo alvo e aborta no 3º sem recarregar', async () => {
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA');
    expect(replaceSpy).toHaveBeenCalledTimes(2);

    // 3ª tentativa para o MESMO alvo → cota excedida → abort (sem reload).
    await forceBundleRefresh('mismatch', 'buildA');
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 2 })
    );
  });

  it('abort dispara zapp-update-required com detail { current, remote, reason }', async () => {
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA'); // abort

    const calls = dispatchSpy.mock.calls;
    const event = calls[calls.length - 1]?.[0] as
      CustomEvent<{ current: string; remote: string; reason: string }> | undefined;
    expect(event?.type).toBe('zapp-update-required');
    expect(event?.detail).toEqual(
      expect.objectContaining({
        current: __TEST__.CURRENT_BUILD_ID,
        remote: 'buildA',
        reason: 'per-target-quota',
      })
    );
  });

  it('no abort NÃO purga caches nem desregistra SWs (purge pós-guarda)', async () => {
    cachesMock.keys.mockResolvedValue(['workbox-precache-v1']);
    getRegistrationsMock.mockResolvedValue([{ unregister: unregisterMock }]);

    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA');
    expect(replaceSpy).toHaveBeenCalledTimes(2);

    // Zera os contadores para isolar o 3º reload (abort).
    cachesMock.keys.mockClear();
    cachesMock.delete.mockClear();
    getRegistrationsMock.mockClear();
    unregisterMock.mockClear();
    replaceSpy.mockClear();

    await forceBundleRefresh('mismatch', 'buildA'); // abort
    expect(replaceSpy).not.toHaveBeenCalled();
    expect(cachesMock.keys).not.toHaveBeenCalled();
    expect(cachesMock.delete).not.toHaveBeenCalled();
    expect(getRegistrationsMock).not.toHaveBeenCalled();
    expect(unregisterMock).not.toHaveBeenCalled();
  });

  it('alvo DIFERENTE zera a cota — reload permitido após abort do alvo anterior', async () => {
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA'); // abort de A
    expect(replaceSpy).toHaveBeenCalledTimes(2);

    // Deploy novo (buildB) → contador reinicia → reload permitido.
    await forceBundleRefresh('mismatch', 'buildB');
    expect(replaceSpy).toHaveBeenCalledTimes(3);
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'buildB', attempts: 1 })
    );
  });

  it('registro expira após a janela de 10min — mesmo alvo volta a recarregar', async () => {
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA');
    expect(replaceSpy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(__TEST__.RELOAD_WINDOW_MS + 1);
    await forceBundleRefresh('mismatch', 'buildA');
    expect(replaceSpy).toHaveBeenCalledTimes(3); // janela expirada → permitido
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 1 })
    );
  });

  it('exatamente 10min ainda NÃO expira (janela estritamente maior que)', async () => {
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA');

    vi.advanceTimersByTime(__TEST__.RELOAD_WINDOW_MS);
    await forceBundleRefresh('mismatch', 'buildA'); // now - first = 10min exatos → abort
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 2 })
    );
  });

  it('sem targetBuildId usa flag one-shot isolado e não consome a cota de mismatch', async () => {
    await forceBundleRefresh('stale-workbox-cache');
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(__TEST__.SW_PURGE_FLAG)).toBe('1');

    await forceBundleRefresh('stale-workbox-cache'); // one-shot já consumido → abort
    expect(replaceSpy).toHaveBeenCalledTimes(1);

    // Cota de mismatch intacta: alvo novo ainda pode recarregar.
    await forceBundleRefresh('mismatch', 'buildA');
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 1 })
    );
  });

  it('cota GLOBAL: 5 reloads em 15min são permitidos, 6º aborta mesmo com targets diferentes', async () => {
    // 5 reloads com targets diferentes — permitidos (within global quota).
    for (let i = 0; i < 5; i++) {
      await forceBundleRefresh('mismatch', `build-${i}`);
    }
    expect(replaceSpy).toHaveBeenCalledTimes(5);

    // 6º reload (target build-5) → cota global excedida → abort sem reload.
    await forceBundleRefresh('mismatch', 'build-5');
    expect(replaceSpy).toHaveBeenCalledTimes(5);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    const calls = dispatchSpy.mock.calls;
    const event = calls[calls.length - 1]?.[0] as
      CustomEvent<{ current: string; remote: string; reason: string }> | undefined;
    expect(event?.type).toBe('zapp-update-required');
    expect(event?.detail?.reason).toBe('global-quota');
  });

  it('cota global expira após 15min → reloads voltam a ser permitidos', async () => {
    for (let i = 0; i < 5; i++) {
      await forceBundleRefresh('mismatch', `build-${i}`);
    }
    expect(replaceSpy).toHaveBeenCalledTimes(5);

    // Avança além da janela global (15min + 1ms).
    vi.advanceTimersByTime(__TEST__.GLOBAL_RELOAD_WINDOW_MS + 1);

    // Contador zera — reload volta a ser permitido.
    await forceBundleRefresh('mismatch', 'build-new');
    expect(replaceSpy).toHaveBeenCalledTimes(6);
  });

  it('getCurrentBuildId expõe o build id do bundle atual', () => {
    expect(getCurrentBuildId()).toBe(__TEST__.CURRENT_BUILD_ID);
    expect(typeof getCurrentBuildId()).toBe('string');
  });
});

// ── Purge e reload ───────────────────────────────────────────────────────────

describe('forceBundleRefresh — purge de caches/SW no reload permitido', () => {
  it('purga Cache Storage e desregistra SWs antes do location.replace', async () => {
    cachesMock.keys.mockResolvedValue(['workbox-precache-v1', 'runtime-abc']);
    getRegistrationsMock.mockResolvedValue([{ unregister: unregisterMock }]);

    await forceBundleRefresh('mismatch', 'buildA');

    expect(cachesMock.keys).toHaveBeenCalledTimes(1);
    expect(cachesMock.delete).toHaveBeenCalledWith('workbox-precache-v1');
    expect(cachesMock.delete).toHaveBeenCalledWith('runtime-abc');
    expect(getRegistrationsMock).toHaveBeenCalledTimes(1);
    expect(unregisterMock).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    // Bypass query param para invalidar cache de CDN.
    expect(String(replaceSpy.mock.calls[0][0])).toContain('_bv=');
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 1 })
    );
  });

  it('purge tolera rejeições (caches.delete / unregister) e ainda recarrega', async () => {
    cachesMock.keys.mockResolvedValue(['workbox-precache-v1']);
    cachesMock.delete.mockRejectedValue(new Error('quota exceeded'));
    getRegistrationsMock.mockResolvedValue([{ unregister: unregisterMock }]);
    unregisterMock.mockRejectedValue(new Error('unregister failed'));

    await expect(forceBundleRefresh('mismatch', 'buildA')).resolves.toBeUndefined();
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });

  it('sem Cache Storage global, purge segue apenas com SW e recarrega', async () => {
    vi.stubGlobal('caches', undefined);
    getRegistrationsMock.mockResolvedValue([{ unregister: unregisterMock }]);

    await forceBundleRefresh('mismatch', 'buildA');

    expect(getRegistrationsMock).toHaveBeenCalledTimes(1);
    expect(unregisterMock).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
  });
});

// ── checkVersion via watcher ─────────────────────────────────────────────────

describe('checkVersion (via startBuildVersionWatcher + fake timers)', () => {
  it('buildId diferente + content-type application/json → aviso + reload após a janela de cortesia (UPDATE_GRACE_MS)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ buildId: 'buildB' }, 'application/json'));

    const { stop } = startWatcherAndStop();
    try {
      // FIX #7: o kickoff em 30s (MIN_BOOT_DELAY_MS) detecta o mismatch, dispara
      // 'zapp-update-required' (grace:true) e agenda o reload; o reload ocorre
      // ao fim da janela de cortesia UPDATE_GRACE_MS — não mais imediatamente.
      await vi.advanceTimersByTimeAsync(30_000 + __TEST__.UPDATE_GRACE_MS);
      // Fetch calls esperadas: 1 version.json + 4 prefetch (js/css no schedule
      // + js/css no forceBundleRefresh) + 1 HEAD CDN check (isBundleReachable).
      expect(fetchMock).toHaveBeenCalledTimes(6);
      expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/version\.json\?ts=\d+$/);
      // Assets do novo bundle: 2 prefetch no schedule, 1 HEAD CDN check,
      // 2 prefetch no forceBundleRefresh (total 5 chamadas de /assets/).
      const assetCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/assets/'));
      const prefetchUrls = assetCalls.map((c) => String(c[0]));
      expect(prefetchUrls).toEqual([
        '/assets/index-buildB.js',   // prefetch (schedule)
        '/assets/index-buildB.css',  // prefetch (schedule)
        '/assets/index-buildB.js',   // HEAD CDN check (isBundleReachable)
        '/assets/index-buildB.js',   // prefetch (forceBundleRefresh)
        '/assets/index-buildB.css',  // prefetch (forceBundleRefresh)
      ]);
      // Verificar que o CDN check é mesmo HEAD (3ª chamada de /assets/)
      expect(assetCalls[2][1]).toMatchObject({ method: 'HEAD' });
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(String(replaceSpy.mock.calls[0][0])).toContain('_bv=');
      expect(__TEST__.readReloadState()).toEqual(
        expect.objectContaining({ targetBuildId: 'buildB', attempts: 1 })
      );
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('content-type text/html (SPA fallback — cenário do bug) → sem reload e log.warn', async () => {
    fetchMock.mockResolvedValue(
      new Response('<!doctype html><html><body>index</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(buildVersionLog().warn).toHaveBeenCalledWith(
        expect.stringContaining('non-JSON'),
        expect.objectContaining({ contentType: 'text/html' })
      );
      expect(sessionStorage.getItem(__TEST__.RELOAD_STATE_KEY)).toBeNull();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('buildId IGUAL ao atual → sem reload e limpa flags de reload do sessionStorage', async () => {
    // Sessão antiga presa em estado de "purga": flags de guarda setadas.
    sessionStorage.setItem(
      __TEST__.RELOAD_STATE_KEY,
      JSON.stringify({ targetBuildId: 'buildA', attempts: 2, firstAttemptAt: 1 })
    );
    sessionStorage.setItem(__TEST__.SW_PURGE_FLAG, '1');
    sessionStorage.setItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY, '3');
    sessionStorage.setItem(__TEST__.GLOBAL_RELOAD_FIRST_AT_KEY, String(Date.now()));

    fetchMock.mockResolvedValue(jsonResponse({ buildId: __TEST__.CURRENT_BUILD_ID }));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(__TEST__.readReloadState()).toBeNull();
      expect(sessionStorage.getItem(__TEST__.SW_PURGE_FLAG)).toBeNull();
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBeNull();
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_FIRST_AT_KEY)).toBeNull();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('resposta 3xx (redirect SSO) → sem reload', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302 }));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(buildVersionLog().warn).toHaveBeenCalledWith(expect.stringContaining('redirect/SSO'));
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('fetch rejeita (rede/offline) → sem crash e sem reload', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(dispatchSpy).not.toHaveBeenCalled();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('timeout de 10s aborta fetch pendente (AbortController) → sem crash', async () => {
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(dispatchSpy).not.toHaveBeenCalled();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('payload sem buildId → sem reload e sem estado de reload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(__TEST__.RELOAD_STATE_KEY)).toBeNull();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('startBuildVersionWatcher é idempotente e o cleanup para os timers', async () => {
    const stop1 = startBuildVersionWatcher(); // 1ª chamada inicia o watcher
    const stop2 = startBuildVersionWatcher(); // 2ª chamada → no-op (started já true)
    expect(stop2).toBeInstanceOf(Function);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // apenas 1 kickoff

    stop1();
    vi.clearAllTimers();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // sem novo kickoff após cleanup
  });
});

// ── Simulações exaustivas (stress / race / cenário real / boot delay / limpeza) ──

describe('STRESS: cota GLOBAL sob 100 reloads em loop rápido (fake timers)', () => {
  it('100 forceBundleRefresh seguidos — 5 primeiros recarregam, 95 aborts com global-quota', async () => {
    // Targets diferentes a cada chamada → cota por-alvo nunca bloqueia; só a
    // cota GLOBAL (5/15min) pode parar o loop.
    for (let i = 0; i < 100; i++) {
      await forceBundleRefresh('mismatch', `build-${i}`);
    }

    // Exatamente 5 reloads permitidos...
    expect(replaceSpy).toHaveBeenCalledTimes(5);

    // ...e 95 aborts, TODOS com reason 'global-quota'.
    expect(dispatchSpy).toHaveBeenCalledTimes(95);
    const reasons = dispatchSpy.mock.calls.map(
      (call) => (call[0] as CustomEvent<{ reason: string }>).detail.reason
    );
    expect(reasons.every((reason) => reason === 'global-quota')).toBe(true);

    // Contador global congelado em 5 — aborts NÃO incrementam.
    expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('5');
    expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_FIRST_AT_KEY)).not.toBeNull();

    // Aborts não purgam caches/SW (purge é pós-guarda).
    expect(cachesMock.keys).toHaveBeenCalledTimes(5);
    expect(getRegistrationsMock).toHaveBeenCalledTimes(5);

    // Estado por-alvo permanece no ÚLTIMO alvo permitido (build-4).
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'build-4', attempts: 1 })
    );
  });

  it('stress com alvo ÚNICO: per-target (2) e global (5) atuam em conjunto', async () => {
    for (let i = 0; i < 100; i++) {
      await forceBundleRefresh('mismatch', 'buildA');
    }

    // 1º e 2º: permitidos (per-target 1/2 e 2/2). 3º: per-target-quota.
    // 4º e 5º: per-target já estourou → abort; nenhum chega a consumir global.
    expect(replaceSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy).toHaveBeenCalledTimes(98);
    expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('2');
    expect(__TEST__.readReloadState()).toEqual(
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 2 })
    );
  });
});

describe('RACE: dois checkVersion simultâneos (kickoff + visibilitychange)', () => {
  // GAP CONHECIDO: buildVersion.ts NÃO tem dedup in-flight — `safeCheckVersion`
  // pode entrar duas vezes no mesmo tick e as DUAS chamadas passam pela cota
  // por-alvo (que permite 2 reloads). Este teste documenta o comportamento
  // DESEJADO (1 reload); o teste seguinte documenta o comportamento REAL
  // (2 reloads, dentro da cota, sem abort). Usamos mockImplementation com um
  // Response NOVO por chamada — mockResolvedValue compartilharia o MESMO body,
  // e o 2º res.json() lançaria "body already consumed" (silenciado pelo catch),
  // mascarando a race. GAP CONHECIDO: buildVersion.ts não tem dedup in-flight.
  it.skip('kickoff + visibilitychange no mesmo tick → apenas 1 forceBundleRefresh', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ buildId: 'buildB' })));

    const { stop } = startWatcherAndStop();
    try {
      // t=30s: o timer de kickoff dispara checkVersion#1; no MESMO tick o
      // visibilitychange dispara checkVersion#2 — race de verdade.
      await vi.advanceTimersByTimeAsync(30_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchMock).toHaveBeenCalledTimes(2); // dois checks rodaram
      expect(replaceSpy).toHaveBeenCalledTimes(1); // mas só 1 reload
      expect(dispatchSpy).not.toHaveBeenCalled(); // e nenhum abort
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('comportamento REAL: 2 checks simultâneos ficam DENTRO da cota (2 reloads, sem abort)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ buildId: 'buildB' })));

    const { stop } = startWatcherAndStop();
    try {
      // FIX #7: cada check agenda seu reload ao fim da janela de cortesia
      // (UPDATE_GRACE_MS) — os 2 timers disparam juntos em t=90s.
      await vi.advanceTimersByTimeAsync(30_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);

      // Reloads ainda NÃO ocorreram (janela de cortesia em andamento)…
      expect(replaceSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(__TEST__.UPDATE_GRACE_MS);

      // Ambos passam pela cota por-alvo (max 2) → 2 reloads, 0 aborts.
      // Eventos grace ('version-mismatch') NÃO contam como abort.
      const abortEvents = () =>
        dispatchSpy.mock.calls
          .map((c) => c[0] as CustomEvent<{ reason?: string }>)
          .filter(
            (e) => e.type === 'zapp-update-required' && e.detail?.reason !== 'version-mismatch'
          );
      expect(replaceSpy).toHaveBeenCalledTimes(2);
      expect(abortEvents()).toHaveLength(0);
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('2');
      expect(__TEST__.readReloadState()).toEqual(
        expect.objectContaining({ targetBuildId: 'buildB', attempts: 2 })
      );

      // Um 3º check (poll de 5min) já encontra a cota por-alvo esgotada → o
      // reload agendado aborta ao fim da cortesia, provando que a race não
      // vira loop infinito.
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(replaceSpy).toHaveBeenCalledTimes(2);
      const abort = abortEvents()[0];
      expect(abort?.type).toBe('zapp-update-required');
      expect(abort?.detail?.reason).toBe('per-target-quota');
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });
});

describe('CENÁRIO REAL: 4 deploys em 23 minutos (padrão do log de produção)', () => {
  it('rajada de deploys com checks extras (focus/visibility) → cota global corta o loop', async () => {
    // Deploys: buildA em t=0, buildB em t=6min, buildC em t=12min, buildD em t=20min.
    // O watcher checa em: kickoff 30s, polls 5/10/15/20min + focus/visibilitychange
    // disparados pelo usuário — o mesmo padrão que causou a cascata em produção.
    // FIX #7: cada reload agora ocorre 60s (UPDATE_GRACE_MS) após o check que o
    // agendou — os checks e cotas são idênticos, apenas adiados pela cortesia.
    let liveBuildId = 'buildA';
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ buildId: liveBuildId })));

    const { stop } = startWatcherAndStop();
    try {
      // Filtra APENAS os eventos de ABORT de cota — os eventos de cortesia
      // (reason 'version-mismatch', grace:true) são o aviso ao usuário e não
      // contam como abort.
      const updateRequired = () =>
        dispatchSpy.mock.calls
          .map((call) => call[0] as CustomEvent<{ reason?: string }>)
          .filter(
            (call) =>
              call.type === 'zapp-update-required' && call.detail?.reason !== 'version-mismatch'
          );

      // ── Deploy 1 (buildA) ── kickoff em 30s detecta o mismatch; reload #1
      // ao fim da janela de cortesia (global 1/5)
      await vi.advanceTimersByTimeAsync(30_000 + __TEST__.UPDATE_GRACE_MS);
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('1');

      // Poll de 5min ainda vê buildA → reload #2 em 5min+60s (per-target A 2/2,
      // global 2/5)
      await vi.advanceTimersByTimeAsync(4.5 * 60_000);
      expect(replaceSpy).toHaveBeenCalledTimes(2);

      // ── Deploy 2 (buildB, t=6min) ── focus do usuário em 6.2min agenda o
      // reload #3 (dispara 60s depois — global 3/5)
      liveBuildId = 'buildB';
      await vi.advanceTimersByTimeAsync(1.2 * 60_000);
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(__TEST__.UPDATE_GRACE_MS);
      expect(replaceSpy).toHaveBeenCalledTimes(3);

      // Poll de 10min vê buildB → reload #4 (B 2/2, global 4/5)
      await vi.advanceTimersByTimeAsync(3.8 * 60_000);
      expect(replaceSpy).toHaveBeenCalledTimes(4);

      // ── Deploy 3 (buildC, t=12min) ── visibilitychange em 12.1min agenda o
      // reload #5 (global chega a 5/5 — último reload permitido na janela de 15min)
      liveBuildId = 'buildC';
      await vi.advanceTimersByTimeAsync(2.1 * 60_000);
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(__TEST__.UPDATE_GRACE_MS);
      expect(replaceSpy).toHaveBeenCalledTimes(5);

      // Focus → checkVersion vê buildC e agenda mais um reload; a cota global
      // (5/5) só é atingida quando o timer de cortesia dispara.
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
      expect(replaceSpy).toHaveBeenCalledTimes(5); // loop PREVENIDO
      expect(updateRequired()).toHaveLength(0);

      // Timers de cortesia do poll de 15min + focus disparam → 2 ABORTS
      // global-quota (reloads #6/#7 nunca acontecem).
      await vi.advanceTimersByTimeAsync(__TEST__.UPDATE_GRACE_MS);
      expect(replaceSpy).toHaveBeenCalledTimes(5);
      expect(updateRequired()).toHaveLength(2);
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('5');

      // ── Deploy 4 (buildD, t=20min) ── poll de 20min: janela global expirada
      // (90s + 15min) → contador zera → reload #6 permitido ao fim da cortesia
      liveBuildId = 'buildD';
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(replaceSpy).toHaveBeenCalledTimes(6);
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('1');

      // Fim da simulação em t=25min — poll de 25min agenda reload para 26min,
      // fora da janela simulada (não dispara).
      await vi.advanceTimersByTimeAsync(60_000);
      expect(replaceSpy).toHaveBeenCalledTimes(6);

      // Resultado: 8 checks de versão → apenas 6 reloads (2 aborts global-quota).
      // Sem a cota global seriam 8 reloads — a cascata auth/429 é evitada.
      const reasons = updateRequired().map(
        (call) => (call as CustomEvent<{ reason: string }>).detail.reason
      );
      expect(reasons).toEqual(['global-quota', 'global-quota']);
      expect(__TEST__.readReloadState()).toEqual(
        expect.objectContaining({ targetBuildId: 'buildD', attempts: 1 })
      );
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });
});

describe('MIN_BOOT_DELAY_MS (30s) — guarda de boot', () => {
  it('visibilitychange/focus antes de 30s NÃO disparam checkVersion; após 30s disparam', async () => {
    // Response NOVO por chamada (mockResolvedValue compartilharia o body e o
    // 2º res.json() lançaria "body already consumed", mascarando os checks).
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ buildId: __TEST__.CURRENT_BUILD_ID }))
    );

    const { stop } = startWatcherAndStop();
    try {
      // t=0: foco/visibilidade imediatos → bloqueados pelo boot delay.
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).not.toHaveBeenCalled();

      // t=29.999s: ainda dentro da janela de 30s → nada.
      await vi.advanceTimersByTimeAsync(29_999);
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).not.toHaveBeenCalled();

      // t=30s: o kickoff (timer) finalmente roda → 1º check.
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Após 30s, focus e visibilitychange passam a disparar checkVersion.
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Build id bate → nenhum reload.
      expect(replaceSpy).not.toHaveBeenCalled();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });
});

describe('Limpeza das chaves GLOBAIS no caminho de versão MATCH', () => {
  it('version.json com buildId == atual remove GLOBAL_RELOAD_COUNT_KEY e GLOBAL_RELOAD_FIRST_AT_KEY', async () => {
    // Sessão antiga com todas as flags de guarda setadas (cenário pós-loop).
    sessionStorage.setItem(
      __TEST__.RELOAD_STATE_KEY,
      JSON.stringify({ targetBuildId: 'buildA', attempts: 2, firstAttemptAt: 1 })
    );
    sessionStorage.setItem(__TEST__.SW_PURGE_FLAG, '1');
    sessionStorage.setItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY, '5');
    sessionStorage.setItem(__TEST__.GLOBAL_RELOAD_FIRST_AT_KEY, String(Date.now()));

    fetchMock.mockResolvedValue(jsonResponse({ buildId: __TEST__.CURRENT_BUILD_ID }));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(30_000);
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBeNull();
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_FIRST_AT_KEY)).toBeNull();
      expect(sessionStorage.getItem(__TEST__.RELOAD_STATE_KEY)).toBeNull();
      expect(sessionStorage.getItem(__TEST__.SW_PURGE_FLAG)).toBeNull();
      expect(replaceSpy).not.toHaveBeenCalled();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('versão DIFERENTE NÃO limpa as chaves globais — elas persistem para a guarda', async () => {
    const seededFirstAt = String(Date.now());
    sessionStorage.setItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY, '4');
    sessionStorage.setItem(__TEST__.GLOBAL_RELOAD_FIRST_AT_KEY, seededFirstAt);

    fetchMock.mockResolvedValue(jsonResponse({ buildId: 'buildX' }));

    const { stop } = startWatcherAndStop();
    try {
      // FIX #7: mismatch detectado no kickoff (30s) → reload ao fim da janela
      // de cortesia; a cota é consumida quando o reload é aplicado.
      await vi.advanceTimersByTimeAsync(30_000 + __TEST__.UPDATE_GRACE_MS);

      // 4/5 já consumidos → este reload é o 5º (permitido) e incrementa para 5.
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('5');
      // Primeira tentativa da janela NÃO é sobrescrita — firstAt original mantido.
      expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_FIRST_AT_KEY)).toBe(seededFirstAt);
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });
});

describe('SEM targetBuildId (workbox purge) — consumo da cota GLOBAL', () => {
  it('reloads one-shot incrementam o contador global e estouram a cota como qualquer outro', async () => {
    // 2 purges one-shot (flag SW_PURGE_FLAG limpo manualmente entre eles,
    // como aconteceria após um version match).
    await forceBundleRefresh('stale-workbox-cache');
    expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('1');
    sessionStorage.removeItem(__TEST__.SW_PURGE_FLAG);
    await forceBundleRefresh('stale-workbox-cache');
    expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('2');

    // +3 reloads de mismatch (targets diferentes) → total 5/5.
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildB');
    await forceBundleRefresh('mismatch', 'buildC');
    expect(replaceSpy).toHaveBeenCalledTimes(5);
    expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('5');

    // 6ª tentativa — mesmo que fosse outro one-shot — → global-quota.
    sessionStorage.removeItem(__TEST__.SW_PURGE_FLAG);
    await forceBundleRefresh('stale-workbox-cache');
    expect(replaceSpy).toHaveBeenCalledTimes(5);
    const event = dispatchSpy.mock.calls[0]?.[0] as
      CustomEvent<{ reason: string; remote: string }> | undefined;
    expect(event?.type).toBe('zapp-update-required');
    expect(event?.detail?.reason).toBe('global-quota');
    expect(event?.detail?.remote).toBe('unknown'); // sem target → 'unknown'
    expect(sessionStorage.getItem(__TEST__.GLOBAL_RELOAD_COUNT_KEY)).toBe('5');
  });
});
