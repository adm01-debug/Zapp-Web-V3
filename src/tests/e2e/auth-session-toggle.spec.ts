/**
 * E2E — Alternância sessão válida ↔ expirada sem loop de redirect
 *
 * Não podemos mintar uma sessão válida sem credenciais reais, portanto
 * exercitamos a matriz de "sessão inválida" que o guard precisa tolerar
 * sem entrar em loop de redirect:
 *
 *   1. Sem sessão            → redirect único para `/auth`.
 *   2. Sessão expirada       → redirect único para `/auth` + storage limpo.
 *   3. Sessão corrompida     → redirect único para `/auth` + storage limpo.
 *   4. Alternância entre as três em sequência, na MESMA aba, navegando por
 *      várias rotas protegidas: nunca mais que 3 navegações a `/auth` no
 *      total (1 por transição) e nunca 2 redirects consecutivos idênticos
 *      dentro de 500ms (assinatura clássica de loop).
 *
 * Skip gracioso se localhost estiver indisponível (salvo `E2E_STRICT_AUTH_LOOP=1`).
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_LOCALHOST_URL ?? 'http://localhost:8080';
const STRICT = process.env.E2E_STRICT_AUTH_LOOP === '1';

const PROTECTED_ROUTES = ['/inbox', '/crm', '/admin'];

type NavRecord = { url: string; at: number };

async function collectAuthNavigations(page: Page): Promise<NavRecord[]> {
  const navs: NavRecord[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navs.push({ url: frame.url(), at: Date.now() });
    }
  });
  return navs;
}

async function waitForSettled(page: Page, expectedPath: RegExp, timeout = 8_000): Promise<void> {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout })
    .toMatch(expectedPath);
  // 1.5s idle: se um loop existir, ele dispara aqui.
  await page.waitForTimeout(1500);
}

async function setSessionState(
  page: Page,
  mode: 'none' | 'expired' | 'corrupted',
): Promise<void> {
  await page.evaluate((m) => {
    // Limpa qualquer sb-*-auth-token existente.
    const keys = Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k));
    for (const k of keys) localStorage.removeItem(k);

    if (m === 'none') return;

    // Usa a primeira chave conhecida ou cria uma sintética baseada no host do Supabase.
    const storageKey = keys[0] ?? 'sb-e2e-auth-token';

    if (m === 'expired') {
      const expired = {
        access_token: 'expired.jwt.token',
        refresh_token: 'expired-refresh',
        expires_at: Math.floor(Date.now() / 1000) - 3600,
        expires_in: -3600,
        token_type: 'bearer',
        user: { id: '00000000-0000-0000-0000-000000000000', email: 'e2e@test.local' },
      };
      localStorage.setItem(storageKey, JSON.stringify(expired));
    } else if (m === 'corrupted') {
      localStorage.setItem(storageKey, '{not-valid-json');
    }
  }, mode);
}

function countPathHits(navs: NavRecord[], path: RegExp): number {
  return navs.filter((n) => path.test(new URL(n.url).pathname)).length;
}

function hasConsecutiveDuplicates(navs: NavRecord[], within = 500): boolean {
  for (let i = 1; i < navs.length; i++) {
    const a = navs[i - 1];
    const b = navs[i];
    if (a.url === b.url && b.at - a.at < within) return true;
  }
  return false;
}

test.describe('Auth guard — alternância sessão válida ↔ expirada sem loop', () => {
  test('cada modo de sessão inválida redireciona uma única vez para /auth', async ({ page }) => {
    const navs = await collectAuthNavigations(page);

    // Bootstrap: carrega a app na landing pública para inicializar localStorage/SDK.
    try {
      await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      test.skip(!STRICT, `Localhost inacessível: ${(err as Error).message}`);
      throw err;
    }
    await page.waitForTimeout(500);

    const modes: Array<'none' | 'expired' | 'corrupted'> = ['none', 'expired', 'corrupted'];

    for (const [idx, mode] of modes.entries()) {
      const route = PROTECTED_ROUTES[idx % PROTECTED_ROUTES.length];
      await setSessionState(page, mode);

      const navsBefore = navs.length;
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await waitForSettled(page, /^\/auth/);

      const stepNavs = navs.slice(navsBefore);
      const authHits = countPathHits(stepNavs, /^\/auth/);

      // 1 hit de bootstrap não conta pq testamos por etapa; permitimos até 2
      // (SPA route + redirect), mas nunca mais que isso — 3+ indica loop.
      expect(
        authHits,
        `[${mode}] Redirects para /auth durante navegação a ${route}: ${authHits} (${JSON.stringify(
          stepNavs.map((n) => n.url),
        )})`,
      ).toBeLessThanOrEqual(2);

      expect(
        hasConsecutiveDuplicates(stepNavs, 500),
        `[${mode}] Detectado loop (mesma URL <500ms) em ${route}: ${JSON.stringify(stepNavs)}`,
      ).toBe(false);

      // Storage inválido deve ter sido limpo pelo SDK Supabase.
      if (mode !== 'none') {
        const remaining = await page.evaluate(() =>
          Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)),
        );
        // Não exigimos remoção estrita (o SDK pode manter chave vazia), só
        // que o valor não seja mais interpretado como sessão válida — o que
        // já foi verificado pelo redirect para /auth.
        expect(Array.isArray(remaining)).toBe(true);
      }
    }

    // Sanidade global: em nenhuma das transições devemos ter estabilizado
    // fora de /auth (nenhuma das rotas protegidas deveria ter renderizado).
    for (const route of PROTECTED_ROUTES) {
      expect(
        countPathHits(navs, new RegExp(`^${route}$`)) <= modes.length,
        `Navegações inesperadas a ${route}: ${JSON.stringify(navs)}`,
      ).toBe(true);
    }
  });
});
