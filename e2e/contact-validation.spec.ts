/**
 * E2E Test: Validação de Contatos com Zod
 *
 * Cenários:
 * - Criar contato com telefone inválido
 * - Criar contato com email inválido
 * - Criar contato com nome vazio
 * - Criar contato válido
 * - Tentar criar com UUID inválido
 */
import { test, expect } from '@playwright/test';

test.describe('Contact Validation - Zod Schemas', () => {
  test.beforeEach(async ({ page }) => {
    // Assumindo que o usuário já está autenticado via test fixture
    await page.goto('/contacts');
  });

  test('deve aceitar contato válido', async ({ page }) => {
    // Preencher formulário com dados válidos
    await page.fill('[data-testid="contact-name"]', 'João Silva');
    await page.fill('[data-testid="contact-phone"]', '11999998888');
    await page.fill('[data-testid="contact-email"]', 'joao@example.com');

    // Submeter
    await page.click('[data-testid="submit-contact"]');

    // Verificar sucesso
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('deve rejeitar contato sem nome', async ({ page }) => {
    await page.fill('[data-testid="contact-name"]', '');
    await page.fill('[data-testid="contact-phone"]', '11999998888');
    await page.click('[data-testid="submit-contact"]');

    await expect(page.locator('[data-testid="error-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-name"]')).toContainText(
      'obrigatório'
    );
  });

  test('deve rejeitar telefone inválido', async ({ page }) => {
    await page.fill('[data-testid="contact-name"]', 'João');
    await page.fill('[data-testid="contact-phone"]', '123');
    await page.click('[data-testid="submit-contact"]');

    await expect(page.locator('[data-testid="error-phone"]')).toBeVisible();
  });

  test('deve rejeitar email inválido', async ({ page }) => {
    await page.fill('[data-testid="contact-name"]', 'João');
    await page.fill('[data-testid="contact-phone"]', '11999998888');
    await page.fill('[data-testid="contact-email"]', 'not-an-email');
    await page.click('[data-testid="submit-contact"]');

    await expect(page.locator('[data-testid="error-email"]')).toBeVisible();
  });

  test('deve aceitar telefone com formatação', async ({ page }) => {
    await page.fill('[data-testid="contact-name"]', 'João');
    await page.fill('[data-testid="contact-phone"]', '(11) 99999-8888');
    await page.click('[data-testid="submit-contact"]');

    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('deve aceitar contato sem email (opcional)', async ({ page }) => {
    await page.fill('[data-testid="contact-name"]', 'João');
    await page.fill('[data-testid="contact-phone"]', '11999998888');
    // Não preencher email
    await page.click('[data-testid="submit-contact"]');

    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({
      timeout: 5_000,
    });
  });

  test('deve rejeitar mais de 50 tags', async ({ page }) => {
    await page.fill('[data-testid="contact-name"]', 'João');
    await page.fill('[data-testid="contact-phone"]', '11999998888');

    // Adicionar 51 tags
    for (let i = 0; i < 51; i++) {
      await page.click('[data-testid="add-tag"]');
      await page.fill(`[data-testid="tag-input-${i}"]`, `tag-${i}`);
    }

    await page.click('[data-testid="submit-contact"]');

    // Deve mostrar erro
    await expect(page.locator('[data-testid="error-tags"]')).toBeVisible();
  });
});
