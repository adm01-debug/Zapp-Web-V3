/**
 * inbox-filters-persistence.spec.ts
 *
 * Valida que os filtros da Inbox (aba principal, sub-aba e busca) persistem:
 *   1. após recarregar a página (F5);
 *   2. ao sair da Inbox e voltar (troca de rota).
 *
 * Estratégia hermética (mesma dos demais specs de Inbox):
 *   - Intercepta o data layer devolvendo 2 mensagens Evolution inbound sem
 *     `assigned_to` (herda o contrato da edge `external-db-proxy`, REMOVIDA
 *     na consolidação 2026-07-15 — hoje o app consulta o Supabase direto).
 *   - Injeta uma sessão Supabase fake em localStorage para passar o
 *     ProtectedRoute.
 *   - Gated por RUN_INBOX_E2E=1 (skip justificado — decisão Etapa 13.2,
 *     docs/estado/40 A1): habilitar no CI exige reescrever a intercepção
 *     contra o data layer atual (REST/RPC direto). Rode localmente com:
 *
 *       RUN_INBOX_E2E=1 npx playwright test inbox-filters-persistence
 */
import { test, expect, type Page, type Route } from '@playwright/test';

const RUN = process.env.RUN_INBOX_E2E === '1';

const SUPA_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const PROXY_URL = `${SUPA_URL.replace(/\/$/, '')}/functions/v1/external-db-proxy`;

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

/** Lê o snapshot persistido no localStorage. */
async function readPersisted(page: Page) {
  return page.evaluate(() => {
    try {
      return JSON.parse(window.localStorage.getItem('inbox_filters_v1') ?? '{}');
    } catch {
      return {};
    }
  });
}

test.describe('inbox — persistência de filtros e aba ativa', () => {
  test.skip(
    !RUN,
    'RUN_INBOX_E2E=1 ausente: intercepção herda edge external-db-proxy removida (2026-07-15); habilitar no CI exige reescrever mocks contra REST/RPC direto (Etapa 13.2).',
  );

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
    });
  });

  test('aba ativa e busca sobrevivem ao reload da página', async ({ page }) => {
    await page.goto('/inbox');
    await waitForInbox(page);

    // Seleciona "Não lidas" e digita uma busca.
    await page.getByRole('button', { name: /Não lidas/i }).click();
    const searchInput = page.getByPlaceholder(/Buscar|Pesquisar/i).first();
    await searchInput.fill('Cliente');

    // Snapshot persistido reflete a seleção.
    await expect
      .poll(async () => (await readPersisted(page)).mainTab, { timeout: 10_000 })
      .toBe('unread');
    await expect
      .poll(async () => (await readPersisted(page)).search, { timeout: 10_000 })
      .toBe('Cliente');

    await page.reload();
    await waitForInbox(page);

    // Após o reload a aba "Não lidas" continua ativa e a busca restaurada.
    await expect(page.getByRole('button', { name: /Não lidas/i })).toHaveAttribute(
      'data-state',
      /active|on/,
    );
    await expect(page.getByPlaceholder(/Buscar|Pesquisar/i).first()).toHaveValue('Cliente');
    expect((await readPersisted(page)).mainTab).toBe('unread');
  });

  test('sub-aba escolhida sobrevive à troca de rota', async ({ page }) => {
    await page.goto('/inbox');
    await waitForInbox(page);

    // Escolhe explicitamente "Atendendo".
    await page.getByRole('button', { name: /Atendendo/i }).click();
    await expect
      .poll(async () => (await readPersisted(page)).subTab, { timeout: 10_000 })
      .toBe('attending');

    // Sai da Inbox e volta.
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.goto('/inbox');
    await waitForInbox(page);

    expect((await readPersisted(page)).subTab).toBe('attending');
  });

  test('filtro de tipo de contato é restaurado a partir da URL', async ({ page }) => {
    await page.goto('/inbox?type=fornecedor');
    await waitForInbox(page);

    await expect
      .poll(async () => (await readPersisted(page)).contactType, { timeout: 10_000 })
      .toBe('fornecedor');

    // Ao voltar sem query string, o localStorage deve reidratar o filtro.
    await page.goto('/inbox');
    await waitForInbox(page);

    expect((await readPersisted(page)).contactType).toBe('fornecedor');
  });
});
