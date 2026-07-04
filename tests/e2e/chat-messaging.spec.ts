import { test, expect } from '@playwright/test';

test.describe('Inbox E2E - Chat Module Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for the initial load
    await page.goto('/');
    
    // Check if we're on the auth page (redirected)
    if (page.url().includes('/auth')) {
      // In a real environment, we'd need to log in. 
      // For Lovable's internal environment, the session is often pre-authenticated or mocked.
      // If we're stuck here, the test will fail as expected.
    }
    
    // Navigate to inbox
    await page.goto('/inbox');
    
    // Wait for the conversation list to load
    await expect(page.locator('[role="listbox"][aria-label="Lista de conversas"]')).toBeVisible({ timeout: 15000 });
  });

  test('should load conversations and select one', async ({ page }) => {
    const conversationItems = page.locator('[data-testid^="conversation-item-"]');
    
    // At least one conversation should be present (either real or mock)
    await expect(conversationItems.first()).toBeVisible({ timeout: 10000 });
    
    const count = await conversationItems.count();
    // count logged for debugging: `Found ${count} conversations`
    void count;
    
    // Select the first conversation
    await conversationItems.first().click();
    
    // Verify ChatPanel header is visible with contact name
    await expect(page.locator('header').filter({ hasText: /.+/ })).toBeVisible();
    
    // Check for message area
    await expect(page.locator('[role="log"]')).toBeVisible();
  });

  test('should send a text message and see it in the list', async ({ page }) => {
    // Select a conversation first
    await page.locator('[data-testid^="conversation-item-"]').first().click();
    
    const messageContent = `Test E2E ${Date.now()}`;
    
    // Type message
    const textarea = page.locator('textarea[placeholder*="Escreva sua mensagem"]');
    await expect(textarea).toBeVisible();
    await textarea.fill(messageContent);
    
    // Send message (Enter)
    await textarea.press('Enter');
    
    // Verify the message bubble appears (Optimistic UI)
    await expect(page.locator(`text=${messageContent}`)).toBeVisible();
    
    // Verify the "Enviado!" or sending status indicator in the queue bar
    // based on useMessageQueue implementation
    await expect(page.locator('text=Enviado!|Enviando...|Aguardando na fila')).toBeVisible();
  });

  test('should toggle between tabs (Abertas, Resolvidos, Não lidas)', async ({ page }) => {
    // Check main tabs existence
    const tabs = ['Abertas', 'Resolvidos', 'Não lidas'];
    for (const tabName of tabs) {
      const tab = page.locator(`button:has-text("${tabName}")`);
      await expect(tab).toBeVisible();
    }
    
    // Switch to Resolvidos
    await page.click('button:has-text("Resolvidos")');
    // URL or state check would happen here
    
    // Switch back to Abertas
    await page.click('button:has-text("Abertas")');
    
    // Sub-tabs should appear
    await expect(page.locator('button:has-text("Atendendo")')).toBeVisible();
    await expect(page.locator('button:has-text("Aguardando")')).toBeVisible();
  });

  test('should filter by contact name', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.fill('NonExistentContactXYZ');
    
    // Should show "Nenhuma conversa" empty state
    await expect(page.locator('text=Nenhuma conversa')).toBeVisible();
    
    // Clear search
    await searchInput.fill('');
    await expect(page.locator('[data-testid^="conversation-item-"]').first()).toBeVisible();
  });
});
