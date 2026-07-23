/**
 * E2E — No Workbox após reload (preview + domínio publicado)
 *
 * Complementa `no-workbox-precache.spec.ts`: aponta para as URLs REAIS de
 * preview e do domínio publicado, faz um primeiro load, dispara `reload()`
 * e valida em ambos que após o reload:
 *
 *  1. Nenhum script `workbox-*.js` foi requisitado.
 *  2. Nenhuma cache `workbox-precache-*` existe no CacheStorage.
 *  3. Nenhum Service Worker ativo aponta para um script com `workbox` na URL.
 *
 * Skips graciosamente quando o endpoint não é alcançável (rede/CI offline),
 * para não falsear falhas em pipelines desconectados. Para forçar execução
 * mesmo com URLs indisponíveis, defina `E2E_STRICT_WORKBOX=1`.
 */
import { test, expect, type Page } from '@playwright/test';

const PREVIEW_URL =
  process.env.E2E_PREVIEW_URL ??
  'https://id-preview--22c0b518-7895-4f4f-9ea0-978457a2c37a.lovable.app/';
const PUBLISHED_URL =
  process.env.E2E_PUBLISHED_URL ?? 'https://whats-your-line.lovable.app/';
const STRICT = process.env.E2E_STRICT_WORKBOX === '1';

type AuditResult = {
  workboxRequests: string[];
  workboxCaches: string[];
  workboxSWs: string[];
};

async function auditWorkbox(page: Page, url: string): Promise<AuditResult | null> {
  const workboxRequests: string[] = [];
  const record = (u: string) => {
    const lower = u.toLowerCase();
    if (/workbox-[^/]*\.js(\?|$)/.test(lower)) workboxRequests.push(u);
  };
  page.on('request', (req) => record(req.url()));

  // First load — tolerate transient errors (DNS, TLS) unless STRICT.
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  } catch (err) {
    if (!STRICT) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: `Unreachable: ${url} (${(err as Error).message})`,
      });
      return null;
    }
    throw err;
  }

  // Give the client-side workbox-detector + SW cleanup a chance to run.
  await page.waitForTimeout(1500);

  // Reload — this is the key contract: after reload, workbox must be gone.
  workboxRequests.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1500);

  const workboxCaches: string[] = await page.evaluate(async () => {
    if (typeof caches === 'undefined') return [];
    const keys = await caches.keys();
    return keys.filter((k) => /workbox-precache/i.test(k));
  });

  const workboxSWs: string[] = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return [];
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs
      .map(
        (r) =>
          (r.active && r.active.scriptURL) ||
          (r.waiting && r.waiting.scriptURL) ||
          (r.installing && r.installing.scriptURL) ||
          '',
      )
      .filter((u) => u && /workbox/i.test(u));
  });

  return { workboxRequests, workboxCaches, workboxSWs };
}

function assertClean(result: AuditResult, label: string) {
  expect(
    result.workboxRequests,
    `[${label}] Workbox JS requests após reload: ${result.workboxRequests.join(', ')}`,
  ).toEqual([]);
  expect(
    result.workboxCaches,
    `[${label}] Workbox caches após reload: ${result.workboxCaches.join(', ')}`,
  ).toEqual([]);
  expect(
    result.workboxSWs,
    `[${label}] Service Workers com Workbox após reload: ${result.workboxSWs.join(', ')}`,
  ).toEqual([]);
}

test.describe('No Workbox após reload — preview + publicado', () => {
  test(`preview (${PREVIEW_URL}) sem workbox após reload`, async ({ page }) => {
    const result = await auditWorkbox(page, PREVIEW_URL);
    test.skip(result === null, 'Preview URL inacessível (rede/CI offline)');
    assertClean(result!, 'preview');
  });

  test(`publicado (${PUBLISHED_URL}) sem workbox após reload`, async ({ page }) => {
    const result = await auditWorkbox(page, PUBLISHED_URL);
    test.skip(result === null, 'Published URL inacessível (rede/CI offline)');
    assertClean(result!, 'publicado');
  });
});
