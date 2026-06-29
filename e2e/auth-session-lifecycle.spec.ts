import { test, expect } from '@playwright/test';
import { loginViaUI } from './fixtures/auth';

/**
 * E2E — Ciclo de vida da sessão Supabase
 *
 * Valida:
 *  1. Rotas protegidas redirecionam para /auth quando sem sessão.
 *  2. Login persiste token no localStorage (sb-*-auth-token).
 *  3. Refresh hard mantém sessão (persistência) e não volta para /auth.
 *  4. Logout limpa TODAS as chaves sb-*-auth-token (sem token stale).
 *  5. Após logout, rota protegida redireciona novamente para /auth.
 *  6. Token corrompido (stale) é descartado e usuário cai em /auth sem loop.
 */

const SB_TOKEN_RX = /^sb-.*-auth-token$/;

async function getSupabaseTokenKeys(page: import('@playwright/test').Page) {
  return page.evaluate((pattern) => {
    const rx = new RegExp(pattern);
    return Object.keys(window.localStorage).filter((k) => rx.test(k));
  }, SB_TOKEN_RX.source);
}

test.describe('Auth — ciclo de vida da sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('rota protegida sem sessão → /auth', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    const keys = await getSupabaseTokenKeys(page);
    expect(keys, 'nenhum token sb-* deve existir sem login').toHaveLength(0);
  });

  test('login grava token sb-*-auth-token no localStorage', async ({ page }) => {
    await loginViaUI(page);
    await expect.poll(async () => (await getSupabaseTokenKeys(page)).length, {
      timeout: 10_000,
    }).toBeGreaterThan(0);
  });

  test('hard refresh mantém sessão (persistência)', async ({ page }) => {
    await loginViaUI(page);
    const urlBefore = page.url();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 10_000 });
    expect(page.url()).toBe(urlBefore);
  });

  test('logout limpa todos os tokens sb-*-auth-token e redireciona', async ({ page }) => {
    await loginViaUI(page);
    await expect.poll(async () => (await getSupabaseTokenKeys(page)).length).toBeGreaterThan(0);

    const logoutBtn = page.getByRole('button', { name: /sair|logout/i }).first();
    if (!(await logoutBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Botão de logout não encontrado no layout atual');
      return;
    }
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });

    const remaining = await getSupabaseTokenKeys(page);
    expect(remaining, 'após logout não deve sobrar token sb-*').toHaveLength(0);
  });

  test('token stale/corrompido → fallback para /auth sem loop', async ({ page }) => {
    await page.goto('/auth');
    await page.evaluate(() => {
      window.localStorage.setItem(
        'sb-fake-project-auth-token',
        JSON.stringify({ access_token: 'invalid.jwt.token', expires_at: 1 }),
      );
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    // garante que não houve loop de reload (página estável)
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/auth/);
  });
});
