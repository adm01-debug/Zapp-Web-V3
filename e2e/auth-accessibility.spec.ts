import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Regressão de acessibilidade das telas de autenticação.
 *
 * Cobre /auth, /forgot-password e /reset-password em modo claro e escuro.
 * Falha se qualquer regra SERIOUS/CRITICAL do axe voltar a violar. Estas
 * regras já foram corrigidas e não devem regredir:
 *  - color-contrast (tokens semânticos, sem #000 forçado em light mode)
 *  - aria-prohibited-attr (toaster com role="region")
 *  - button-name (PasswordInput com aria-label)
 *  - landmark-one-main (páginas envolvem conteúdo em <main>)
 *  - skip-link (SkipLinks só renderiza alvos que existem no DOM)
 */

const IGNORED_RULES = [
  // Ruído conhecido do fallback de spinner antes do lazy mount.
  'page-has-heading-one',
];

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(t);
    try {
      localStorage.setItem('theme', t);
      localStorage.setItem('vite-ui-theme', t);
    } catch {
      /* storage indisponível */
    }
  }, theme);
}

async function runAxe(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(IGNORED_RULES)
    .analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical'
  );

  if (blocking.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `Violações a11y (${label}):`,
      JSON.stringify(
        blocking.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 3).map((n) => ({
            target: n.target,
            html: n.html?.slice(0, 200),
          })),
        })),
        null,
        2
      )
    );
  }

  expect(blocking, `Violações SERIOUS/CRITICAL em ${label}`).toEqual([]);
}

const ROUTES: Array<{ path: string; readySelector: string; label: string }> = [
  {
    path: '/auth',
    readySelector: 'label[for="login-email"]',
    label: '/auth',
  },
  {
    path: '/forgot-password',
    readySelector: 'form',
    label: '/forgot-password',
  },
  {
    path: '/reset-password',
    readySelector: 'main, form',
    label: '/reset-password',
  },
];

for (const route of ROUTES) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`Acessibilidade ${route.label} [${theme}]`, () => {
      test(`sem violações SERIOUS/CRITICAL do axe em ${theme}`, async ({ page }) => {
        // Aplica tema antes de qualquer render para evitar flash.
        await page.addInitScript((t) => {
          const root = document.documentElement;
          root.classList.remove('light', 'dark');
          root.classList.add(t);
          try {
            localStorage.setItem('theme', t);
            localStorage.setItem('vite-ui-theme', t);
          } catch {
            /* ignore */
          }
        }, theme);

        await page.goto(route.path, { waitUntil: 'networkidle' });
        await setTheme(page, theme);
        await page.waitForSelector(route.readySelector, { timeout: 10_000 }).catch(() => {
          /* algumas rotas podem redirecionar; axe roda no que estiver renderizado */
        });
        await page.waitForTimeout(800);

        await runAxe(page, `${route.label} ${theme}`);
      });
    });
  }
}
