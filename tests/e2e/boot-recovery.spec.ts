import { test, expect } from '@playwright/test';
import { testConfig } from './test-config';

test.describe('Boot Recovery E2E', () => {
  test('should trigger auto-recovery when React fails to mount', async ({ page }) => {
    // 1. Block the main script to simulate "React not mounting"
    await page.route('**/src/main.tsx', route => route.abort().catch(() => {}));

    // 2. Speed up the boot timers by overriding setTimeout in the browser
    // The boot script uses specific delays (8000ms and 4000ms).
    await page.addInitScript(() => {
      const originalSetTimeout = window.setTimeout;
      // @ts-expect-error — overriding window.setTimeout for test speed
      window.setTimeout = function(handler: TimerHandler, delay?: number, ...args: unknown[]) {
        if (delay === 8000) return originalSetTimeout(handler, 100, ...args);
        if (delay === 4000) return originalSetTimeout(handler, 100, ...args);
        if (delay === 1500) return originalSetTimeout(handler, 100, ...args); // Reload delay
        return originalSetTimeout(handler, delay, ...args);
      };
    });

    // 3. Navigate to the app
    await page.goto(testConfig.baseUrl);

    // 4. Verify the loading overlay is present initially
    await expect(page.locator('#root-loading')).toBeVisible();

    // 5. Wait for recovery message to appear
    const subtitle = page.locator('#root-loading-subtitle');
    await expect(subtitle).toContainText('Recuperando sistema', { timeout: 10000 });

    // 6. Check if sessionStorage flag was set
    const recoveryAttempt = await page.evaluate(() => sessionStorage.getItem('zapp_recovery_attempt'));
    expect(recoveryAttempt).toBe('true');
  });

  test('should show manual retry link on second failure', async ({ page }) => {
    // 1. Block main script
    await page.route('**/src/main.tsx', route => route.abort().catch(() => {}));

    // 2. Pre-set the recovery flag to simulate "already tried once"
    await page.addInitScript(() => {
      sessionStorage.setItem('zapp_recovery_attempt', 'true');
      const originalSetTimeout = window.setTimeout;
      // @ts-expect-error — overriding window.setTimeout for test speed
      window.setTimeout = function(handler: TimerHandler, delay?: number, ...args: unknown[]) {
        if (delay === 8000) return originalSetTimeout(handler, 100, ...args);
        if (delay === 4000) return originalSetTimeout(handler, 100, ...args);
        return originalSetTimeout(handler, delay, ...args);
      };
    });

    await page.goto(testConfig.baseUrl);

    // 3. Verify it shows the "Falha crítica" message with retry link
    const subtitle = page.locator('#root-loading-subtitle');
    await expect(subtitle).toContainText('Falha crítica no carregamento', { timeout: 10000 });
    await expect(page.locator('a:has-text("Tentar novamente")')).toBeVisible();
  });

  test('should remove overlay and clear flag when app mounts successfully', async ({ page }) => {
    // 1. Ensure app loads normally
    await page.goto(testConfig.baseUrl);

    // 2. Simulate app mounting and calling the hider
    // (In a real app, App.tsx calls this, but we can call it manually to verify behavior)
    await page.evaluate(() => {
      if (window.__zappHideRootLoader) window.__zappHideRootLoader();
    });

    // 3. Verify overlay is gone
    await expect(page.locator('#root-loading')).not.toBeVisible();

    // 4. Verify flag is cleared
    const recoveryAttempt = await page.evaluate(() => sessionStorage.getItem('zapp_recovery_attempt'));
    expect(recoveryAttempt).toBeNull();
  });
});
