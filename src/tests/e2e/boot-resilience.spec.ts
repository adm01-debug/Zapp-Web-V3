/**
 * boot-resilience — valida que o SPA não trava em loop quando o backend
 * Supabase self-hosted está offline/lento. Bloqueia toda chamada ao host
 * supabase.atomicabr.com.br e verifica que:
 *   1. #root recebe conteúdo mesmo sem backend.
 *   2. A página não entra em loop infinito de reload (safety-net removido).
 *   3. A UI de erro ou a tela /auth acaba renderizando (sem spinner eterno).
 */
import { test, expect } from '@playwright/test';

test.describe('boot resilience (backend offline)', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(/supabase\.atomicabr\.com\.br/, (route) => route.abort('failed'));
  });

  test('SPA monta e não reloada em loop com backend inacessível', async ({ page }) => {
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    await page.goto('/');
    await expect
      .poll(() => page.locator('#root *').count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    // Aguarda janela onde reload-loop antigo (6s) dispararia várias vezes.
    await page.waitForTimeout(15_000);

    expect(navigations, 'não deve haver loop de reload').toBeLessThanOrEqual(3);
  });

  test('após timeout de bootstrap a UI apresenta escape (erro ou /auth)', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(
        async () => {
          const url = page.url();
          const errorVisible = await page
            .getByRole('alert')
            .filter({ hasText: /não foi possível conectar/i })
            .count();
          const authVisible = /\/auth/.test(url);
          return errorVisible > 0 || authVisible;
        },
        { timeout: 25_000, message: 'deve mostrar erro de conexão OU redirecionar para /auth' },
      )
      .toBeTruthy();
  });
});
