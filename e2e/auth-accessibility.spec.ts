import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Regressão de acessibilidade da tela /auth.
 *
 * Falha se qualquer regra SERIOUS/CRITICAL do axe voltar a violar. Estas
 * regras já foram corrigidas manualmente e não devem regredir:
 *  - color-contrast (tokens semânticos, sem #000 forçado em light mode)
 *  - aria-prohibited-attr (toaster com role="region")
 *  - button-name (PasswordInput com aria-label)
 *  - landmark-one-main (Auth envolve conteúdo em <main>)
 *  - skip-link (SkipLinks só renderiza alvos que existem no DOM)
 */
test.describe('Acessibilidade /auth (regressão)', () => {
  test('não deve conter violações SERIOUS ou CRITICAL do axe', async ({ page }) => {
    await page.goto('/auth', { waitUntil: 'networkidle' });
    // Aguarda animações e mount completo do form + hero.
    await page.waitForSelector('label[for="login-email"]', { timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules([
        // Ruído conhecido do fallback de spinner antes do lazy mount.
        'page-has-heading-one',
      ])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );

    // Log detalhado para diagnóstico rápido em CI.
    if (blocking.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        'Violações a11y:',
        JSON.stringify(
          blocking.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, html: n.html?.slice(0, 200) })),
          })),
          null,
          2
        )
      );
    }

    expect(blocking).toEqual([]);
  });
});
