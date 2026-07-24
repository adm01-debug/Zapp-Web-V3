/**
 * inbox-unassigned-conversations.spec.ts
 *
 * Verifica o fluxo real da Inbox com 2 conversas Evolution `assigned_to = null`:
 *
 *   1. A lista aparece automaticamente (auto-switch para "Aguardando" quando
 *      "Atendendo" está vazio, pipeline unificado com contadores).
 *   2. Ao clicar em "Não lidas", as mesmas 2 conversas continuam visíveis
 *      (unreadCount > 0 e status != 'resolved').
 *
 * Estratégia hermética:
 *   - Intercepta o edge function `external-db-proxy` e devolve 2 mensagens
 *     Evolution sintéticas (uma por remote_jid), ambas com direction='inbound'
 *     e sem `assigned_to`.
 *   - Injeta uma sessão Supabase fake em localStorage para passar o
 *     ProtectedRoute sem depender de credenciais reais.
 *   - Gated por RUN_INBOX_E2E=1 para não quebrar o gate hermético do CI
 *     (que só valida boot). Rode localmente com:
 *
 *       RUN_INBOX_E2E=1 npx playwright test inbox-unassigned-conversations
 */
import { test, expect, type Route } from '@playwright/test';

const RUN = process.env.RUN_INBOX_E2E === '1';

const SUPA_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
const PROXY_URL = `${SUPA_URL.replace(/\/$/, '')}/functions/v1/external-db-proxy`;

const nowIso = new Date().toISOString();
const olderIso = new Date(Date.now() - 60_000).toISOString();

/** 2 mensagens inbound, 2 remote_jids distintos, sem atribuição. */
const MOCK_MESSAGES = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    message_id: 'msg-a',
    remote_jid: '5511999990001@s.whatsapp.net',
    from_me: false,
    message_type: 'conversation',
    content: 'Olá, preciso de ajuda',
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
    push_name: 'Cliente Um',
    deleted_at: null,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    message_id: 'msg-b',
    remote_jid: '5511999990002@s.whatsapp.net',
    from_me: false,
    message_type: 'conversation',
    content: 'Bom dia',
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
    created_at: olderIso,
    contact_id: null,
    conversation_id: null,
    direction: 'inbound',
    status: 'received',
    status_at: olderIso,
    sent_by_bot: false,
    template_name: null,
    instance_name: 'wpp_pink_test',
    push_name: 'Cliente Dois',
    deleted_at: null,
  },
];

async function handleProxy(route: Route) {
  const req = route.request();
  let body: Record<string, unknown> = {};
  try {
    body = req.postDataJSON() ?? {};
  } catch {
    body = {};
  }

  const isRpc = body.action === 'rpc';
  if (isRpc) {
    // Enrichment RPC — devolve vazio (evita ruído nos testes).
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], error: null }),
    });
  }

  // Query padrão em `evolution_messages` — devolve os 2 mocks.
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: MOCK_MESSAGES, error: null, count: MOCK_MESSAGES.length }),
  });
}

test.describe('inbox — conversas não atribuídas', () => {
  test.skip(!RUN, 'Defina RUN_INBOX_E2E=1 para rodar este teste (requer backend mockado).');

  test.beforeEach(async ({ page, context }) => {
    // Intercepta o edge function externo antes de qualquer request.
    await context.route(PROXY_URL, handleProxy);

    // Sessão Supabase fake persistida em localStorage para o ProtectedRoute.
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
      // Chaves usadas pelo cliente supabase-js v2 quando a URL é padrão.
      window.localStorage.setItem(
        'sb-localhost-auth-token',
        JSON.stringify({ currentSession: fakeSession, expiresAt: fakeSession.expires_at }),
      );
    });
  });

  test('lista aparece automaticamente e "Não lidas" mostra as 2 conversas', async ({ page }) => {
    await page.goto('/inbox');

    // Auto-switch: pipeline deve promover "Aguardando" quando "Atendendo" está vazio.
    const waitingTab = page.getByRole('button', { name: /Aguardando/i });
    await expect(waitingTab).toBeVisible({ timeout: 20_000 });
    await expect(waitingTab).toContainText('2', { timeout: 20_000 });

    // Ambos os push_names devem aparecer na sidebar.
    await expect(page.getByText('Cliente Um', { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Cliente Dois', { exact: false })).toBeVisible();

    // Clica em "Não lidas" — as mesmas 2 conversas devem continuar visíveis.
    await page.getByRole('button', { name: /Não lidas/i }).click();

    await expect(page.getByText('Cliente Um', { exact: false })).toBeVisible();
    await expect(page.getByText('Cliente Dois', { exact: false })).toBeVisible();

    // Sanity: o contador de "Não lidas" também deve refletir 2.
    await expect(page.getByRole('button', { name: /Não lidas/i })).toContainText('2');
  });
});
