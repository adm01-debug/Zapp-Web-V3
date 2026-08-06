/**
 * Testes do probe de health com `mode: 'no-cors'` (fix falso backend-down por
 * CORS durante restart do Kong).
 *
 * Antes: o probe mandava header custom `apikey` → browser disparava preflight
 * CORS → falha de CORS virava TypeError no fetch → monitor marcava
 * 'backend-down' FALSO.
 *
 * Depois: GET simples `mode: 'no-cors'` SEM headers custom (sem preflight).
 * A resposta é opaca (status 0, invisível para o JS) — mas para o health probe
 * "fetch resolveu = backend alcançável". Só TypeError (rede/DNS/timeout real)
 * marca 'backend-down'.
 *
 * Cobre:
 *   (a) fetch resolve com resposta opaca (status 0) → status 'online'
 *   (b) fetch rejeita TypeError → status 'backend-down'
 *   (c) nenhum header custom é enviado (init.headers ausente, sem apikey,
 *       mode 'no-cors')
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  __resetSupabaseConnectivityForTests,
  getSupabaseConnectivityStatus,
  pingSupabaseBackend,
} from '../connectivityMonitor';

/**
 * Simula a resposta OPACA que o browser devolve para fetch com mode 'no-cors':
 * status 0, type 'opaque', corpo invisível. (No Node `new Response(null, {status: 0})`
 * lança, então usamos um objeto plano — o monitor não lê a resposta, só espera
 * o fetch RESOLVER.)
 */
function opaqueResponse(): Response {
  return { type: 'opaque', status: 0, ok: false, url: '' } as unknown as Response;
}

beforeEach(() => {
  __resetSupabaseConnectivityForTests();
});

afterEach(() => {
  __resetSupabaseConnectivityForTests();
  vi.unstubAllGlobals();
});

describe('connectivityMonitor — probe no-cors (falso backend-down por CORS)', () => {
  it('(a) resposta opaca (status 0, no-cors) → status online', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(opaqueResponse()));
    await pingSupabaseBackend(true);
    expect(getSupabaseConnectivityStatus()).toBe('online');
  });

  it('(b) fetch rejeita TypeError (rede/DNS/timeout real) → backend-down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await pingSupabaseBackend(true);
    expect(getSupabaseConnectivityStatus()).toBe('backend-down');
  });

  it('(c) nenhum header custom é enviado: mode no-cors, sem headers, sem apikey', async () => {
    const fetchMock = vi.fn().mockResolvedValue(opaqueResponse());
    vi.stubGlobal('fetch', fetchMock);

    await pingSupabaseBackend(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // GET simples no health endpoint.
    expect(url).toContain('/auth/v1/health');
    expect(init.method).toBe('GET');

    // Sem preflight: mode no-cors e NENHUM header custom (nem apikey, nem
    // Accept — Accept fica no default do browser).
    expect(init.mode).toBe('no-cors');
    expect(init.headers).toBeUndefined();
    expect(JSON.stringify(init)).not.toContain('apikey');

    // Timeout/abort preservado (AbortController + 6s).
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
