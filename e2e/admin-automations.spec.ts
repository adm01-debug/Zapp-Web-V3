/**
 * E2E — /admin/automations
 * Cobre: skeleton de loading, estado de erro (mock 500 + detalhes),
 * botão de retry e estado de sucesso (lista renderiza).
 *
 * Nota: usa route-level mock do PostgREST para o schema zapp.
 */
import { test, expect, type Route } from '@playwright/test';

const AUTOMATIONS_URL_RE = /\/rest\/v1\/automations/i;

test.describe('AdminAutomationsPage', () => {
  test('mostra skeleton, erro com detalhes e recupera após retry', async ({ page }) => {
    let hits = 0;
    await page.route(AUTOMATIONS_URL_RE, async (route: Route) => {
      hits += 1;
      if (hits <= 3) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Simulated 500 from PostgREST', code: 'XX000' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/admin/automations');

    // 1. Skeleton visível no primeiro paint
    await expect(page.locator('.animate-pulse, [data-testid*="skeleton"]').first()).toBeVisible({
      timeout: 5000,
    });

    // 2. Card de erro após retries esgotarem
    const errorCard = page.getByTestId('automations-error');
    await expect(errorCard).toBeVisible({ timeout: 15000 });

    // 3. Toggle de detalhes técnicos
    await page.getByTestId('automations-error-toggle').click();
    await expect(page.getByTestId('automations-error-details')).toBeVisible();
    await expect(page.getByTestId('automations-error-details')).toContainText('Simulated 500');

    // 4. Retry recupera (rota agora responde 200)
    hits = 100; // força fulfill 200
    await page.getByTestId('automations-retry').click();
    await expect(errorCard).toBeHidden({ timeout: 10000 });
  });

  test('renderiza sem erros quando o backend responde 200', async ({ page }) => {
    await page.route(AUTOMATIONS_URL_RE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    );

    await page.goto('/admin/automations');
    await expect(page.getByTestId('automations-error')).toBeHidden();
    await expect(page.getByRole('heading', { name: /automações/i }).first()).toBeVisible();
  });
});
