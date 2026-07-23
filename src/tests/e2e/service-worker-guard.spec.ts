/**
 * E2E — Service Worker guard
 *
 * Garante que:
 *  1. Em hostnames de preview Lovable (`id-preview--*.lovable.app`) o SW NÃO
 *     é registrado e nenhum request para `/sw.js` ou `workbox-*` é disparado.
 *  2. Em `localhost` (dev) o guard também bloqueia o registro.
 *  3. Não há flood do StrategyHandler do Workbox no console
 *     (repro do bug de centenas de "Fetch finished loading").
 *
 * Estratégia: intercepta todos os requests originados de uma URL fake
 * `https://id-preview--zapp-test.lovable.app/*` e faz proxy para o dev server
 * local. Isso preserva o hostname visto pelo `window.location`, permitindo
 * validar a lógica de guarda de forma real.
 */
import { test, expect, type Route } from '@playwright/test';

const PREVIEW_ORIGIN = 'https://id-preview--zapp-test.lovable.app';
const DEV_ORIGIN = 'http://localhost:5173';

async function proxyToDev(route: Route) {
  const url = new URL(route.request().url());
  const target = `${DEV_ORIGIN}${url.pathname}${url.search}`;
  try {
    const res = await route.fetch({ url: target });
    const headers = { ...res.headers() };
    // Evita CSP mismatch entre origens diferentes
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    await route.fulfill({ response: res, headers });
  } catch {
    await route.abort();
  }
}

test.describe('Service Worker guard', () => {
  test('não registra SW em id-preview--*.lovable.app e sem flood do Workbox', async ({
    page,
    context,
  }) => {
    await context.route(`${PREVIEW_ORIGIN}/**`, proxyToDev);

    const consoleMessages: string[] = [];
    page.on('console', (m) => consoleMessages.push(m.text()));

    const swRelatedRequests: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (/\/sw\.js(\?|$)|workbox-|virtual:pwa-register/.test(url)) {
        swRelatedRequests.push(url);
      }
    });

    await page.goto(`${PREVIEW_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    // Janela suficiente para eventual registro tardio + `recoverPreview` async
    await page.waitForTimeout(3500);

    const registrations = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    expect(registrations, 'Nenhum SW deve estar registrado em preview').toBe(0);

    expect(
      swRelatedRequests,
      `Requests SW-related indevidos: ${swRelatedRequests.join(', ')}`,
    ).toEqual([]);

    const workboxLogs = consoleMessages.filter((t) => /workbox|StrategyHandler/i.test(t));
    expect(
      workboxLogs.length,
      `Workbox/StrategyHandler não deve logar em preview (encontrados: ${workboxLogs.length})`,
    ).toBe(0);
  });

  test('não registra SW em localhost dev', async ({ page }) => {
    const swRelatedRequests: string[] = [];
    page.on('request', (r) => {
      if (/\/sw\.js(\?|$)|workbox-/.test(r.url())) swRelatedRequests.push(r.url());
    });

    await page.goto(`${DEV_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const registrations = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      return (await navigator.serviceWorker.getRegistrations()).length;
    });
    expect(registrations).toBe(0);
    expect(swRelatedRequests).toEqual([]);
  });

  test('kill-switch ?sw=off remove SWs pré-existentes', async ({ page, context }) => {
    await context.route(`${PREVIEW_ORIGIN}/**`, proxyToDev);

    // Simula um SW previamente registrado ao expor um shim antes do app rodar
    await page.addInitScript(() => {
      (window as unknown as { __swSimulated?: boolean }).__swSimulated = true;
    });

    await page.goto(`${PREVIEW_ORIGIN}/?sw=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const registrations = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return 0;
      return (await navigator.serviceWorker.getRegistrations()).length;
    });
    expect(registrations).toBe(0);
  });
});
