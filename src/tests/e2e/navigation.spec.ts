import { test, expect } from '@playwright/test';

test.describe('Navegação e Estrutura da UI', () => {
  test.beforeEach(async ({ page }) => {
    // Simular que estamos na página de login para todos os testes que não precisam de auth
    await page.goto('/auth');
  });

  test('deve ter meta tags corretas para SEO', async ({ page }) => {
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    
    // Verifica se a viewport está configurada corretamente para mobile
    const viewportMeta = await page.getAttribute('meta[name="viewport"]', 'content');
    expect(viewportMeta).toContain('width=device-width');
  });

  test('responsividade básica da tela de login', async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('text=Plataforma omnichannel')).toBeVisible();
    
    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    // No mobile, o HeroBenefits deve ser empilhado ou alterado (conforme src/pages/Auth.tsx)
    await expect(page.locator('text=ZAPP Web')).toBeVisible();
  });
});
