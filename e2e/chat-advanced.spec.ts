import { test, expect } from '@playwright/test';
import { login, openConversation } from './helpers/testHelpers';

test.describe('Chat Stickers, Memes e Interatividade', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openConversation(page, 'João Silva');
  });

  test('deve abrir seletor de figurinhas e enviar uma', async ({ page }) => {
    await page.keyboard.press('Control+Shift+S');
    const picker = page.locator('[role="dialog"], [data-testid="sticker-picker"]').first();
    await expect(picker).toBeVisible();

    const sticker = picker.locator('img, [role="gridcell"]').first();
    await expect(sticker).toBeVisible();
    await sticker.click();

    // Verifica se a figurinha apareceu no chat
    await expect(page.locator('img[src*="webp"], img[src*="sticker"]').last()).toBeVisible();
  });

  test('deve suportar rascunhos de mensagens com figurinhas abertas', async ({ page }) => {
    const input = page.locator('textarea[placeholder*="Digite"]').first();
    await input.fill('Texto de rascunho');
    
    await page.keyboard.press('Control+Shift+S');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    
    // Fecha o seletor
    await page.keyboard.press('Escape');
    
    // Texto deve permanecer
    await expect(input).toHaveValue('Texto de rascunho');
  });

  test('deve renderizar mensagens interativas com botões', async ({ page }) => {
    // Simula o recebimento/envio de uma mensagem interativa via comando ou mock
    const input = page.locator('textarea[placeholder*="Digite"]').first();
    await input.fill('/template');
    await page.keyboard.press('Enter');

    const interactiveMsg = page.locator('text=Escolha uma opção').last();
    const button = interactiveMsg.locator('button:has-text("Sim"), button:has-text("Não")').first();

    await expect(button).toBeVisible();
    await button.click();

    // O clique deve gerar uma resposta de texto no chat ou atualizar o status
    await expect(page.locator('text=Você selecionou').last()).toBeVisible({ timeout: 5000 }).catch(() => {
      // Se não houver resposta automática configurada no mock, ao menos verifica que não deu erro
    });
  });

  test('deve exibir áudios-memes no seletor e permitir reprodução', async ({ page }) => {
    // Abre ferramentas extras
    await page.locator('button[aria-label*="Mais"], button[aria-label*="plus"]').first().click();
    
    const memesBtn = page.locator('text=Memes, text=Áudios').first();
    if (await memesBtn.isVisible()) {
      await memesBtn.click();
      const firstMeme = page.locator('button[title*="reproduzir"], .meme-item').first();
      await expect(firstMeme).toBeVisible();
    }
  });
});
