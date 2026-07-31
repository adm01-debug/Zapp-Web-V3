/**
 * Simulações da cota de reload do buildVersion.
 *
 * Cobre as regras de guarda implementadas em src/lib/buildVersion.ts:
 * - cota POR-ALVO: até MAX_RELOADS_PER_TARGET (2) hard reloads para o mesmo
 *   targetBuildId dentro de uma janela de RELOAD_WINDOW_MS (10min);
 * - alvo diferente zera o contador;
 * - expiração do registro após 10min;
 * - purge de caches/SW APÓS a guarda (no abort nada é purgado);
 * - evento `zapp-update-required` no abort com detail { current, remote };
 * - checkVersion: content-type application/json vs text/html (SPA fallback),
 *   buildId igual/diferente, 3xx (SSO), fetch rejeitando e timeout via
 *   AbortController;
 * - version.json OK limpa o estado de reload no sessionStorage.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
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
const getRegistrationsMock = vi.fn<
  () => Promise<ReadonlyArray<{ unregister: typeof unregisterMock }>>
>();

let replaceSpy: MockInstance<typeof window.location.replace>;
let reloadSpy: MockInstance<typeof window.location.reload>;
let dispatchSpy: MockInstance<typeof window.dispatchEvent>;

beforeEach(() => {
  vi.useFakeTimers();
  // Import.meta.env.DEV é true no modo test do vitest; o watcher pula ambientes
  // DEV (isSkippableEnv). Forçamos false para exercitar checkVersion real.
  vi.stubEnv('DEV', false);
  sessionStorage.clear();

  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
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
  reloadSpy = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);
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
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 2 }),
    );
  });

  it('abort dispara zapp-update-required com detail { current, remote }', async () => {
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA');
    await forceBundleRefresh('mismatch', 'buildA'); // abort

    const calls = dispatchSpy.mock.calls;
    const event = calls[calls.length - 1]?.[0] as
      | CustomEvent<{ current: string; remote: string }>
      | undefined;
    expect(event?.type).toBe('zapp-update-required');
    expect(event?.detail).toEqual({
      current: __TEST__.CURRENT_BUILD_ID,
      remote: 'buildA',
    });
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
      expect.objectContaining({ targetBuildId: 'buildB', attempts: 1 }),
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
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 1 }),
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
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 2 }),
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
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 1 }),
    );
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
      expect.objectContaining({ targetBuildId: 'buildA', attempts: 1 }),
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
  it('buildId diferente + content-type application/json → forceBundleRefresh com targetBuildId', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ buildId: 'buildB' }, 'application/json'),
    );

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(10_000); // kickoff (idle de 10s)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/version\.json\?ts=\d+$/);
      expect(replaceSpy).toHaveBeenCalledTimes(1);
      expect(String(replaceSpy.mock.calls[0][0])).toContain('_bv=');
      expect(__TEST__.readReloadState()).toEqual(
        expect.objectContaining({ targetBuildId: 'buildB', attempts: 1 }),
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
      }),
    );

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(buildVersionLog().warn).toHaveBeenCalledWith(
        expect.stringContaining('non-JSON'),
        expect.objectContaining({ contentType: 'text/html' }),
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
      JSON.stringify({ targetBuildId: 'buildA', attempts: 2, firstAttemptAt: 1 }),
    );
    sessionStorage.setItem(__TEST__.SW_PURGE_FLAG, '1');

    fetchMock.mockResolvedValue(jsonResponse({ buildId: __TEST__.CURRENT_BUILD_ID }));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(__TEST__.readReloadState()).toBeNull();
      expect(sessionStorage.getItem(__TEST__.SW_PURGE_FLAG)).toBeNull();
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('resposta 3xx (redirect SSO) → sem reload', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 302 }));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(10_000);
      expect(replaceSpy).not.toHaveBeenCalled();
      expect(buildVersionLog().warn).toHaveBeenCalledWith(
        expect.stringContaining('redirect/SSO'),
      );
    } finally {
      stop();
      vi.clearAllTimers();
    }
  });

  it('fetch rejeita (rede/offline) → sem crash e sem reload', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(10_000);
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
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const { stop } = startWatcherAndStop();
    try {
      await vi.advanceTimersByTimeAsync(10_000);
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
      await vi.advanceTimersByTimeAsync(10_000);
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

    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // apenas 1 kickoff

    stop1();
    vi.clearAllTimers();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // sem novo kickoff após cleanup
  });
});
