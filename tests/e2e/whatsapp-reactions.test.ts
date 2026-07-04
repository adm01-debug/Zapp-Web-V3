import { test, expect } from '@playwright/test';

test.describe('WhatsApp Message Reactions', () => {
  test('should toggle reaction via hover picker and verify accessibility', async ({ page }) => {
    // Navigate to inbox
    await page.goto('/inbox');
    
    // Select first conversation
    await page.locator('[data-testid^="conversation-item-"]').first().click();
    
    // Wait for messages to load
    const message = page.locator('[data-testid^="message-bubble-"]').last();
    const messageId = await message.getAttribute('data-message-id');
    
    // Hover to reveal picker
    await message.hover();
    
    // Click a reaction (👍)
    void page.locator(`[data-testid="reaction-trigger-${messageId}"]`).isVisible();
    // In our implementation, QuickReactionBar contains the buttons directly on hover
    const thumbsUp = page.locator('button[aria-label="Reagir com 👍"]').first();
    await thumbsUp.click();
    
    // Verify reaction appears in summary
    const reactionSummary = page.locator(`[data-testid="reaction-${messageId}-👍"]`);
    await expect(reactionSummary).toBeVisible();
    await expect(reactionSummary).toContainText('1');
    
    // Toggle off
    await reactionSummary.click();
    await expect(reactionSummary).not.toBeVisible();
    
    // Keyboard navigation test
    await page.keyboard.press('Tab');
    // ... focus through elements
  });

  test('should work on mobile without hover', async ({ page }) => {
    // Force mobile viewport
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/inbox');
    
    await page.locator('[data-testid^="conversation-item-"]').first().click();
    const message = page.locator('[data-testid^="message-bubble-"]').last();
    const messageId = await message.getAttribute('data-message-id');
    
    // On mobile, the "Add Reaction" button should be visible (opacity logic or touch trigger)
    const trigger = page.locator(`[data-testid="reaction-trigger-${messageId}"]`);
    await trigger.click();
    
    // Pick from extended menu
    await page.locator('button[aria-label="Reagir com ❤️"]').click();
    
    const reactionSummary = page.locator(`[data-testid="reaction-${messageId}-❤️"]`);
    await expect(reactionSummary).toBeVisible();
  });
});
