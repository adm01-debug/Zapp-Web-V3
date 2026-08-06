/**
 * Testes do channelErrorLogging — classificação de CHANNEL_ERROR do realtime.
 *
 * Regressão do bug de produção: durante restart do Kong o WebSocket cai, o
 * supabase-js reconecta sozinho, mas os handlers logavam `warn` — ruído no
 * console/Sentry. Regra: conectividade degradada → info; transiente <30s →
 * debug; online (erro real) → warn mantido.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyChannelError,
  logChannelError,
  TRANSIENT_CHANNEL_WINDOW_MS,
} from '../channelErrorLogging';

// Mock do connectivityMonitor — o helper o importa dinamicamente.
const { getSupabaseConnectivityStatusMock } = vi.hoisted(() => ({
  getSupabaseConnectivityStatusMock: vi.fn(),
}));

vi.mock('../connectivityMonitor', () => ({
  getSupabaseConnectivityStatus: getSupabaseConnectivityStatusMock,
}));

type LoggerFn = (message: string, ...args: unknown[]) => void;

function makeLogger() {
  return {
    warn: vi.fn<LoggerFn>(),
    info: vi.fn<LoggerFn>(),
    debug: vi.fn<LoggerFn>(),
  };
}

describe('classifyChannelError', () => {
  beforeEach(() => {
    getSupabaseConnectivityStatusMock.mockReset();
    getSupabaseConnectivityStatusMock.mockReturnValue('online');
  });

  it('rebaixa para info quando a conectividade global é backend-down', async () => {
    getSupabaseConnectivityStatusMock.mockReturnValue('backend-down');
    await expect(classifyChannelError(null)).resolves.toBe('info');
  });

  it('rebaixa para info quando o browser está offline', async () => {
    getSupabaseConnectivityStatusMock.mockReturnValue('offline');
    await expect(classifyChannelError(null)).resolves.toBe('info');
  });

  it('mantém warn quando online (erro real de channel)', async () => {
    getSupabaseConnectivityStatusMock.mockReturnValue('online');
    await expect(classifyChannelError(null)).resolves.toBe('warn');
  });

  it('mantém warn quando a última conexão foi há mais de 30s e status online', async () => {
    getSupabaseConnectivityStatusMock.mockReturnValue('online');
    await expect(classifyChannelError(Date.now() - 60_000)).resolves.toBe('warn');
  });

  it('trata como transiente (debug) quando o canal conectou há menos de 30s', async () => {
    await expect(classifyChannelError(Date.now() - 5_000)).resolves.toBe('debug');
    // O status do monitor nem é consultado no caminho transiente.
    expect(getSupabaseConnectivityStatusMock).not.toHaveBeenCalled();
  });

  it('usa a janela transiente de 30s', () => {
    expect(TRANSIENT_CHANNEL_WINDOW_MS).toBe(30_000);
  });
});

describe('logChannelError (mock do logger)', () => {
  beforeEach(() => {
    getSupabaseConnectivityStatusMock.mockReset();
  });

  it('loga em info (e NÃO em warn) com conectividade backend-down', async () => {
    getSupabaseConnectivityStatusMock.mockReturnValue('backend-down');
    const logger = makeLogger();

    await logChannelError(logger, '[dlq-alert] channel error', null);

    expect(logger.info).toHaveBeenCalledWith('[dlq-alert] channel error');
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('loga em info (e NÃO em warn) com conectividade offline', async () => {
    getSupabaseConnectivityStatusMock.mockReturnValue('offline');
    const logger = makeLogger();

    await logChannelError(logger, '[retry-resolved] channel error', null);

    expect(logger.info).toHaveBeenCalledWith('[retry-resolved] channel error');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('mantém warn quando online — erro real não é engolido', async () => {
    getSupabaseConnectivityStatusMock.mockReturnValue('online');
    const logger = makeLogger();

    await logChannelError(logger, '[dlq-alert] channel error', null);

    expect(logger.warn).toHaveBeenCalledWith('[dlq-alert] channel error');
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('loga em debug (transiente < 30s) e propaga os args', async () => {
    const logger = makeLogger();

    await logChannelError(
      logger,
      'Typing channel error for',
      Date.now() - 1_000,
      '5511999999999@s.whatsapp.net'
    );

    expect(logger.debug).toHaveBeenCalledWith(
      'Typing channel error for',
      '5511999999999@s.whatsapp.net'
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
