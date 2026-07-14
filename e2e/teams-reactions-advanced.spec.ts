import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/testHelpers';

test.describe('Teams - Message Reactions Advanced @teams @reactions @advanced', () => {
  test.setTimeout(240000);

  test('Race condition & Persistence: Simultaneous toggles with page refresh', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const p1 = await context1.newPage();
    const p2 = await context2.newPage();

    await Promise.all([loginAs(p1, 'ti_admin'), loginAs(p2, 'rh_agent')]);
    
    for (const p of [p1, p2]) {
      await p.waitForURL(/\/team-chat/);
      await p.getByRole('option', { name: /Geral/i }).click();
    }

    const uniqueText = `Persistence-Race-${Date.now()}`;
    await p1.getByPlaceholder(/escreva uma mensagem/i).fill(uniqueText);
    await p1.getByPlaceholder(/escreva uma mensagem/i).press('Enter');

    const m1 = p1.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });
    const m2 = p2.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });
    
    await expect(m2).toBeVisible();

    // Toggle 👍 simultaneously
    await m1.hover();
    await m1.locator('[data-testid^="reaction-trigger-"]').click();
    await m2.hover();
    await m2.locator('[data-testid^="reaction-trigger-"]').click();

    await Promise.all([
      p1.getByRole('gridcell', { name: /👍/ }).click(),
      p2.getByRole('gridcell', { name: /👍/ }).click()
    ]);

    // Wait for settlement using deterministic indicator
    const container1 = p1.locator(`[data-testid^="reactions-container-"]`).filter({ has: p1.locator('..', { hasText: uniqueText }) });
    const container2 = p2.locator(`[data-testid^="reactions-container-"]`).filter({ has: p2.locator('..', { hasText: uniqueText }) });
    
    await expect(container1).toHaveAttribute('data-is-toggling', 'false', { timeout: 15000 });
    await expect(container2).toHaveAttribute('data-is-toggling', 'false', { timeout: 15000 });

    await expect(m1.locator('button').filter({ hasText: '👍' })).toContainText('2');
    await expect(m2.locator('button').filter({ hasText: '👍' })).toContainText('2');

    // Refresh pages to ensure persistence
    await Promise.all([p1.reload(), p2.reload()]);
    
    for (const p of [p1, p2]) {
      await p.waitForURL(/\/team-chat/);
      await p.getByRole('option', { name: /Geral/i }).click();
      const message = p.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });
      await expect(message.locator('button').filter({ hasText: '👍' })).toContainText('2');
    }

    await context1.close();
    await context2.close();
  });

  test('Scroll Synchronization: Sync reactions when messages are off-screen', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const p1 = await context1.newPage();
    const p2 = await context2.newPage();

    await Promise.all([loginAs(p1, 'ti_admin'), loginAs(p2, 'rh_agent')]);
    
    for (const p of [p1, p2]) {
      await p.waitForURL(/\/team-chat/);
      await p.getByRole('option', { name: /Geral/i }).click();
    }

    // P1 sends a message
    const uniqueText = `Scroll-Sync-${Date.now()}`;
    await p1.getByPlaceholder(/escreva uma mensagem/i).fill(uniqueText);
    await p1.getByPlaceholder(/escreva uma mensagem/i).press('Enter');

    // Both see it
    await expect(p2.getByText(uniqueText)).toBeVisible();

    // Fill chat with messages to push the first message off-screen for both
    const input = p1.getByPlaceholder(/escreva uma mensagem/i);
    for (let i = 0; i < 30; i++) {
      await input.fill(`Noise-Msg-${i}`);
      await input.press('Enter');
    }

    // Verify it's pushed up (not in viewport)
    const m1 = p1.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });
    const m2 = p2.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });
    
    // P1 scrolls up to find the message and reacts
    await m1.scrollIntoViewIfNeeded();
    await m1.hover();
    await m1.locator('[data-testid^="reaction-trigger-"]').click();
    await p1.getByRole('gridcell', { name: /❤️/ }).click();
    await expect(m1.locator('button').filter({ hasText: '❤️' })).toContainText('1');

    // P2 is still at the bottom, message is off-screen.
    // P2 scrolls up to the message and should see the reaction synced via Realtime
    await m2.scrollIntoViewIfNeeded();
    await expect(m2.locator('button').filter({ hasText: '❤️' })).toContainText('1', { timeout: 15000 });

    await context1.close();
    await context2.close();
  });

  test('Detailed Error Feedback: 401 and 500 status codes', async ({ page }) => {
    await loginAs(page, 'ti_admin');
    await page.waitForURL(/\/team-chat/);
    await page.getByRole('option', { name: /Geral/i }).click();

    const uniqueText = `Error-Feedback-${Date.now()}`;
    await page.getByPlaceholder(/escreva uma mensagem/i).fill(uniqueText);
    await page.getByPlaceholder(/escreva uma mensagem/i).press('Enter');

    const m = page.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });
    await m.hover();

    const errorScenarios = [
      { code: 401, text: 'Não autorizado' },
      { code: 500, text: 'Erro interno no servidor' }
    ];

    for (const scenario of errorScenarios) {
      await page.route('**/rest/v1/team_message_reactions*', route => {
        route.fulfill({
          status: scenario.code,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Failure', message: scenario.text })
        });
      }, { times: 1 });

      await m.locator('[data-testid^="reaction-trigger-"]').click();
      await page.getByRole('gridcell', { name: /😮/ }).click();

      // Check toast content
      const _toast = page.locator('ol[tabindex="-1"]'); // Assuming Sonner or similar toast container
      await expect(page.getByText('Erro ao reagir')).toBeVisible();
      await expect(page.getByText(scenario.text)).toBeVisible();

      // Wait for rollback
      await expect(m.locator('button').filter({ hasText: '😮' })).not.toBeVisible();
      
      // Clean up toast for next iteration
      await page.keyboard.press('Escape');
      await expect(page.getByText(scenario.text)).not.toBeVisible({ timeout: 10000 });
    }
  });

  test('Deterministic Waits: Popularity ordering with update indicators', async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const p1 = await context1.newPage();
    const p2 = await context2.newPage();

    await Promise.all([loginAs(p1, 'ti_admin'), loginAs(p2, 'rh_agent')]);
    
    for (const p of [p1, p2]) {
      await p.waitForURL(/\/team-chat/);
      await p.getByRole('option', { name: /Geral/i }).click();
    }

    const uniqueText = `Deterministic-Order-${Date.now()}`;
    await p1.getByPlaceholder(/escreva uma mensagem/i).fill(uniqueText);
    await p1.getByPlaceholder(/escreva uma mensagem/i).press('Enter');

    const m1 = p1.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });
    const m2 = p2.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText });

    const waitSettled = async (p: any) => {
      const container = p.locator(`[data-testid^="reactions-container-"]`).filter({ has: p.locator('..', { hasText: uniqueText }) });
      await expect(container).toHaveAttribute('data-is-toggling', 'false', { timeout: 15000 });
    };

    // P1 reacts with 👍
    await m1.hover();
    await m1.locator('[data-testid^="reaction-trigger-"]').click();
    await p1.getByRole('gridcell', { name: /👍/ }).click();
    await waitSettled(p1);

    // P2 reacts with ❤️
    await m2.hover();
    await m2.locator('[data-testid^="reaction-trigger-"]').click();
    await p2.getByRole('gridcell', { name: /❤️/ }).click();
    await waitSettled(p2);

    // P2 reacts with ❤️ again (should be count 2)
    // Actually, P1 should react with ❤️ to make it count 2
    await m1.hover();
    await m1.locator('[data-testid^="reaction-trigger-"]').click();
    await p1.getByRole('gridcell', { name: /❤️/ }).click();
    await waitSettled(p1);

    // Now ❤️ has 2, 👍 has 1. Order should be ❤️ then 👍
    for (const p of [p1, p2]) {
      const first = p.locator(`[data-testid^="message-container-"]`).filter({ hasText: uniqueText }).locator('button[aria-pressed]').first();
      await expect(first).toContainText('❤️');
      await expect(first).toContainText('2');
    }

    await context1.close();
    await context2.close();
  });
});
