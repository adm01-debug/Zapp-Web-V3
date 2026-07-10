import { test, expect } from '@playwright/test';

// Estes testes assumem um ambiente local onde o Supabase está disponível ou mockado.
// Como não temos credenciais de teste reais no momento, focamos na estrutura e navegação.

test.describe('Fluxo de Autenticação e Navegação', () => {
  test('deve redirecionar para login quando não autenticado', async ({ page }) => {
    await page.goto('/');
    // Verifica se fomos redirecionados para a página de auth
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.locator('h1')).toContainText('ZAPP Web');
  });

  test('deve exibir erros de validação no formulário de login', async ({ page }) => {
    await page.goto('/auth');
    
    // Tenta submeter vazio
    await page.click('button[type="submit"]');
    
    // useAuthForm valida com Zod antes de chamar Supabase.
    // Mensagem real: "Email inválido" (z.string().email em useAuthForm.ts:18)
    // Nota: text= do Playwright não suporta OR com vírgula — usar .or() ou seletor único
    await expect(
      page.locator('text=Email inválido').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('navegação entre páginas públicas', async ({ page }) => {
    await page.goto('/auth');
    
    // Ir para "Esqueci minha senha"
    await page.click('text=Esqueci minha senha');
    await expect(page).toHaveURL(/\/forgot-password/);
    
    // Rotas desconhecidas renderizam NotFound.tsx que exibe "Página não encontrada"
    // text= do Playwright não suporta OR com vírgula — usar seletor único
    await page.goto('/rota-inexistente');
    await expect(page.locator('text=Página não encontrada').first()).toBeVisible({ timeout: 8000 });
  });

  test('proteção de rotas administrativas', async ({ page }) => {
    // Tentar acessar admin sem login
    await page.goto('/admin/roles');
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe('Verificação de Payload e Estado (Visual Regression Light)', () => {
  test('deve renderizar a logo e elementos principais na tela de login', async ({ page }) => {
    await page.goto('/auth');
    
    // Verifica elementos críticos do payload da UI
    await expect(page.locator('svg.text-primary-foreground')).toBeVisible(); // Smartphone icon
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Entrar com Google")')).toBeVisible();
  });
});
