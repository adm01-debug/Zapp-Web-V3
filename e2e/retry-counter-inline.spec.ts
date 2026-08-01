/**
 * E2E — Contador de retry inline atualiza em tempo real na bolha.
 *
 * Garante o contrato visual da `MessageStatusInline`:
 *   - durante falhas transitórias o badge "X/Y" aparece colado na bolha;
 *   - o contador AVANÇA conforme o wrapper tenta de novo (1/3 → 2/3 → 3/3);
 *   - depois que esgota, o status final substitui o badge progressivo.
 *
 * Mocka apenas o endpoint de envio (503 em todas) — auth e realtime rodam
 * contra o backend real.
 */
import { test, expect, type Route } from '@playwright/test';
import { test as authTest } from './fixtures/auth';
import { TEST_PHONE } from './fixtures/test-data';
import { cleanupTestData } from './utils/supabase';

const SEND_GLOB = '**/functions/v1/evolution-api/**';

function isSendUrl(url: string): boolean {
  return /\/message\//i.test(url);
}

/** Locator do badge de retry — match no aria-label "Tentativa X de Y". */
function retryBadge(page: import('@playwright/test').Page) {
  return page.locator('[aria-label^="Tentativa "][aria-label*=" de "]').first();
}

/** Lê (attempt, total) a partir do aria-label. Retorna null se ausente. */
async function readAttempt(
  page: import('@playwright/test').Page,
): Promise<{ attempt: number; total: number } | null> {
  const badge = retryBadge(page);
  if (!(await badge.isVisible().catch(() => false))) return null;
  const label = (await badge.getAttribute('aria-label')) ?? '';
  const m = label.match(/Tentativa\s+(\d+)\s+de\s+(\d+)/i);
  if (!m) return null;
  return { attempt: Number(m[1]), total: Number(m[2]) };
}

test.describe('Contador inline de retry (X/Y) em tempo real', () => {
  test.afterAll(async () => {
    await cleanupTestData();
  });

  authTest(
    'avança 1/N → 2/N durante falhas transitórias e some ao terminar',
    async ({ authenticatedPage: page }) => {
      let sendAttempts = 0;

      // Toda chamada de envio devolve 503 → wrapper esgota retries.
      await page.route(SEND_GLOB, async (route: Route) => {
        const url = route.request().url();
        if (!isSendUrl(url)) return route.continue();
        sendAttempts += 1;
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'unavailable', message: 'evolution down' }),
        });
      });

      await page.goto('/');

      const newConv = page.getByRole('button', { name: /nova conversa|new conversation/i }).first();
      if (!(await newConv.isVisible().catch(() => false))) {
        test.skip(true, 'Botão Nova Conversa indisponível neste perfil');
      }
      await newConv.click();
      await page.getByRole('button', { name: /novo contato/i }).click();
      await page.getByLabel(/telefone/i).fill(TEST_PHONE);

      const text = `retry-counter-${Date.now()}`;
      await page.getByPlaceholder(/digite a primeira mensagem/i).fill(text);
      await page.getByRole('button', { name: /enviar/i }).last().click();

      // Bolha otimista
      await expect(page.getByText(text).first()).toBeVisible({ timeout: 2_000 });

      // 1) Badge progressivo deve aparecer durante a janela de retry.
      await expect
        .poll(() => readAttempt(page).then((v) => (v ? v.attempt : 0)), {
          timeout: 10_000,
          message: 'badge X/Y nunca apareceu durante os retries',
        })
        .toBeGreaterThanOrEqual(1);

      const first = await readAttempt(page);
      expect(first, 'snapshot inicial do badge ausente').not.toBeNull();
      if (!first) throw new Error('snapshot inicial do badge ausente');
      const totalRetries = first.total;
      expect(totalRetries, 'totalRetries deve ser >= 2').toBeGreaterThanOrEqual(2);

      // 2) O contador deve AVANÇAR em tempo real (X cresce sem reload).
      //    Espera ver um attempt estritamente maior que o capturado acima.
      await expect
        .poll(
          async () => {
            const v = await readAttempt(page);
            return v?.attempt ?? 0;
          },
          {
            timeout: 15_000,
            message: `contador não avançou além de ${first.attempt}/${totalRetries}`,
          },
        )
        .toBeGreaterThan(first.attempt);

      // Sanity: o total nunca muda durante a corrida.
      const mid = await readAttempt(page);
      if (mid) expect(mid.total).toBe(totalRetries);

      // 3) Depois de esgotar, o badge progressivo "X/Y" some — substituído
      //    pelo terminal (×N ou ícone de falha).
      await expect
        .poll(() => retryBadge(page).isVisible().catch(() => false), {
          timeout: 20_000,
          message: 'badge X/Y permaneceu visível após esgotar retries',
        })
        .toBe(false);

      // E o estado final de falha aparece.
      await expect(
        page
          .locator(
            '[data-status="failed"], [data-status="failed_retries"], [aria-label*="Falhou após" i], [aria-label*="falha" i]',
          )
          .first(),
      ).toBeVisible({ timeout: 5_000 });

      expect(sendAttempts, 'wrapper deveria ter feito >= 2 tentativas').toBeGreaterThanOrEqual(2);
    },
  );
});
