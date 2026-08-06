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
import {
  useMediaUrl,
  classifyError,
  MAX_SESSION_REFRESH_ATTEMPTS,
  resetSessionRefreshAttempts,
} from '../useMediaUrl';
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
  resetSessionRefreshAttempts();

  // Sem linha em media_cache → segue para o invoke; upsert é no-op.
  safeFromMock.mockImplementation((_table: string, _cb?: (q: unknown) => unknown) =>
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

describe('classifyError — body/status do FunctionsHttpError (supabase-js v2)', () => {
  // Simula o erro real do supabase-js: FunctionsHttpError tem message genérica
  // ('Edge Function returned a non-2xx status code') e `context` = Response
  // (status HTTP + body JSON do envelope, parseado em context.data nas
  // versões >= 2.39).
  function functionsHttpError(status: number, data?: unknown): Error {
    const err = new Error('Edge Function returned a non-2xx status code') as Error & {
      name: string;
      context: unknown;
    };
    err.name = 'FunctionsHttpError';
    err.context = data === undefined ? { status } : { status, data };
    return err;
  }

  it('400 com body de stream expirado (Failed to fetch stream) → expired', async () => {
    // Body real da edge fn evolution-api/get-media-base64 quando o upstream
    // do WhatsApp devolve 400 (mídia expirada).
    const err = functionsHttpError(400, {
      status: 400,
      error: 'Bad Request',
      response: {
        message: [
          'Error: Failed to fetch stream from https://mmg.whatsapp.net/o2/expired-media.enc',
        ],
      },
    });
    const classified = await classifyError(err);
    expect(classified.reason).toBe('expired');
    expect(classified.message).toBe(
      'Esta mídia expirou no WhatsApp e não pode mais ser recuperada.'
    );
  });

  it('410 → expired (status HTTP real do context)', async () => {
    const classified = await classifyError(functionsHttpError(410));
    expect(classified.reason).toBe('expired');
  });

  it('403 → expired (status HTTP real do context)', async () => {
    const classified = await classifyError(functionsHttpError(403));
    expect(classified.reason).toBe('expired');
  });

  it('404 → not_found (status HTTP real do context)', async () => {
    const classified = await classifyError(functionsHttpError(404));
    expect(classified.reason).toBe('not_found');
    expect(classified.message).toBe('Mídia não encontrada no servidor do WhatsApp.');
  });

  it('envelope com code MEDIA_EXPIRED → expired', async () => {
    const classified = await classifyError(
      functionsHttpError(400, { code: 'MEDIA_EXPIRED', message: 'Media expired' })
    );
    expect(classified.reason).toBe('expired');
  });

  it('504 → network (status HTTP real do context)', async () => {
    const classified = await classifyError(functionsHttpError(504));
    expect(classified.reason).toBe('network');
  });

  it('Response cru (sem data parseado): lê body via context.json() → expired', async () => {
    const err = new Error('Edge Function returned a non-2xx status code') as Error & {
      name: string;
      context: unknown;
    };
    err.name = 'FunctionsHttpError';
    err.context = {
      status: 400,
      json: async () => ({
        status: 400,
        error: 'Bad Request',
        response: { message: ['Error: Failed to fetch stream from https://mmg.whatsapp.net/x'] },
      }),
    };
    const classified = await classifyError(err);
    expect(classified.reason).toBe('expired');
  });

  it('context.json() com body já consumido → não quebra (fallback unknown)', async () => {
    const err = new Error('Edge Function returned a non-2xx status code') as Error & {
      name: string;
      context: unknown;
    };
    err.name = 'FunctionsHttpError';
    err.context = { status: 500, json: async () => Promise.reject(new Error('Body already read')) };
    const classified = await classifyError(err);
    expect(classified.reason).toBe('unknown');
  });

  it('FunctionsHttpError sem context/body (message genérica) → unknown (compat)', async () => {
    const classified = await classifyError(
      new Error('Edge Function returned a non-2xx status code')
    );
    expect(classified.reason).toBe('unknown');
  });

  it('Error simples com mensagem de rede → network (compat)', async () => {
    const classified = await classifyError(new Error('network error: fetch failed'));
    expect(classified.reason).toBe('network');
  });

  it('empty media payload → unsupported (compat)', async () => {
    const classified = await classifyError(new Error('Empty media payload'));
    expect(classified.reason).toBe('unsupported');
  });

  it('erro não-Error (string) → unknown sem crash (compat)', async () => {
    const classified = await classifyError('boom');
    expect(classified.reason).toBe('unknown');
    expect(classified.cause?.message).toBe('boom');
  });
});

describe('useMediaUrl — integração com FunctionsHttpError', () => {
  it('invoke rejeita com FunctionsHttpError 400 stream-expired → error.reason = expired', async () => {
    const { warn, debug } = spyConsole();
    invokeMock.mockRejectedValue(
      Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        name: 'FunctionsHttpError',
        context: {
          status: 400,
          data: {
            status: 400,
            error: 'Bad Request',
            response: {
              message: [
                'Error: Failed to fetch stream from https://mmg.whatsapp.net/o2/expired.enc',
              ],
            },
          },
        },
      })
    );

    const { result } = renderHook(() =>
      useMediaUrl({
        instanceName: INSTANCE,
        originalUrl: ORIGINAL_URL,
        messageKey: { ...KEY, id: 'msg-http-400' },
        enabled: true,
        maxAttempts: 2,
      })
    );

    await act(async () => {
      result.current.onError();
    });

    expect(result.current.error?.reason).toBe('expired');
    expect(result.current.error?.message).toContain('expirou no WhatsApp');
    expect(result.current.attempts).toBe(1);
    // Integração com o hardening anti-storm: mídia expirada é IRRECUPERÁVEL
    // (o WhatsApp não "desexpira" a URL) ⇒ failed imediato na 1ª tentativa,
    // sem gastar a 2ª, e log em DEBUG (esperado, não é erro).
    expect(result.current.failed).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('media refresh failed for'));
  });

  it('invoke rejeita com FunctionsHttpError 404 → error.reason = not_found', async () => {
    spyConsole();
    invokeMock.mockRejectedValue(
      Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        name: 'FunctionsHttpError',
        context: { status: 404, data: { code: 'not_found', message: 'Media not found' } },
      })
    );

    const { result } = renderHook(() =>
      useMediaUrl({
        instanceName: INSTANCE,
        originalUrl: ORIGINAL_URL,
        messageKey: { ...KEY, id: 'msg-http-404' },
        enabled: true,
        maxAttempts: 2,
      })
    );

    await act(async () => {
      result.current.onError();
    });

    expect(result.current.error?.reason).toBe('not_found');
    expect(result.current.error?.message).toBe('Mídia não encontrada no servidor do WhatsApp.');
  });
});

describe('useMediaUrl — hardening anti-storm (incidente 2026-08-06)', () => {
  it('expired: falha imediata na 1ª tentativa, sem 2ª chamada, log em debug (não warn)', async () => {
    const { warn, debug } = spyConsole();
    // 410/expired classifica como irrecuperável ('expired').
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error('HTTP 410 Gone — media expired'),
    });

    const { result } = renderHook(() =>
      useMediaUrl({
        instanceName: INSTANCE,
        originalUrl: ORIGINAL_URL,
        messageKey: { ...KEY, id: 'msg-expired-1' },
        enabled: true,
        maxAttempts: 2,
      })
    );

    await act(async () => {
      result.current.onError();
    });

    // Irrecuperável ⇒ failed já na 1ª falha, com apenas 1 tentativa gasta.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(true);
    expect(result.current.attempts).toBe(1);
    expect(result.current.error?.reason).toBe('expired');

    // 2º onError é no-op (failed=true bloqueia antes do invoke) — sem 2ª chamada.
    await act(async () => {
      result.current.onError();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    // Toast anti-flood dispara uma vez (failed virou true).
    expect(toastErrorMock).toHaveBeenCalledTimes(1);

    // Expiração é esperado: loga em debug, não em warn.
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('media refresh failed for'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('cap global: contador esgotado ⇒ sem invoke + failed silencioso (sem toast/warn)', async () => {
    const { warn, debug } = spyConsole();
    resetSessionRefreshAttempts(MAX_SESSION_REFRESH_ATTEMPTS); // simula orçamento esgotado

    const { result } = renderHook(() =>
      useMediaUrl({
        instanceName: INSTANCE,
        originalUrl: ORIGINAL_URL,
        messageKey: { ...KEY, id: 'msg-capped-1' },
        enabled: true,
        maxAttempts: 2,
      })
    );

    await act(async () => {
      result.current.onError();
    });

    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.failed).toBe(true);
    expect(result.current.attempts).toBe(0);
    expect(result.current.error).toBeNull();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    // Rastreabilidade em debug apenas.
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('session refresh cap'));
  });

  it('cap global: consome o orçamento por invoke real e bloqueia o próximo', async () => {
    resetSessionRefreshAttempts(MAX_SESSION_REFRESH_ATTEMPTS - 2);
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error('network error: fetch failed'),
    });

    const { result } = renderHook(() =>
      useMediaUrl({
        instanceName: INSTANCE,
        originalUrl: ORIGINAL_URL,
        messageKey: { ...KEY, id: 'msg-capped-2' },
        enabled: true,
        maxAttempts: 2,
      })
    );

    // Tentativa 1: orçamento 39 < 40 → invoke roda (contador → 40).
    await act(async () => {
      result.current.onError();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // retry() zera o contador LOCAL do hook, mas o global segue em 40.
    await act(async () => {
      await result.current.retry();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);

    // Tentativa 3: 40 >= 40 → bloqueada sem invoke; failed=true.
    await act(async () => {
      result.current.onError();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(result.current.failed).toBe(true);
  });
});
