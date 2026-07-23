/**
 * App metrics — Time-to-main-screen (TTM) and authorization failures.
 *
 * Expostas via `window.__zappMetrics` e via `console.info('[ZAPP_METRIC] ...')`
 * para que testes Playwright possam capturar sem depender de rede/telemetria.
 *
 * Formato de log (linha única, JSON após o prefixo):
 *   [ZAPP_METRIC] {"kind":"ttm","ms":1234,"route":"/inbox"}
 *   [ZAPP_METRIC] {"kind":"authz_failure","route":"/admin","reason":"role","required":["admin"],"current":["agent"]}
 */

export type AuthzFailureReason = 'unauthenticated' | 'role' | 'permission' | 'timeout';

export interface AuthzFailure {
  route: string;
  reason: AuthzFailureReason;
  required?: string[] | string;
  current?: string[];
  at: number;
}

export interface AppMetricsSnapshot {
  navigationStart: number;
  ttmMs: number | null;
  ttmRoute: string | null;
  authzFailures: AuthzFailure[];
}

const NAV_START =
  typeof performance !== 'undefined' && performance.timeOrigin
    ? performance.timeOrigin
    : Date.now();

const state: AppMetricsSnapshot = {
  navigationStart: NAV_START,
  ttmMs: null,
  ttmRoute: null,
  authzFailures: [],
};

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now() - NAV_START;
}

function emit(payload: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line no-console
    console.info('[ZAPP_METRIC]', JSON.stringify(payload));
  } catch {
    /* ignore serialization errors */
  }
}

/** Marca o momento em que a tela principal ficou visível (primeiro render autorizado). */
export function markTimeToMainScreen(route: string): void {
  if (state.ttmMs !== null) return; // idempotente: só a 1ª navegação conta
  const ms = Math.round(nowMs());
  state.ttmMs = ms;
  state.ttmRoute = route;
  emit({ kind: 'ttm', ms, route });
}

/** Registra uma falha de autorização (não autenticado, role, permission ou timeout). */
export function recordAuthzFailure(failure: Omit<AuthzFailure, 'at'>): void {
  const entry: AuthzFailure = { ...failure, at: Math.round(nowMs()) };
  state.authzFailures.push(entry);
  emit({ kind: 'authz_failure', ...entry });
}

/** Snapshot imutável (cópia rasa) para inspeção via DevTools/Playwright. */
export function getAppMetrics(): AppMetricsSnapshot {
  return {
    ...state,
    authzFailures: [...state.authzFailures],
  };
}

// Expõe no window para testes Playwright: `await page.evaluate(() => window.__zappMetrics)`.
if (typeof window !== 'undefined') {
  (window as unknown as { __zappMetrics: () => AppMetricsSnapshot }).__zappMetrics =
    getAppMetrics;
}
