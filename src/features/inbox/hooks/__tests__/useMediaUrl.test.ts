/**
 * useMediaUrl — Bug #6: guard de mounted no auto-refresh de mídia.
 *
 * Regressão coberta: com um refresh em voo (supabase.functions.invoke
 * pendente) e o componente desmontado, a resolução do job NÃO pode:
 *   - chamar setState pós-unmount (url/error/failed/attempts/isRefreshing);
 *   - emitir log.warn 'media refresh failed';
 *   - disparar toast.error;
 *   - produzir erro React de state update em componente desmontado.
 * O dedupe inFlightRef precisa ser liberado no finally MESMO desmontado.
 *
 * Também cobre o caso feliz: invoke resolve { base64, mimetype } → url vira
 * data URL.
 *
 * Nota: supabase.functions.invoke não aceita AbortSignal (supabase-js v2;
 * client.ts descarta o signal do caller — fix 2026-08-03 anti retry storm),
 * então o padrão correto é mountedRef, não AbortController.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaUrl } from '../useMediaUrl';
import { mediaCacheClear } from '../mediaRefreshCache';

const invokeMock = vi.hoisted(() => vi.fn());
const safeFromMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const buildFileHashMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { from: safeFromMock },
}));

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}));

vi.mock('@/lib/crypto', () => ({
  buildFileHash: buildFileHashMock,
}));

const INSTANCE = 'test-instance';
const KEY = {
  remoteJid: '5511999999999@s.whatsapp.net',
  fromMe: false,
  id: 'msg-unmount-1',
};
const ORIGINAL_URL = 'https://mmg.whatsapp.net/o2/expired-media.enc';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function spyConsole() {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  return { warn, error, debug, info };
}

beforeEach(() => {
  invokeMock.mockReset();
  safeFromMock.mockReset();
  toastErrorMock.mockReset();
  buildFileHashMock.mockReset().mockResolvedValue('hash-test');
  mediaCacheClear();

  // Sem linha em media_cache → segue para o invoke; upsert é no-op.
  safeFromMock.mockImplementation(
    (_table: string, _cb?: (q: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaUrl — guard de mounted', () => {
  it('unmount com refresh em voo: sem setState/log.warn/toast/erro React pós-unmount', async () => {
    const { warn, error, debug } = spyConsole();
    const { promise, resolve } = deferred<{ data: unknown; error: unknown }>();
    invokeMock.mockReturnValue(promise);

    const { result, unmount } = renderHook(() =>
      useMediaUrl({
        instanceName: INSTANCE,
        originalUrl: ORIGINAL_URL,
        messageKey: KEY,
        enabled: true,
        maxAttempts: 2,
      })
    );

    // Dispara o refresh; invoke fica pendente (job em voo).
    await act(async () => {
      result.current.onError();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith('evolution-api/get-media-base64', {
      method: 'POST',
      body: { instanceName: INSTANCE, message: { key: KEY } },
    });

    // Desmonta com o job ainda em voo.
    unmount();

    // Resolve a promise com falha e drena microtasks.
    await act(async () => {
      resolve({ data: null, error: new Error('network error: fetch failed') });
    });

    // Nenhum side effect pós-unmount:
    expect(warn).not.toHaveBeenCalled(); // log.warn suprimido
    expect(error).not.toHaveBeenCalled(); // nem erro React de state update
    expect(toastErrorMock).not.toHaveBeenCalled();
    // Apenas log.debug com a falha classificada:
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('media refresh failed after unmount')
    );
    // Estado congelado no último render montado:
    expect(result.current.url).toBe(ORIGINAL_URL);
    expect(result.current.isRefreshing).toBe(true); // setIsRefreshing(false) suprimido
    expect(result.current.attempts).toBe(0);
    expect(result.current.failed).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('caso feliz: invoke resolve { base64, mimetype } → url vira data URL', async () => {
    invokeMock.mockResolvedValue({
      data: { base64: 'QUJDRA==', mimetype: 'image/jpeg' },
      error: null,
    });

    const { result } = renderHook(() =>
      useMediaUrl({
        instanceName: INSTANCE,
        originalUrl: ORIGINAL_URL,
        messageKey: { ...KEY, id: 'msg-happy-1' },
        enabled: true,
        maxAttempts: 2,
      })
    );

    await act(async () => {
      result.current.onError();
    });

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.current.url).toBe('data:image/jpeg;base64,QUJDRA==');
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.failed).toBe(false);
    expect(result.current.attempts).toBe(0);
  });
});
