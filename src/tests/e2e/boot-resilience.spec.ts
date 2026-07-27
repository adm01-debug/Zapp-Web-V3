/**
 * boot-resilience — valida que o SPA não trava em loop quando o backend
 * Supabase self-hosted está offline/lento. Bloqueia toda chamada ao host
 * Supabase em uso (detectado via VITE_SUPABASE_URL ou fallback ao host de
 * produção) e verifica que:
 *   1. #root recebe conteúdo mesmo sem backend.
 *   2. A página não entra em loop infinito de reload (safety-net removido).
 *   3. A UI de erro ou a tela /auth acaba renderizando (sem spinner eterno).
 *
 * NOTA CI: Em GitHub Actions, VITE_SUPABASE_URL é example.supabase.co (dummy);
 * bloqueamos também esse host para que o SPA se comporte como offline.
 */
import { test, expect } from '@playwright/test';

// Deriva os hosts a bloquear do env (CI usa example.supabase.co; produção usa
// supabase.atomicabr.com.br). Sempre inclui o host de produção como fallback.
// Usa Set.has() com correspondência exata de hostname — sem regex construída
// dinamicamente, evitando riscos de escape incompleto ou âncora ausente.
function buildSupabaseBlockedHosts(): Set<string> {
  const hosts = new Set(['supabase.atomicabr.com.br']);
  try {
    const raw = process.env.VITE_SUPABASE_URL;
    if (raw) hosts.add(new URL(raw).hostname);
  } catch {
    // env inválido — ignora
  }
  return hosts;
}

const SUPABASE_BLOCKED_HOSTS = buildSupabaseBlockedHosts();

test.describe('boot resilience (backend offline)', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(
      (url) => SUPABASE_BLOCKED_HOSTS.has(url.hostname),
      (route) => route.abort('failed'),
    );
  });

  test('SPA monta e não reloada em loop com backend inacessível', async ({ page }) => {
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    await page.goto('/');
    await expect
      .poll(() => page.locator('#root *').count(), { timeout: 20_000 })
      .toBeGreaterThan(0);

    // Aguarda janela onde reload-loop antigo (6s) dispararia várias vezes.
    await page.waitForTimeout(15_000);

    // Fluxo normal: goto('/') + redirect /auth = 2–3 navegações.
    // Loop antigo (6s) em 15s = 3 loops → 5+ navegações → reprovado.
    expect(navigations, 'não deve haver loop de reload').toBeLessThanOrEqual(3);
  });

  test('após timeout de bootstrap a UI apresenta escape (erro ou /auth)', async ({ page }) => {
    await page.goto('/');
    await expect
      .poll(
        async () => {
          const url = page.url();
          const errorVisible = await page
            .getByRole('alert')
            .filter({ hasText: /não foi possível conectar/i })
            .count();
          const authVisible = /\/auth/.test(url);
          return errorVisible > 0 || authVisible;
        },
        { timeout: 25_000, message: 'deve mostrar erro de conexão OU redirecionar para /auth' },
      )
      .toBeTruthy();
  });
});
