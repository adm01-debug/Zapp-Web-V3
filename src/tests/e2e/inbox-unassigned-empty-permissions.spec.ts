/**
 * inbox-unassigned-empty-permissions.spec.ts
 *
 * Cenário de regressão: 2 conversas WhatsApp Evolution com `assigned_to = null`
 * e o payload de permissões VAZIO/desidratado (`permissions` e `role_permissions`
 * retornam []). Nessa condição o gate `enforceChannelPermissions` deve ficar
 * desligado — as conversas NÃO podem sumir da lista.
 *
 * Asserções:
 *   - aba "Abertos"    → contador 2
 *   - sub-aba "Aguardando" → contador 2 e selecionada automaticamente
 *   - aba "Não lidas"  → contador 2
 *   - os 2 contatos aparecem na sidebar
 *
 * Gated por RUN_INBOX_E2E=1 (skip justificado — decisão Etapa 13.2,
 * docs/estado/40 A1): a intercepção herda o contrato da edge
 * `external-db-proxy`, REMOVIDA na consolidação 2026-07-15 (o app consulta
 * o Supabase direto); habilitar no CI exige reescrever os mocks contra
 * REST/RPC direto. Rode localmente com:
 *   RUN_INBOX_E2E=1 npx playwright test inbox-unassigned-empty-permissions
 */
import { test, expect, type Route } from '@playwright/test';

const RUN = process.env.RUN_INBOX_E2E === '1';

const SUPA_URL = (process.env.VITE_SUPABASE_URL || 'http://localhost:54321').replace(/\/$/, '');
const PROXY_URL = `${SUPA_URL}/functions/v1/external-db-proxy`;

const nowIso = new Date().toISOString();
const olderIso = new Date(Date.now() - 60_000).toISOString();

function evolutionMessage(overrides: Record<string, unknown>) {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    message_id: 'msg',
    remote_jid: '5511900000000@s.whatsapp.net',
    from_me: false,
    message_type: 'conversation',
    content: 'mensagem',
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
    created_at: nowIso,
    contact_id: null,
    conversation_id: null,
    direction: 'inbound',
    status: 'received',
    status_at: nowIso,
    sent_by_bot: false,
    template_name: null,
    instance_name: 'wpp_pink_test',
    push_name: 'Contato',
    deleted_at: null,
    // sem atribuição — o ponto central do cenário
    assigned_to: null,
    ...overrides,
  };
}

const MOCK_MESSAGES = [
  evolutionMessage({
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    message_id: 'msg-perm-a',
    remote_jid: '5511988880001@s.whatsapp.net',
    content: 'Preciso de atendimento',
    push_name: 'Cliente Alfa',
  }),
  evolutionMessage({
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    message_id: 'msg-perm-b',
    remote_jid: '5511988880002@s.whatsapp.net',
    content: 'Alguém pode ajudar?',
    push_name: 'Cliente Beta',
    created_at: olderIso,
    status_at: olderIso,
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

/** Força permissões vazias/desidratadas. */
async function handleEmptyPermissions(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  });
}

test.describe('inbox — não atribuídas com permissões vazias', () => {
  test.skip(
    !RUN,
    'RUN_INBOX_E2E=1 ausente: intercepção herda edge external-db-proxy removida (2026-07-15); habilitar no CI exige reescrever mocks contra REST/RPC direto (Etapa 13.2).',
  );

  test.beforeEach(async ({ page, context }) => {
    await context.route(PROXY_URL, handleProxy);
    // Permissões desidratadas: nenhuma permission / role_permission retornada.
    await context.route(/\/rest\/v1\/(permissions|role_permissions)\b.*/, handleEmptyPermissions);

    await page.addInitScript(() => {
      const fakeSession = {
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: '00000000-0000-0000-0000-00000000e2e6',
          aud: 'authenticated',
          email: 'e2e-perms@test.local',
        },
      };
      window.localStorage.setItem(
        'sb-localhost-auth-token',
        JSON.stringify({ currentSession: fakeSession, expiresAt: fakeSession.expires_at }),
      );
    });
  });

  test('mostra 2 conversas em Aguardando com open=2, waiting=2 e unread=2', async ({ page }) => {
    await page.goto('/inbox');

    const openTab = page.getByRole('button', { name: /Abertos/i });
    const waitingTab = page.getByRole('button', { name: /Aguardando/i });
    const unreadTab = page.getByRole('button', { name: /Não lidas/i });

    // open = 2 (nenhuma conversa foi descartada pelo gate de canal)
    await expect(openTab).toBeVisible({ timeout: 20_000 });
    await expect(openTab).toContainText('2', { timeout: 20_000 });

    // waiting = 2 e auto-switch para "Aguardando" (nada atribuído ao usuário)
    await expect(waitingTab).toBeVisible();
    await expect(waitingTab).toContainText('2');

    // unread = 2
    await expect(unreadTab).toContainText('2');

    // Ambas as conversas visíveis na sidebar
    await expect(page.getByText('Cliente Alfa', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Cliente Beta', { exact: false })).toBeVisible();

    // Alternar para "Não lidas" mantém as mesmas 2 conversas
    await unreadTab.click();
    await expect(page.getByText('Cliente Alfa', { exact: false })).toBeVisible();
    await expect(page.getByText('Cliente Beta', { exact: false })).toBeVisible();
  });
});
