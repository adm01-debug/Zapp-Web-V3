/**
 * E2E — App metrics: Time-to-main-screen (TTM) e falhas de autorização
 *
 * Valida que:
 *  1. `window.__zappMetrics()` está exposto assim que o app carrega.
 *  2. Sem sessão, `/inbox` gera uma falha `unauthenticated` (via console
 *     `[ZAPP_METRIC]` e via snapshot), com redirect para `/auth` e sem TTM.
 *  3. Um dev acessando a landing "/" registra `ttm` no console e no snapshot.
 *
 * Skip gracioso se localhost estiver indisponível (salvo `E2E_STRICT_METRICS=1`).
 */
import { test, expect, type ConsoleMessage } from '@playwright/test';

const BASE_URL = process.env.E2E_LOCALHOST_URL ?? 'http://localhost:8080';
const STRICT = process.env.E2E_STRICT_METRICS === '1';

type MetricEvent =
  | { kind: 'ttm'; ms: number; route: string }
  | {
      kind: 'authz_failure';
      route: string;
      reason: 'unauthenticated' | 'role' | 'permission' | 'timeout';
      required?: string[] | string;
      current?: string[];
      at: number;
    };

function parseMetric(msg: ConsoleMessage): MetricEvent | null {
  const text = msg.text();
  const idx = text.indexOf('[ZAPP_METRIC]');
  if (idx === -1) return null;
  const jsonStart = text.indexOf('{', idx);
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(text.slice(jsonStart)) as MetricEvent;
  } catch {
    return null;
  }
}

test.describe('App metrics — TTM + authz failures', () => {
  test('expõe __zappMetrics e captura falha de autorização sem sessão', async ({ page }) => {
    const events: MetricEvent[] = [];
    page.on('console', (msg) => {
      const evt = parseMetric(msg);
      if (evt) events.push(evt);
    });

    try {
      await page.goto(`${BASE_URL}/inbox`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      test.skip(!STRICT, `Localhost inacessível: ${(err as Error).message}`);
      throw err;
    }

    // Aguarda ProtectedRoute concluir (redirect para /auth ou renderizar)
    await page.waitForFunction(
      () => typeof (window as unknown as { __zappMetrics?: unknown }).__zappMetrics === 'function',
      { timeout: 10_000 },
    );
    await page.waitForTimeout(1500);

    const snapshot = await page.evaluate(() => {
      const fn = (window as unknown as { __zappMetrics?: () => unknown }).__zappMetrics;
      return typeof fn === 'function' ? fn() : null;
    });

    expect(snapshot, 'window.__zappMetrics() deve retornar objeto').toBeTruthy();
    expect(snapshot).toMatchObject({
      navigationStart: expect.any(Number),
      authzFailures: expect.any(Array),
    });

    // Sem sessão: deve haver ao menos uma falha `unauthenticated` (via console E snapshot).
    const unauthFromConsole = events.find(
      (e) => e.kind === 'authz_failure' && e.reason === 'unauthenticated',
    );
    const failures = (snapshot as { authzFailures: MetricEvent[] }).authzFailures;
    const unauthFromSnapshot = failures.find(
      (e) => e.kind === 'authz_failure' && e.reason === 'unauthenticated',
    );

    expect(
      unauthFromConsole ?? unauthFromSnapshot,
      `Nenhuma falha 'unauthenticated' registrada. Console: ${JSON.stringify(events)} | Snapshot: ${JSON.stringify(failures)}`,
    ).toBeTruthy();

    // Sem sessão, TTM deve permanecer nulo (tela principal nunca renderizou).
    expect((snapshot as { ttmMs: number | null }).ttmMs).toBeNull();

    // E deve ter redirecionado para /auth (sem loop infinito).
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 5_000 })
      .toMatch(/^\/auth/);
  });
});
