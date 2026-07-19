/**
 * SMOKE — /admin/integrations/evolution-api
 *
 * Objetivo: garantir que a página carrega credenciais e health logs sem
 * disparar `PGRST205` (schema/table not exposed via PostgREST). Falha o
 * build se qualquer request para o Supabase retornar esse código.
 *
 * Validação do bridge zapp.evolution_instance_credentials + evolution_retry_metrics.
 */
import { test, expect, type Request, type Response } from '@playwright/test';

test.describe('Evolution API — smoke', () => {
  test('carrega sem PGRST205 e mostra credenciais/health logs', async ({ page }) => {
    const pgrst205Hits: Array<{ url: string; body: string }> = [];

    page.on('response', async (resp: Response) => {
      const url = resp.url();
      if (!/\/rest\/v1\//.test(url)) return;
      if (resp.status() >= 400) {
        try {
          const body = await resp.text();
          if (/PGRST205/i.test(body)) pgrst205Hits.push({ url, body });
        } catch {
          /* ignore */
        }
      }
    });

    const criticalTables = [
      /evolution_instance_credentials/,
      /evolution_retry_metrics/,
      /evolution_health_logs/,
    ];
    const seen = new Set<string>();
    page.on('request', (req: Request) => {
      const u = req.url();
      for (const re of criticalTables) if (re.test(u)) seen.add(re.source);
    });

    await page.goto('/admin/integrations/evolution-api', { waitUntil: 'networkidle' });

    // 1) A página renderiza sem 500
    await expect(page.locator('body')).not.toContainText(/Something went wrong/i);

    // 2) Nenhum PGRST205 nas rotas críticas
    expect(
      pgrst205Hits,
      `PGRST205 detectado — bridge zapp.* provavelmente ausente:\n${pgrst205Hits
        .map((h) => ` - ${h.url}\n   ${h.body.slice(0, 200)}`)
        .join('\n')}`
    ).toEqual([]);

    // 3) Pelo menos uma das tabelas foi consultada (proof-of-life)
    expect(seen.size, 'Nenhuma tabela de Evolution foi requisitada').toBeGreaterThan(0);
  });
});
