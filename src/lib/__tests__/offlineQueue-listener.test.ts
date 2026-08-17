/**
 * Contrato do setupOnlineListener (Etapa 22 — fila offline / ADR-005).
 *
 * Antes do fix: (1) o SW escutava a tag errada ('send-messages' vs
 * 'send-queued-messages'); (2) o handler do SW era um console.log vazio;
 * (3) setupOnlineListener nunca era chamado no boot.
 *
 * Contrato pós-fix:
 * - mensagem 'PROCESS_OFFLINE_QUEUE' do SW → processa a fila;
 * - evento 'online' → processa a fila;
 * - boot com navigator.onLine=true → processa a fila;
 * - cleanup remove todos os listeners.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { offlineQueue, setupOnlineListener } from '@/lib/offlineQueue';

describe('setupOnlineListener — fila offline (ADR-005)', () => {
  const windowListeners = new Map<string, EventListener>();
  const swListeners = new Map<string, EventListener>();

  beforeEach(() => {
    vi.clearAllMocks();
    windowListeners.clear();
    swListeners.clear();
    vi.spyOn(offlineQueue, 'getAll').mockResolvedValue([]);
    vi.spyOn(offlineQueue, 'remove').mockResolvedValue(undefined);
    vi.spyOn(offlineQueue, 'update').mockResolvedValue(undefined);

    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListener) => {
      windowListeners.set(type, fn);
    });
    vi.spyOn(window, 'removeEventListener').mockImplementation((type: string) => {
      windowListeners.delete(type);
    });
    vi.stubGlobal('navigator', {
      onLine: false,
      serviceWorker: {
        addEventListener: vi.fn((type: string, fn: EventListener) => {
          swListeners.set(type, fn);
        }),
        removeEventListener: vi.fn((type: string) => {
          swListeners.delete(type);
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('processa a fila quando o SW pede (PROCESS_OFFLINE_QUEUE)', async () => {
    setupOnlineListener();
    (navigator as unknown as { onLine: boolean }).onLine = true;

    const handler = swListeners.get('message');
    expect(handler).toBeTypeOf('function');

    (handler as EventListener)({
      data: { type: 'PROCESS_OFFLINE_QUEUE' },
    } as unknown as MessageEvent);

    // processa async — aguarda microtasks
    await vi.waitFor(() => {
      expect(offlineQueue.getAll).toHaveBeenCalled();
    });
  });

  it('ignora mensagens do SW de outro tipo', async () => {
    setupOnlineListener();

    const handler = swListeners.get('message');
    (handler as EventListener)({
      data: { type: 'SW_UPDATED', buildId: 'x' },
    } as unknown as MessageEvent);

    await new Promise((r) => setTimeout(r, 10));
    expect(offlineQueue.getAll).not.toHaveBeenCalled();
  });

  it('processa a fila no evento online', async () => {
    setupOnlineListener();
    (navigator as unknown as { onLine: boolean }).onLine = true;

    const onlineHandler = windowListeners.get('online');
    expect(onlineHandler).toBeTypeOf('function');

    (onlineHandler as EventListener)(new Event('online'));

    await vi.waitFor(() => {
      expect(offlineQueue.getAll).toHaveBeenCalled();
    });
  });

  it('cleanup remove os listeners', () => {
    const cleanup = setupOnlineListener();
    cleanup();

    expect(windowListeners.has('online')).toBe(false);
    expect(windowListeners.has('offline')).toBe(false);
    expect(swListeners.has('message')).toBe(false);
  });

  it('registra o listener de mensagem apenas com serviceWorker disponível', () => {
    vi.stubGlobal('navigator', { onLine: false });
    setupOnlineListener();
    expect(swListeners.size).toBe(0);
    expect(windowListeners.has('online')).toBe(true);
  });
});
