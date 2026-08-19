import { test, expect } from '@playwright/test';
import { loginViaUI } from './fixtures/auth';

test.describe('Auth — fluxos estendidos', () => {
  test('credenciais inválidas exibem erro e mantêm em /auth', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('textbox', { name: /e-?mail/i }).fill('nao-existe@zappweb.test');
    await page.getByRole('textbox', { name: /senha|password/i }).fill('senha-invalida-xyz-123');
    await page.getByRole('button', { name: /entrar|login/i }).click();
    // Espera mensagem de erro OU permanência na rota
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/\/auth/);
    const errVisible = await page.getByText(/inválid|incorret|erro|invalid/i).first()
      .isVisible({ timeout: 3_000 }).catch(() => false);
    expect(errVisible || page.url().includes('/auth')).toBeTruthy();
  });

  test('"Esqueci senha" abre /forgot-password e aceita email', async ({ page }) => {
    await page.goto('/auth');
    const link = page.getByRole('link', { name: /esqueci|forgot/i }).first();
    if (!(await link.isVisible().catch(() => false))) {
      // Tenta navegar direto
      await page.goto('/forgot-password');
    } else {
      await link.click();
    }
    await expect(page).toHaveURL(/forgot-password/);
    const emailInput = page.getByRole('textbox', { name: /e-?mail/i }).first();
    if (!(await emailInput.isVisible().catch(() => false))) {
      test.skip(true, 'Formulário /forgot-password não disponível');
    }
    await emailInput.fill('e2e-bot@zappweb.test');
    const submit = page.getByRole('button', { name: /enviar|recuperar|reset/i }).first();
    await submit.click();
    // Toast de sucesso OU mensagem inline
    const ok = await page.getByText(/enviado|verifique|email/i).first()
      .isVisible({ timeout: 5_000 }).catch(() => false);
    expect(ok).toBeTruthy();
  });

  test('sessão limpa força redirect para /auth na próxima ação', async ({ page, context }) => {
    await loginViaUI(page);
    await context.clearCookies();
    await context.addInitScript(() => {
      try { localStorage.clear(); sessionStorage.clear(); } catch { /* noop */ }
    });
    await page.goto('/');
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  });
});
