// Manual mock para o logger usado em testes (Vitest).
// Centraliza a forma completa do logger para que testes não precisem
// declarar mocks inline parciais (que omitiam `warn`/`getLogger` e quebravam).
// Como nenhum teste faz assert direto nas chamadas do logger, expomos vi.fn()
// estáveis e silenciosos cobrindo toda a superfície pública de '@/lib/logger'.
import { vi } from 'vitest';

const makeLevels = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const withCorrelation = () => ({ ...makeLevels() });

/** log. */
export const log = { ...makeLevels(), withCorrelation };
/** logger. */
export const logger = { ...makeLevels(), withCorrelation };

/** create Logger. */
export const createLogger = vi.fn(() => ({ ...makeLevels(), withCorrelation }));
/** get Logger. */
export const getLogger = vi.fn(() => ({ ...makeLevels(), withCorrelation }));

/** generate Correlation Id. */
export const generateCorrelationId = vi.fn((prefix = 'req') => `${prefix}_test_0`);
/** get Session Id. */
export const getSessionId = vi.fn(() => 'test-session');

/** log Performance. */
export const logPerformance = vi.fn((_label: string, fn: () => void) => fn());
/** log Async Performance. */
export const logAsyncPerformance = vi.fn(
  async <T,>(_label: string, fn: () => Promise<T>): Promise<T> => fn(),
);
