/**
 * E2E — CacheStorage sem `workbox-precache-v2-*` após abrir o app e após update forçado
 *
 * Cobre localhost e preview público. Em cada URL:
 *
 *  1. Abre o app, aguarda idle e valida `caches.keys()` sem `workbox-precache-v2-*`.
 *  2. Dispara update forçado (unregister SWs + reload com cache bypass) e revalida.
 *
 * Skip gracioso quando o endpoint está inacessível, salvo `E2E_STRICT_WB_CACHE=1`.
 */
import { test, expect, type Page } from '@playwright/test';

const LOCALHOST_URL = process.env.E2E_LOCALHOST_URL ?? 'http://localhost:8080/';
const PREVIEW_URL =
  process.env.E2E_PREVIEW_URL ??
  'https://id-preview--22c0b518-7895-4f4f-9ea0-978457a2c37a.lovable.app/';
const STRICT = process.env.E2E_STRICT_WB_CACHE === '1';

const WB_PRECACHE_RE = /^workbox-precache-v2-/i;

async function listWorkboxPrecacheKeys(page: Page): Promise<string[]> {
  return page.evaluate(async (pattern) => {
    if (typeof caches === 'undefined') return [] as string[];
    const re = new RegExp(pattern, 'i');
    const keys = await caches.keys();
    return keys.filter((k) => re.test(k));
  }, WB_PRECACHE_RE.source);
}

async function forceUpdate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1500);
}

async function auditWorkboxPrecache(page: Page, url: string): Promise<{
  afterOpen: string[];
  afterForceUpdate: string[];
} | null> {
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

  await page.waitForTimeout(1500);
  const afterOpen = await listWorkboxPrecacheKeys(page);

  await forceUpdate(page);
  const afterForceUpdate = await listWorkboxPrecacheKeys(page);

  return { afterOpen, afterForceUpdate };
}

function assertEmpty(keys: string[], label: string) {
  expect(
    keys,
    `[${label}] CacheStorage contém workbox-precache-v2-*: ${keys.join(', ')}`,
  ).toEqual([]);
}

test.describe('CacheStorage sem workbox-precache-v2-* — localhost + preview', () => {
  test(`localhost (${LOCALHOST_URL})`, async ({ page }) => {
    const result = await auditWorkboxPrecache(page, LOCALHOST_URL);
    test.skip(result === null, 'Localhost inacessível');
    assertEmpty(result!.afterOpen, 'localhost:after-open');
    assertEmpty(result!.afterForceUpdate, 'localhost:after-force-update');
  });

  test(`preview (${PREVIEW_URL})`, async ({ page }) => {
    const result = await auditWorkboxPrecache(page, PREVIEW_URL);
    test.skip(result === null, 'Preview inacessível');
    assertEmpty(result!.afterOpen, 'preview:after-open');
    assertEmpty(result!.afterForceUpdate, 'preview:after-force-update');
  });
});
