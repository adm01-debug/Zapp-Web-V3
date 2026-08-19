import { test as base, expect, type Page } from '@playwright/test';
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from './test-data';

/**
 * Fixture `authenticatedPage` — faz login via UI e reutiliza storage state
 * dentro do worker. Sessão é persistida em `.auth/user.json`.
 */
const STORAGE_STATE = '.auth/user.json';

export async function loginViaUI(page: Page) {
  await page.goto('/auth');
  await page.getByRole('textbox', { name: /e-?mail/i }).fill(E2E_USER_EMAIL);
  await page.getByRole('textbox', { name: /senha|password/i }).fill(E2E_USER_PASSWORD);
  await page.getByRole('button', { name: /entrar|login/i }).click();
  await expect(page).toHaveURL(/^(?!.*\/auth).*$/, { timeout: 15_000 });
}

type Fixtures = { authenticatedPage: Page };

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    try {
      await loginViaUI(page);
      await context.storageState({ path: STORAGE_STATE });
    } catch (err) {
      console.warn('[e2e] login UI falhou — verifique E2E_USER_EMAIL/PASSWORD', err);
      throw err;
    }
    // `use` aqui é o callback de fixture do Playwright, não o hook React `use`.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    await context.close();
  },
});

export { expect };
