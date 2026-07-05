import { test, expect } from '@playwright/test';

test.describe('WhatsApp Message Reactions Advanced Validation', () => {
  test('should handle 401, 500 and 504 errors with specific standardized messages', async ({ page }) => {
    await page.goto('/inbox');
    await page.locator('[data-testid^="conversation-item-"]').first().click();
    
    const message = page.locator('[data-testid^="message-bubble-"]').last();
    const _messageId = await message.getAttribute('data-message-id');

    const errorSpecs = [
      { status: 401, text: 'Sessão expirada. Por favor, faça login novamente.' },
      { status: 500, text: 'Erro interno no servidor (500)' },
      { status: 504, text: 'O servidor demorou muito para responder. Tente novamente.' }
    ];

    for (const spec of errorSpecs) {
      // Mock error
      await page.route('**/rest/v1/message_reactions*', async (route) => {
        await route.fulfill({
          status: spec.status,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Error', code: spec.status.toString() }),
        });
      });

      await message.hover();
      await page.locator('button[aria-label="Reagir com 👍"]').first().click();
      
      const toast = page.locator(`text=${spec.text}`);
      await expect(toast).toBeVisible();
      // Verify style (should have destructive classes)
      await expect(page.locator('.bg-destructive')).toBeVisible();

      // Unroute and react again to verify it replaces/clears
      await page.unroute('**/rest/v1/message_reactions*');
      await page.locator('button[aria-label="Reagir com ❤️"]').first().click();
      // The previous toast should be gone or replaced because of our ID logic
      await expect(toast).not.toBeVisible();
    }
  });

  test('should track analytics events correctly on picker open and reaction', async ({ page }) => {
    // Listen for console logs where our mock analytics prints
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('[Analytics]')) logs.push(msg.text());
    });

    await page.goto('/inbox');
    await page.locator('[data-testid^="conversation-item-"]').first().click();
    
    const message = page.locator('[data-testid^="message-bubble-"]').last();
    const messageId = await message.getAttribute('data-message-id');

    // 1. Open picker
    await message.hover();
    await page.locator(`[data-testid="reaction-trigger-${messageId}"]`).click();
    
    // 2. React
    await page.locator('button[aria-label="Reagir com 👍"]').first().click();

    // Verify exactly one open_picker event and one add event
    const pickerEvents = logs.filter(l => l.includes('open_picker'));
    const addEvents = logs.filter(l => l.includes('add'));

    expect(pickerEvents.length).toBe(1);
    expect(addEvents.length).toBe(1);
    expect(pickerEvents[0]).toContain(messageId);
  });
});

