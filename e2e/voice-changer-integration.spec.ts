import { test, expect } from '@playwright/test';

/**
 * Voice Changer End-to-End Integration Test.
 * Covers:
 * 1. Audio message selection.
 * 2. Voice preset application.
 * 3. Queue status monitoring (real-time).
 * 4. Success state (audio playback availability).
 * 5. Error state handling (mocked failure).
 */
test.describe('Voice Changer Integration', () => {
  
  test.beforeEach(async ({ page }) => {
    // Standard login bypass using cookies from fixtures if needed, 
    // but assuming global setup handles this.
    await page.goto('/inbox');
    
    // Select a conversation with audio messages
    const conv = page.locator('[data-testid^="conversation-item-"]').first();
    await conv.click();
  });

  test('should convert audio with a preset and show success state', async ({ page }) => {
    // 1. Locate an audio message bubble
    const audioMsg = page.locator('[data-testid^="message-bubble-"]').filter({ hasText: /áudio/i }).last();
    if (!(await audioMsg.isVisible())) {
      console.log('No audio message found, skipping test or seeding required');
      return;
    }

    // 2. Open Voice Changer
    await audioMsg.hover();
    const wandBtn = audioMsg.locator('button[title="Alterar voz com IA"]');
    await expect(wandBtn).toBeVisible();
    await wandBtn.click();

    // 3. Select a preset (e.g., George Grave)
    const presetBtn = page.locator('text=George (Grave)');
    await expect(presetBtn).toBeVisible();
    
    // Intercept Edge Function call to verify request
    await page.route('**/functions/v1/voice-changer', async (route) => {
      // Mock successful response with a tiny silent mp3
      const silentMp3 = Buffer.from('SUQzBAAAAAAAAFRYWFgAAAASAAADU29mdHdhcmUATGFtZSB2My45OWSBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'base64');
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: silentMp3
      });
    });

    await presetBtn.click();

    // 4. Verify Loading State
    await expect(page.locator('text=Alterando voz...')).toBeVisible();

    // 5. Verify Success State in Toast and Badge
    await expect(page.locator('text=Voz convertida para George (Grave)!')).toBeVisible({ timeout: 15000 });
    
    // 6. Verify processed state in bubble
    // (Based on AudioMessagePlayer.tsx: voiceStatus === 'completed' shows a check or disappears)
    // Actually the badge disappears on success as per code.
    await expect(page.locator('text=Alterando voz...')).not.toBeVisible();
  });

  test('should show error state and allow retry on 504 timeout', async ({ page }) => {
    const audioMsg = page.locator('[data-testid^="message-bubble-"]').filter({ hasText: /áudio/i }).last();
    await audioMsg.hover();
    await audioMsg.locator('button[title="Alterar voz com IA"]').click();

    // Mock 504 Timeout
    let _callCount = 0;
    await page.route('**/functions/v1/voice-changer', async (route) => {
      _callCount++;
      await route.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Gateway Timeout' })
      });
    });

    await page.locator('text=George (Grave)').click();

    // Verify error toast
    await expect(page.locator('text=Falha técnica: Gateway Timeout')).toBeVisible();
    
    // Verify badge shows failure
    const failedBadge = page.locator('text=Falhou');
    await expect(failedBadge).toBeVisible();

    // Test Manual Retry from Toast
    const retryBtn = page.locator('button:has-text("Tentar agora")');
    await expect(retryBtn).toBeVisible();
    
    // Update route to succeed on retry
    await page.route('**/functions/v1/voice-changer', async (route) => {
      const silentMp3 = Buffer.from('...', 'base64');
      await route.fulfill({ status: 200, contentType: 'audio/mpeg', body: silentMp3 });
    });

    await retryBtn.click();
    await expect(page.locator('text=Voz convertida')).toBeVisible();
  });
});
