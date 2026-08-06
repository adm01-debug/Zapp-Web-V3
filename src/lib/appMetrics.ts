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

/** Janela de dedupe: a mesma falha (rota+razão) reemitida dentro deste intervalo vira 1 única métrica. */
const AUTHZ_DEDUPE_WINDOW_MS = 5_000;

// Chave: `${route}\u0000${reason}` → timestamp (nowMs) da última emissão.
// Guarda contra re-renders do mesmo guard (ex.: ProtectedRoute renderizando
// 2x sem sessão) que produziam métricas idênticas a poucos ms de distância.
const lastAuthzEmitAt = new Map<string, number>();

/** Registra uma falha de autorização (não autenticado, role, permission ou timeout). */
export function recordAuthzFailure(failure: Omit<AuthzFailure, 'at'>): void {
  const now = Math.round(nowMs());
  const key = `${failure.route}\u0000${failure.reason}`;
  const last = lastAuthzEmitAt.get(key);
  if (last !== undefined && now - last < AUTHZ_DEDUPE_WINDOW_MS) {
    return; // idempotente: mesma falha dentro da janela já foi emitida e registrada
  }
  lastAuthzEmitAt.set(key, now);
  const entry: AuthzFailure = { ...failure, at: now };
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
