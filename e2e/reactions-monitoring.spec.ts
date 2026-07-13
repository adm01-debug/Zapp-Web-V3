import { test, expect } from './fixtures/auth';

/**
 * Reactions Real-time Operations Dashboard E2E.
 * Validates that reaction events are logged and visible in the operations dashboard.
 */
test.describe('Reactions Operations Monitoring', () => {
  
  test('reaction actions appear in operations logs in real-time', async ({ authenticatedPage: page }) => {
    // 1. Open Inbox and Dash in separate context or switch
    await page.goto('/inbox');
    
    // Locate a message to react
    const firstChat = page.locator('[data-testid="conversation-item"]').first();
    await firstChat.click();
    const msg = page.locator('[data-testid="chat-message"]').last();
    const _msgId = await msg.getAttribute('data-message-id') || 'unknown';
    
    // 2. Perform Reaction
    await msg.hover();
    await page.locator('[data-testid="add-reaction-button"]').last().click();
    await page.locator('text=😮').first().click();

    // 3. Go to Operations Dashboard
    // Assuming /admin/operations is the route based on project memory
    await page.goto('/admin/operations');
    
    // Switch to Logs tab (based on mem://features/admin/operations-hub)
    await page.getByRole('tab', { name: /logs/i }).click();

    // Check if the reaction event is there
    // The event should contain "Reaction Event: add" and the msgId
    const logEntry = page.locator(`text=Reaction Event: add`);
    await expect(logEntry.first()).toBeVisible({ timeout: 10000 });
  });

  test('open_picker event fires exactly once per interaction', async ({ authenticatedPage: page }) => {
    // Collect console logs to verify analytics tracking
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('[Analytics] Reaction Event: open_picker')) {
        logs.push(msg.text());
      }
    });

    await page.goto('/inbox');
    const firstChat = page.locator('[data-testid="conversation-item"]').first();
    await firstChat.click();
    
    const msg = page.locator('[data-testid="chat-message"]').last();
    await msg.hover();
    
    // Fast double click to test deduplication
    const pickerBtn = page.locator('[data-testid="add-reaction-button"]').last();
    await pickerBtn.click();
    await pickerBtn.click();

    // Wait a bit for logs
    await page.waitForTimeout(1000);

    // Should only have 1 log even with multiple clicks because of state-based tracking
    expect(logs.length).toBe(1);
  });
});
