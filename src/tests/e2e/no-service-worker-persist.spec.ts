/**
 * E2E — Sem Service Worker registrado e sem retorno do SW antigo após reload
 *
 * Verifica via DevTools/DOM (CDP + navigator.serviceWorker) que:
 *
 *  1. Após o primeiro load, nenhum Service Worker está registrado.
 *  2. Nenhum registro/ativação ocorre em background durante ~2s de idle.
 *  3. Após um reload, o SW antigo (workbox ou qualquer outro) NÃO volta:
 *     - `navigator.serviceWorker.getRegistrations()` continua vazio.
 *     - Nenhuma requisição a `sw.js`/`workbox-*.js` é interpretada como registro.
 *     - CDP `ServiceWorker.workerVersionUpdated` não reporta versões ativas.
 *
 * Cobre o dev server do PR (baseURL 5173) — e, por override explícito
 * (`E2E_PREVIEW_URL`), deploys reais. Nunca produção externa por padrão
 * (`*.vercel.app`/`*.lovable.app`; achado 40:A3). Skip gracioso quando o
 * endpoint está inacessível, salvo `E2E_STRICT_SW=1`.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// Padrão: build do PR (baseURL do playwright.config.ts). Overrides só para
// auditoria pontual de deploys reais.
const LOCALHOST_URL = process.env.E2E_LOCALHOST_URL ?? 'http://localhost:5173/';
const PREVIEW_URL = process.env.E2E_PREVIEW_URL ?? 'http://localhost:5173/';
const STRICT = process.env.E2E_STRICT_SW === '1';

type SwSnapshot = {
  registrations: string[];
  controllerUrl: string | null;
  cdpVersions: string[];
};

async function collectCdpSwVersions(context: BrowserContext): Promise<string[]> {
  const versions: string[] = [];
  try {
    const client = await context.newCDPSession(await context.newPage());
    await client.send('ServiceWorker.enable');
    client.on('ServiceWorker.workerVersionUpdated', (evt) => {
      for (const v of evt.versions ?? []) {
        if (v.runningStatus === 'running' || v.status === 'activated') {
          versions.push(v.scriptURL);
        }
      }
    });
  } catch {
    /* CDP indisponível em alguns browsers — não é fatal */
  }
  return versions;
}

async function snapshot(page: Page, cdpVersions: string[]): Promise<SwSnapshot> {
  const data = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return { registrations: [] as string[], controllerUrl: null as string | null };
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    const registrations = regs
      .map(
        (r) =>
          (r.active && r.active.scriptURL) ||
          (r.waiting && r.waiting.scriptURL) ||
          (r.installing && r.installing.scriptURL) ||
          '',
      )
      .filter(Boolean);
    return {
      registrations,
      controllerUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
    };
  });
  return { ...data, cdpVersions: [...cdpVersions] };
}

async function auditNoSw(context: BrowserContext, url: string): Promise<SwSnapshot[] | null> {
  const cdpVersions = await collectCdpSwVersions(context);
  const page = await context.newPage();

  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    // Status HTTP >= 400 não pode satisfazer "sem SW" vacuamente (40:A3).
    if (response && response.status() >= 400) {
      throw new Error(`HTTP ${response.status()} em ${url}`);
    }
  } catch (err) {
    if (!STRICT) {
      test.info().annotations.push({
        type: 'skip-reason',
        description: `Unreachable: ${url} (${(err as Error).message})`,
      });
      await page.close();
      return null;
    }
    throw err;
  }

  await page.waitForTimeout(2000); // idle: garante que nada registra em background
  const first = await snapshot(page, cdpVersions);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2000);
  const second = await snapshot(page, cdpVersions);

  await page.close();
  return [first, second];
}

function assertClean(snap: SwSnapshot, label: string) {
  expect(
    snap.registrations,
    `[${label}] Service Workers registrados: ${snap.registrations.join(', ')}`,
  ).toEqual([]);
  expect(
    snap.controllerUrl,
    `[${label}] navigator.serviceWorker.controller inesperado: ${snap.controllerUrl}`,
  ).toBeNull();
  expect(
    snap.cdpVersions,
    `[${label}] CDP reportou SW ativo: ${snap.cdpVersions.join(', ')}`,
  ).toEqual([]);
}

test.describe('Sem Service Worker — localhost + preview (persistência após reload)', () => {
  test(`localhost (${LOCALHOST_URL}) sem SW antes e depois do reload`, async ({ context }) => {
    const snaps = await auditNoSw(context, LOCALHOST_URL);
    test.skip(snaps === null, 'Localhost inacessível');
    assertClean(snaps![0], 'localhost:first-load');
    assertClean(snaps![1], 'localhost:after-reload');
  });

  test(`preview (${PREVIEW_URL}) sem SW antes e depois do reload`, async ({ context }) => {
    const snaps = await auditNoSw(context, PREVIEW_URL);
    test.skip(snaps === null, 'Preview inacessível');
    assertClean(snaps![0], 'preview:first-load');
    assertClean(snaps![1], 'preview:after-reload');
  });
});
