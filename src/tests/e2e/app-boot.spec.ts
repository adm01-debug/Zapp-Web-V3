/**
 * app-boot — suite E2E HERMÉTICA (2026-07-06)
 *
 * CONTEXTO: o playwright.config.ts aponta testDir=./src/tests/e2e, que estava
 * VAZIO. Playwright com zero testes sai com exit 1 em ~3s — o job "E2E tests"
 * do CI ficou vermelho perpétuo em main sem nenhum teste rodar de fato.
 *
 * Esta suite roda 100% contra o vite dev server local com env placeholder
 * (sem backend vivo, sem credenciais): valida que o SPA serve, monta React
 * dentro de #root e define título. Cobertura real de boot, não decorativa.
 * A suite completa (./e2e na raiz) exige backend + login e pertence ao
 * smoke pre-deploy — fora deste gate efêmero (decisão já documentada no
 * quality-gate.yml).
 *
 * Nota: index.html tem safety-reload de 6s quando #root fica vazio; os polls
 * abaixo toleram um reload intermediário.
 */
import { test, expect } from '@playwright/test';

test.describe('app boot (hermetic smoke)', () => {
  test('SPA shell responde com HTTP < 400 e #root presente', async ({ page }) => {
    const response = await page.goto('/');
    expect(response, 'page.goto deve retornar response').not.toBeNull();
    expect(response!.status(), 'status HTTP do shell').toBeLessThan(400);
    await expect(page.locator('#root')).toBeAttached();
  });

  test('React monta conteúdo dentro de #root', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(async () => page.locator('#root *').count(), {
        timeout: 30_000,
        message: '#root deve receber filhos (app React montado)',
      })
      .toBeGreaterThan(0);
  });

  test('documento define <title> não-vazio', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(async () => (await page.title()).trim().length, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});
