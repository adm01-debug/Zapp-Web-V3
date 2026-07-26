/**
 * inbox-filter-presets.spec.ts
 *
 * Valida o ciclo de vida completo dos presets de filtros da Inbox:
 *   1. salvar a combinação atual de filtros como preset;
 *   2. aplicar o preset restaurando aba/sub-aba/busca;
 *   3. remover o preset;
 *   4. persistência dos presets após reload (F5) e troca de rota.
 *
 * Estratégia hermética (mesma dos demais specs de Inbox):
 *   - Intercepta o edge function `external-db-proxy` devolvendo 2 mensagens
 *     Evolution inbound sem `assigned_to`.
 *   - Injeta uma sessão Supabase fake em localStorage para passar o
 *     ProtectedRoute.
 *   - Gated por RUN_INBOX_E2E=1:
 *
 *       RUN_INBOX_E2E=1 npx playwright test inbox-filter-presets
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const RUN = process.env.RUN_INBOX_E2E === '1';

const SUPA_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const PROXY_URL = `${SUPA_URL.replace(/\/$/, '')}/functions/v1/external-db-proxy`;

const PRESETS_KEY = 'inbox_filter_presets_v1';
const PRESET_NAME = 'Não lidas · Cliente';

const nowIso = new Date().toISOString();
const olderIso = new Date(Date.now() - 60_000).toISOString();

function mockMessage(overrides: Record<string, unknown>) {
  return {
    message_id: 'msg',
    from_me: false,
    message_type: 'conversation',
    media_url: null,
    media_mimetype: null,
    media_type: null,
    media_filename: null,
    media_size: null,
    caption: null,
    quoted_message_id: null,
    is_starred: false,
    is_important: false,
    category: null,
    sentiment: null,
    tags: null,
    notes: null,
    follow_up_at: null,
    follow_up_done: false,
    contact_id: null,
    conversation_id: null,
    direction: 'inbound',
    status: 'received',
    sent_by_bot: false,
    template_name: null,
    instance_name: 'wpp_pink_test',
    deleted_at: null,
    ...overrides,
  };
}

const MOCK_MESSAGES = [
  mockMessage({
    id: '11111111-1111-1111-1111-111111111111',
    message_id: 'msg-a',
    remote_jid: '5511999990001@s.whatsapp.net',
    content: 'Olá, preciso de ajuda',
    created_at: nowIso,
    status_at: nowIso,
    push_name: 'Cliente Um',
  }),
  mockMessage({
    id: '22222222-2222-2222-2222-222222222222',
    message_id: 'msg-b',
    remote_jid: '5511999990002@s.whatsapp.net',
    content: 'Bom dia',
    created_at: olderIso,
    status_at: olderIso,
    push_name: 'Cliente Dois',
  }),
];

async function handleProxy(route: Route) {
  let body: Record<string, unknown> = {};
  try {
    body = route.request().postDataJSON() ?? {};
  } catch {
    body = {};
  }

  if (body.action === 'rpc') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], error: null }),
    });
  }

  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: MOCK_MESSAGES, error: null, count: MOCK_MESSAGES.length }),
  });
}

/** Espera a Inbox estar hidratada (abas visíveis). */
async function waitForInbox(page: Page) {
  await expect(page.getByRole('button', { name: /Aguardando/i })).toBeVisible({ timeout: 20_000 });
}

/** Lê a lista de presets persistida no localStorage. */
async function readPresets(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate((key) => {
    try {
      const raw = JSON.parse(window.localStorage.getItem(key) ?? '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }, PRESETS_KEY);
}

/** Lê o snapshot de filtros ativos. */
async function readPersistedFilters(page: Page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(window.localStorage.getItem('inbox_filters_v1') ?? '{}');
    } catch {
      return {};
    }
  });
}

/** Abre o painel de presets (idempotente). */
async function openPresetsPanel(page: Page) {
  const menu = page.getByRole('menu', { name: /Presets salvos/i });
  if (!(await menu.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Presets de filtros da caixa de entrada/i }).click();
  }
  await expect(menu).toBeVisible({ timeout: 10_000 });
}

function searchInput(page: Page) {
  return page.getByPlaceholder(/Buscar|Pesquisar/i).first();
}

test.describe('inbox — presets de filtros', () => {
  test.skip(!RUN, 'Defina RUN_INBOX_E2E=1 para rodar este teste (requer backend mockado).');

  test.beforeEach(async ({ page, context }) => {
    await context.route(PROXY_URL, handleProxy);

    await page.addInitScript(() => {
      const fakeSession = {
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: '00000000-0000-0000-0000-00000000e2e5',
          aud: 'authenticated',
          email: 'e2e@test.local',
        },
      };
      window.localStorage.setItem(
        'sb-localhost-auth-token',
        JSON.stringify({ currentSession: fakeSession, expiresAt: fakeSession.expires_at }),
      );
      window.localStorage.removeItem('inbox_filter_presets_v1');
      window.localStorage.removeItem('inbox_filters_v1');
    });
  });

  test('salva, aplica e remove um preset, com persistência entre reload e rota', async ({
    page,
  }) => {
    await page.goto('/inbox');
    await waitForInbox(page);

    // ---------- 1. Monta a combinação de filtros a ser salva ----------
    await page.getByRole('button', { name: /Não lidas/i }).click();
    await searchInput(page).fill('Cliente');

    await expect
      .poll(async () => (await readPersistedFilters(page)).mainTab, { timeout: 10_000 })
      .toBe('unread');

    // ---------- 2. Salva como preset ----------
    await openPresetsPanel(page);
    await page.getByLabel(/Nome do novo preset/i).fill(PRESET_NAME);
    await page.getByRole('button', { name: /Salvar filtros atuais como preset/i }).click();

    await expect
      .poll(async () => (await readPresets(page)).length, { timeout: 10_000 })
      .toBe(1);

    const [saved] = await readPresets(page);
    expect(saved.name).toBe(PRESET_NAME);
    expect(saved.mainTab).toBe('unread');
    expect(saved.search).toBe('Cliente');

    // O contador no botão reflete a quantidade salva.
    await expect(
      page.getByRole('button', { name: /Presets de filtros da caixa de entrada/i }),
    ).toContainText('1');

    // ---------- 3. Persistência após reload ----------
    await page.reload();
    await waitForInbox(page);

    expect(await readPresets(page)).toHaveLength(1);
    await openPresetsPanel(page);
    await expect(page.getByRole('menuitem', { name: PRESET_NAME })).toBeVisible();

    // ---------- 4. Persistência após troca de rota ----------
    await page.keyboard.press('Escape');
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.goto('/inbox');
    await waitForInbox(page);

    expect(await readPresets(page)).toHaveLength(1);

    // ---------- 5. Altera os filtros e aplica o preset ----------
    await page.getByRole('button', { name: /^Abertos/i }).first().click();
    await searchInput(page).fill('');
    await expect
      .poll(async () => (await readPersistedFilters(page)).search, { timeout: 10_000 })
      .toBe('');

    await openPresetsPanel(page);
    await page.getByRole('menuitem', { name: PRESET_NAME }).click();

    // Painel fecha ao aplicar e os filtros do preset são restaurados.
    await expect(page.getByRole('menu', { name: /Presets salvos/i })).toBeHidden();
    await expect(searchInput(page)).toHaveValue('Cliente');
    await expect
      .poll(async () => (await readPersistedFilters(page)).mainTab, { timeout: 10_000 })
      .toBe('unread');

    // ---------- 6. Remove o preset ----------
    await openPresetsPanel(page);
    await page.getByRole('button', { name: new RegExp(`Remover preset ${PRESET_NAME}`, 'i') }).click();

    await expect
      .poll(async () => (await readPresets(page)).length, { timeout: 10_000 })
      .toBe(0);
    await expect(page.getByText(/Nenhum preset salvo ainda/i)).toBeVisible();

    // Remoção também persiste após reload.
    await page.reload();
    await waitForInbox(page);
    expect(await readPresets(page)).toHaveLength(0);
  });

  test('preset com nome duplicado substitui o existente (sem duplicar a lista)', async ({
    page,
  }) => {
    await page.goto('/inbox');
    await waitForInbox(page);

    await searchInput(page).fill('primeiro');
    await openPresetsPanel(page);
    await page.getByLabel(/Nome do novo preset/i).fill('Meu preset');
    await page.getByRole('button', { name: /Salvar filtros atuais como preset/i }).click();
    await expect.poll(async () => (await readPresets(page)).length, { timeout: 10_000 }).toBe(1);

    await page.keyboard.press('Escape');
    await searchInput(page).fill('segundo');
    await expect
      .poll(async () => (await readPersistedFilters(page)).search, { timeout: 10_000 })
      .toBe('segundo');

    await openPresetsPanel(page);
    await page.getByLabel(/Nome do novo preset/i).fill('Meu preset');
    await page.getByRole('button', { name: /Salvar filtros atuais como preset/i }).click();

    await expect
      .poll(async () => (await readPresets(page)).map((p) => p.search), { timeout: 10_000 })
      .toEqual(['segundo']);
  });
});
