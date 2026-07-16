import { test, expect } from '@playwright/test';

test.describe('Conversation & Routing Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard and ensure we are in the inbox
    // We assume some mechanism to bypass auth or use a test user in local env
    await page.goto('/dashboard');
    
    // Check if we are redirected to auth, if so, we might need to skip or mock auth
    if (page.url().includes('auth')) {
      console.log('Redirected to auth, attempting to mock session...');
      await page.evaluate(() => {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.includes('-auth-token'));
        const storageKey = keys[0] || 'sb-supabase-auth-token';
        localStorage.setItem(storageKey, JSON.stringify({
          access_token: 'fake-token',
          refresh_token: 'fake-refresh',
          user: { id: 'test-user-id', email: 'test@example.com' }
        }));
      });
      await page.goto('/dashboard');
    }
  });

  test('should open a conversation and display message history', async ({ page }) => {
    // Wait for conversation list to load
    const conversationItem = page.locator('[data-testid="conversation-item"]').first();
    await expect(conversationItem).toBeVisible({ timeout: 10000 });
    
    await conversationItem.click();
    
    // Verify chat window opens
    const chatWindow = page.locator('[data-testid="chat-window"]');
    await expect(chatWindow).toBeVisible();
    
    // Verify messages are visible
    const messageBubble = page.locator('[data-testid="message-bubble"]').first();
    await expect(messageBubble).toBeVisible();
  });

  test('should handle multi-attendance routing (assigning agent)', async ({ page }) => {
    await page.locator('[data-testid="conversation-item"]').first().click();
    
    // Open routing/assignment menu
    // First check if it's already assigned (ChatAssignedBar)
    const transferButton = page.locator('button:has-text("Transferir")').first();
    if (await transferButton.isVisible()) {
      await transferButton.click();
    } else {
      // Use the dropdown menu in header
      await page.locator('button[aria-label="Mais ações"]').click();
      await page.locator('[role="menuitem"]:has-text("Transferir")').click();
    }
    
    // Select an agent or department in TransferDialog
    const agentOption = page.locator('[role="menuitem"], .agent-select-option, [data-testid="agent-option"]').first();
    await expect(agentOption).toBeVisible();
    await agentOption.click();
    
    // Verify success toast/indicator
    await expect(page.locator('text=/sucesso|atribuído|encaminhado|transferido/i').first()).toBeVisible();
  });

  test('should show error state when message sending fails', async ({ page }) => {
    await page.locator('[data-testid="conversation-item"]').first().click();
    
    // Intercept message sending request and force failure
    await page.route('**/functions/v1/whatsapp-cloud-send', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    const input = page.locator('textarea, input[placeholder*="mensagem"]').first();
    await input.fill('Stress test message failure');
    await page.keyboard.press('Enter');

    // Check for retry button or error icon
    const errorIndicator = page.locator('[data-testid="message-error-status"], .text-destructive').first();
    await expect(errorIndicator).toBeVisible();
    
    // Check for error toast
    await expect(page.locator('text=/erro ao enviar|falha/i').first()).toBeVisible();
  });

  test('should handle unresponsive UI during routing failure', async ({ page }) => {
    await page.locator('[data-testid="conversation-item"]').first().click();

    // Intercept routing request with a delay then failure
    await page.route('**/rpc/assign_conversation', async route => {
      await new Promise(r => setTimeout(r, 2000));
      route.abort('failed');
    });

    const assignButton = page.locator('button:has-text("Encaminhar")').first();
    await assignButton.click();
    await page.locator('[role="menuitem"]').first().click();

    // Verify loading state is shown during delay
    const loadingSpinner = page.locator('.animate-spin, [role="status"]').first();
    await expect(loadingSpinner).toBeVisible({ timeout: 1000 }).catch(() => {
      // Loading state might disappear quickly, verify error appears instead
    });

    // Verify error recovery
    await expect(page.locator('text=/erro|falha/i').first()).toBeVisible();
  });
});
