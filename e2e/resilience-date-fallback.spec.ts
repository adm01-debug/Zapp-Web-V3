import { test, expect } from './fixtures/auth';

test.describe('Inbox Resilience - Invalid Dates', () => {
  test('should render conversation list even with corrupted/missing dates', async ({ authenticatedPage: page }) => {
    // Intercept API call to inject bad data
    await page.route('**/rpc/rpc_list_conversations', async (route) => {
      const response = await route.fetch();
      const json = await response.json();

      if (json.length > 0) {
        // Corrupt the first conversation
        json[0].updatedAt = 'invalid-date';
        json[0].lastMessage = { ...json[0].lastMessage, created_at: null };
        if (json[0].contact) json[0].contact.updated_at = undefined;
      }

      await route.fulfill({ json });
    });

    await page.goto('/inbox');

    // Check if the list rendered without showing the ErrorBoundary fallback
    const conversationList = page.locator('[data-testid="conversation-item"]');
    await expect(conversationList.first()).toBeVisible();

    // Verify that the error message is NOT present
    await expect(page.getByText('Erro ao carregar. Recarregue.')).not.toBeVisible();

    // Verify that the timestamp is still rendered (will use fallback 'now')
    const timestamp = conversationList.first().locator('span.tabular-nums');
    await expect(timestamp).toBeVisible();
  });
});
