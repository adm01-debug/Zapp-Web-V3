/**
 * E2E — No Workbox precache + boot < 6s
 *
 * Valida, tanto no dev local (`localhost`) quanto em preview Lovable
 * (`id-preview--*.lovable.app`, simulado via proxy), que:
 *
 *  1. Nenhum script `workbox-*.js` é requisitado (precache Workbox ausente).
 *  2. Nenhuma cache do tipo `workbox-precache-*` é criada no CacheStorage.
 *  3. A tela carrega e fica interativa em ≤ 6 s, sem ficar presa em
 *     spinner de "Verificando acesso e permissões...".
 */
import { test, expect, type Route } from '@playwright/test';

const PREVIEW_ORIGIN = 'https://id-preview--zapp-test.lovable.app';
const DEV_ORIGIN = 'http://localhost:5173';
const BOOT_BUDGET_MS = 6000;

async function proxyToDev(route: Route) {
  const url = new URL(route.request().url());
  const target = `${DEV_ORIGIN}${url.pathname}${url.search}`;
  try {
    const res = await route.fetch({ url: target });
    const headers = { ...res.headers() };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    await route.fulfill({ response: res, headers });
  } catch {
    await route.abort();
  }
}

async function runBootAudit(page: import('@playwright/test').Page, url: string) {
  const workboxRequests: string[] = [];
  page.on('request', (req) => {
    const u = req.url().toLowerCase();
    if (u.includes('workbox-') && u.endsWith('.js')) workboxRequests.push(req.url());
  });

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Boot budget: precisa sair do spinner "Verificando acesso..." em ≤ 6s.
  // Aceitamos QUALQUER estado final (auth, dashboard, erro visível) — só não
  // pode ficar preso no gate de autenticação.
  await expect
    .poll(
      async () => {
        const text = (await page.locator('body').innerText().catch(() => '')) ?? '';
        return !/Verificando acesso e permissões/i.test(text);
      },
      { timeout: BOOT_BUDGET_MS, message: 'App ficou preso no spinner de boot' },
    )
    .toBe(true);

  const bootMs = Date.now() - t0;

  const cacheKeys: string[] = await page.evaluate(async () =>
    typeof caches !== 'undefined' ? await caches.keys() : [],
  );
  const workboxCaches = cacheKeys.filter((k) => /workbox-precache/i.test(k));

  return { bootMs, workboxRequests, workboxCaches };
}

test.describe('No Workbox precache + boot ≤ 6s', () => {
  test('localhost dev não precacheia workbox e carrega em ≤ 6s', async ({ page }) => {
    const { bootMs, workboxRequests, workboxCaches } = await runBootAudit(page, DEV_ORIGIN + '/');
    expect(workboxRequests, `Requests Workbox detectadas: ${workboxRequests.join(', ')}`).toEqual([]);
    expect(workboxCaches, `Caches Workbox detectadas: ${workboxCaches.join(', ')}`).toEqual([]);
    expect(bootMs, `Boot demorou ${bootMs}ms`).toBeLessThanOrEqual(BOOT_BUDGET_MS);
  });

  test('preview id-preview--*.lovable.app não precacheia workbox e carrega em ≤ 6s', async ({
    page,
    context,
  }) => {
    await context.route(`${PREVIEW_ORIGIN}/**`, proxyToDev);
    const { bootMs, workboxRequests, workboxCaches } = await runBootAudit(
      page,
      PREVIEW_ORIGIN + '/',
    );
    expect(workboxRequests, `Requests Workbox detectadas: ${workboxRequests.join(', ')}`).toEqual([]);
    expect(workboxCaches, `Caches Workbox detectadas: ${workboxCaches.join(', ')}`).toEqual([]);
    expect(bootMs, `Boot demorou ${bootMs}ms`).toBeLessThanOrEqual(BOOT_BUDGET_MS);
  });
});
