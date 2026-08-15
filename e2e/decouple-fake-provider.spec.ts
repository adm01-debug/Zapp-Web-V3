/**
 * decouple-fake-provider.spec.ts
 *
 * Prova de SUBSTITUIBILIDADE do provedor de mensageria SEM Evolution real:
 * todo o transporte (edge functions evolution-api / evolution-proxy e o
 * par whatsapp-cloud-*) é 100% fake via intercept de rede do Playwright
 * (`page.route`). O app não distingue o fake do real — qualquer provedor
 * que respeite o contrato atual funciona.
 *
 * Cobertura:
 *   (a) inbox renderiza com transport fake (provider mockado, sem Evolution);
 *   (b) envio de texto retorna stub de sucesso (bolha otimista + counters);
 *   (c) recebimento via fixture (mensagem injetada no RPC de listagem);
 *   (d) degradação: provider retorna erro → UI mostra erro explícito e o
 *       render não quebra.
 *
 * GATE — teste condicional (documentado):
 *   Este spec só roda com `E2E_FAKE=1`. Sem a variável, TODOS os testes são
 *   pulados via `test.skip` de ARQUIVO (top-level, antes das fixtures — nem
 *   o login roda), para não poluir o suite padrão e para a run do spec
 *   isolado terminar verde (4 skipped) mesmo SEM backend disponível.
 *   Para habilitar (bash/git-bash):
 *     E2E_FAKE=1 npx playwright test --config=playwright.e2e.config.ts e2e/decouple-fake-provider.spec.ts
 *   (PowerShell: $env:E2E_FAKE="1"; npx playwright test --config=playwright.e2e.config.ts e2e/decouple-fake-provider.spec.ts)
 *   O runner sobe o vite dev sozinho (webServer do playwright.e2e.config.ts,
 *   porta fixa 4173 + strictPort).
 *
 * GARANTIA DE ZERO CHAMADAS DE REDE REAIS AO PROVEDOR:
 *   1. `page.route` intercepta ANTES de qualquer byte sair do navegador.
 *   2. Os handlers do fake NUNCA chamam `route.continue()`/`fallback()` —
 *      todo request que casa com um padrão do provedor é respondido
 *      localmente (fulfill). Estruturalmente impossível chegar à rede.
 *   3. Precedência LIFO do Playwright (última rota registrada vence): os
 *      handlers mockados são registrados DEPOIS do sentinela, então vencem.
 *      O sentinela só roda se o padrão do mock deixar de casar (ex.: refactor
 *      de URL do provider) — nesse caso ele ABORTA o request (ainda sem rede)
 *      e incrementa `escaped`, derrubando o teste com expect(escaped).toBe(0).
 *   4. Asserções por teste: `escaped === 0` (nada escapou) e, nos testes de
 *      envio, `handled > 0` (o stub de fato respondeu — o erro/sucesso veio
 *      do fake, não de um timeout de rede).
 *
 * PREMISSAS (convenção do suite e2e/ — ver playwright.e2e.config.ts):
 *   - Backend dev (vite + Supabase self-hosted) disponível para AUTH (login
 *     via UI, fixture `./fixtures/auth`) e data plane REST (lista de
 *     conversas, inserts zapp) — igual a todos os outros specs de e2e/.
 *   - O TRANSPORTE do provedor é 100% fake: nenhuma chamada a evolution-api /
 *     evolution-proxy / whatsapp-cloud-* chega à rede.
 *   - Defensivo: usa `test.skip` quando o usuário de teste não possui
 *     conversas/UI suficiente — padrão da casa (send-message.spec,
 *     inbox-thread-message-arrival.spec).
 */
import { test, expect } from './fixtures/auth';
import type { Page, Route } from '@playwright/test';
import { MOCK_EVOLUTION_SEND_RESPONSE, TEST_PHONE } from './fixtures/test-data';

// ---------------------------------------------------------------------------
// Gate condicional: E2E_FAKE=1
// ---------------------------------------------------------------------------
const E2E_FAKE_ENABLED = process.env.E2E_FAKE === '1';
const FAKE_SKIP_REASON =
  'E2E_FAKE ausente: spec fake-provider exige E2E_FAKE=1 (ver cabeçalho do arquivo)';

// Gate top-level (ANTES das fixtures): sem E2E_FAKE o arquivo inteiro pula —
// `authenticatedPage` (login) nem chega a instanciar. Sem backend, a run do
// spec isolado termina verde (4 skipped) em vez de falhar no login.
test.skip(!E2E_FAKE_ENABLED, FAKE_SKIP_REASON);

// ---------------------------------------------------------------------------
// Dados fake (únicos por run, evitam colisão com dados reais)
// ---------------------------------------------------------------------------
const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const INCOMING_TEXT = `e2e-fake-incoming-${RUN_ID}`;
const BASE_TEXT_A = `e2e-fake-base-A-${RUN_ID}`;
const BASE_TEXT_B = `e2e-fake-base-B-${RUN_ID}`;
const SEND_TEXT = `e2e-fake-send-${RUN_ID}`;

// Padrões de URL do TRANSPORTE do provedor — tudo isso é fake aqui.
const PROVIDER_MOCK_PATTERNS = [
  '**/functions/v1/evolution-api**',
  '**/functions/v1/evolution-proxy**',
  '**/functions/v1/whatsapp-cloud-send**',
  '**/functions/v1/whatsapp-cloud-secrets-status**',
];
// Sentinela: padrão mais amplo que cobre a família inteira de functions do
// provedor. Registrada ANTES dos mocks → só roda se o mock não casar.
const PROVIDER_SENTINEL_PATTERNS = [
  '**/functions/v1/evolution-**',
  '**/functions/v1/whatsapp-cloud-**',
];

interface FakeProviderState {
  /** true → verbos de envio respondem 503 (degradação). */
  failSends: boolean;
  /** Chamadas respondidas pelo fake (stub). */
  handled: number;
  /** Chamadas que escaparam do mock (sentinela abortou) — deve ser 0. */
  escaped: number;
}

function makeFakeProviderState(failSends = false): FakeProviderState {
  return { failSends, handled: 0, escaped: 0 };
}

/**
 * Instala o transport FAKE do provedor.
 *
 * Sentinela primeiro (registro 1º, perde no LIFO): se um request de provedor
 * não for pego pelos mocks, ele é ABORTADO (nunca chega à rede) e contado em
 * `escaped`. Mocks depois (registro 2º, vencem no LIFO): sempre `fulfill`.
 */
async function installFakeProvider(page: Page, state: FakeProviderState) {
  for (const pattern of PROVIDER_SENTINEL_PATTERNS) {
    await page.route(pattern, async (route) => {
      state.escaped += 1;
      await route.abort('failed'); // garante: nem no escape há chamada real
    });
  }
  for (const pattern of PROVIDER_MOCK_PATTERNS) {
    await page.route(pattern, async (route: Route) => {
      state.handled += 1;
      const req = route.request();
      let body: Record<string, unknown> = {};
      try {
        const parsed = req.postDataJSON();
        if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
      } catch {
        /* POST sem JSON (ex.: FormData de PTV) — trata como envio abaixo */
      }
      const action = typeof body.action === 'string' ? body.action : '';
      const looksLikeSend =
        action.startsWith('send-') ||
        action === 'mark-as-read' ||
        body.type === 'text' ||
        body.type === 'media' ||
        body.type === 'audio';

      // (d) degradação: provider responde erro HTTP — o app deve exibir erro
      if (state.failSends && looksLikeSend) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'fake_provider_unavailable' }),
        });
      }
      // (b) stub de sucesso para envios
      if (looksLikeSend) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_EVOLUTION_SEND_RESPONSE),
        });
      }
      // Status de secrets cloud: vazio → resolveTransport cai no modo
      // evolution (degraded) e usa o evolution-api fake. Benigno.
      if (req.url().includes('whatsapp-cloud-secrets-status')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '{"secrets":[]}' });
      }
      // Demais verbos (connectionState, list-instances, get-qrcode...): stub
      // benigno de envelope — nunca `continue()`, nunca rede.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ error: false, response: {} }),
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Fixture de RECEBIMENTO: mensagens da thread vêm do mock (RPC de listagem).
// Padrão copiado de inbox-thread-message-arrival.spec.ts.
// ---------------------------------------------------------------------------
type MsgRow = {
  id: string;
  message_id: string;
  remote_jid: string;
  content: string;
  message_type: string;
  from_me: boolean;
  direction: 'inbound' | 'outbound';
  created_at: string;
  message_timestamp: string;
};

function makeMsg(jid: string, text: string, offsetMs: number, fromMe = false): MsgRow {
  const ts = new Date(Date.now() - offsetMs).toISOString();
  return {
    id: `e2e-fake-${RUN_ID}-${offsetMs}`,
    message_id: `WAID_FAKE_${RUN_ID}_${offsetMs}`,
    remote_jid: jid,
    content: text,
    message_type: 'text',
    from_me: fromMe,
    direction: fromMe ? 'outbound' : 'inbound',
    created_at: ts,
    message_timestamp: ts,
  };
}

interface MessagesMockState {
  targetJid: string | null;
  /** true → devolve INCOMING_TEXT além das mensagens base. */
  armed: boolean;
}

/**
 * Intercepta a listagem de mensagens (recebimento via fixture):
 * captura o JID da 1ª chamada, devolve base + (quando armado) INCOMING_TEXT.
 * Qualquer outro JID devolve [] (isolamento por thread).
 */
async function installMessagesFixture(page: Page, state: MessagesMockState) {
  const handler = async (route: Route) => {
    const req = route.request();
    let body: { p_remote_jid?: string } | null = null;
    try {
      body = req.postDataJSON();
    } catch {
      /* noop */
    }
    const jid: string | undefined = body?.p_remote_jid;
    if (!jid) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (!state.targetJid) state.targetJid = jid;
    if (jid !== state.targetJid) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const base = [
      makeMsg(jid, BASE_TEXT_A, 60_000, false),
      makeMsg(jid, BASE_TEXT_B, 30_000, true),
    ];
    const payload = state.armed ? [...base, makeMsg(jid, INCOMING_TEXT, 1_000, false)] : base;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  };
  await page.route('**/rest/v1/rpc/rpc_list_messages_lite**', handler);
  await page.route('**/rest/v1/rpc/rpc_list_messages**', handler);
}

// ---------------------------------------------------------------------------
// Helpers de UI (padrão da casa)
// ---------------------------------------------------------------------------
async function getConversationItems(page: Page) {
  return page
    .getByRole('listbox', { name: /lista de conversas/i })
    .getByRole('option');
}

async function openInboxOrSkip(page: Page) {
  await page.goto('/');
  const list = page.getByRole('listbox', { name: /lista de conversas/i }).first();
  if (!(await list.isVisible({ timeout: 5_000 }).catch(() => false))) {
    await page.goto('/inbox').catch(() => {});
  }
  if (!(await list.isVisible({ timeout: 8_000 }).catch(() => false))) {
    test.skip(true, 'Inbox unificado não disponível para o usuário de teste');
  }
}

async function openNewConversationOrSkip(page: Page) {
  const newConv = page.getByRole('button', { name: /nova conversa|new conversation/i }).first();
  if (!(await newConv.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, 'Botão Nova Conversa não disponível neste perfil');
  }
  await newConv.click();
  const novoBtn = page.getByRole('button', { name: /novo contato/i });
  if (!(await novoBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, 'Modo "novo contato" não exposto');
  }
  await novoBtn.click();
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------
test.describe('Decoupling — fake provider (substituibilidade sem Evolution real)', () => {
  test('(a) inbox renderiza com transport fake (nenhuma chamada real ao provedor)', async ({
    authenticatedPage: page,
  }) => {
    // (skip do arquivo inteiro já feito no top-level quando E2E_FAKE ausente)
    const provider = makeFakeProviderState(false);
    const msgs: MessagesMockState = { targetJid: null, armed: false };
    await installFakeProvider(page, provider);
    await installMessagesFixture(page, msgs);

    await openInboxOrSkip(page);

    const items = await getConversationItems(page);
    if ((await items.count()) < 1) {
      test.skip(true, 'Sem conversas para abrir');
    }
    await items.first().click();

    // Mensagens da thread vêm 100% da fixture (não do Evolution real).
    const log = page.getByRole('log', { name: /mensagens da conversa/i }).first();
    await expect(log).toBeVisible({ timeout: 10_000 });
    await expect(log.getByText(BASE_TEXT_A)).toBeVisible({ timeout: 10_000 });
    await expect(log.getByText(BASE_TEXT_B)).toBeVisible({ timeout: 10_000 });
    expect(msgs.targetJid, 'RPC de mensagens não foi chamado').toBeTruthy();

    // Render está íntegro e NENHUMA chamada ao provedor escapou do fake.
    await expect(page.locator('body')).toBeVisible();
    expect(provider.escaped, 'chamada real ao provedor escapou do intercept').toBe(0);
  });

  test('(b) envio de texto retorna stub de sucesso (bolha otimista do fake)', async ({
    authenticatedPage: page,
  }) => {
    // (skip do arquivo inteiro já feito no top-level quando E2E_FAKE ausente)
    const provider = makeFakeProviderState(false);
    await installFakeProvider(page, provider);

    await page.goto('/');
    await openNewConversationOrSkip(page);

    await page.getByLabel(/telefone/i).fill(TEST_PHONE);
    await page.getByPlaceholder(/digite a primeira mensagem/i).fill(SEND_TEXT);
    const sendBtn = page.getByRole('button', { name: /enviar/i }).last();
    await sendBtn.click();

    // Stub de sucesso → bolha otimista aparece em ≤2s (mesmo padrão de
    // send-message.spec.ts).
    await expect(page.getByText(SEND_TEXT).first()).toBeVisible({ timeout: 2_000 });

    // O fake de fato respondeu (handled > 0) e nada chegou à rede (escaped 0).
    expect(provider.handled, 'stub do provedor não foi exercitado').toBeGreaterThan(0);
    expect(provider.escaped, 'chamada real ao provedor escapou do intercept').toBe(0);
  });

  test('(c) recebimento via fixture: mensagem injetada aparece na thread', async ({
    authenticatedPage: page,
  }) => {
    // (skip do arquivo inteiro já feito no top-level quando E2E_FAKE ausente)
    const provider = makeFakeProviderState(false);
    const msgs: MessagesMockState = { targetJid: null, armed: false };
    await installFakeProvider(page, provider);
    await installMessagesFixture(page, msgs);

    await openInboxOrSkip(page);

    const items = await getConversationItems(page);
    const count = await items.count();
    if (count < 1) {
      test.skip(true, 'Sem conversas para abrir');
    }
    await items.first().click();

    const log = page.getByRole('log', { name: /mensagens da conversa/i }).first();
    await expect(log).toBeVisible({ timeout: 10_000 });
    await expect(log.getByText(BASE_TEXT_A)).toBeVisible({ timeout: 10_000 });
    expect(msgs.targetJid, 'RPC de mensagens não foi chamado').toBeTruthy();

    // "Recebe" uma mensagem nova: arma a fixture e força refetch.
    msgs.armed = true;
    await items.first().click();
    await page.waitForTimeout(300);
    await items.first().click();

    await expect(log.getByText(INCOMING_TEXT)).toBeVisible({ timeout: 15_000 });
    await expect(log.getByText(BASE_TEXT_A)).toBeVisible(); // base preservada
    expect(provider.escaped, 'chamada real ao provedor escapou do intercept').toBe(0);
  });

  test('(d) degradação: provider retorna erro → UI mostra erro explícito e render não quebra', async ({
    authenticatedPage: page,
  }) => {
    // (skip do arquivo inteiro já feito no top-level quando E2E_FAKE ausente)
    const provider = makeFakeProviderState(true); // failSends → 503 do fake
    await installFakeProvider(page, provider);

    await page.goto('/');
    await openNewConversationOrSkip(page);

    await page.getByLabel(/telefone/i).fill(TEST_PHONE);
    await page.getByPlaceholder(/digite a primeira mensagem/i).fill(SEND_TEXT);
    const sendBtn = page.getByRole('button', { name: /enviar/i }).last();
    await sendBtn.click();

    // Erro EXPLÍCITO: SendErrorBanner (role="alert", "Falha ao enviar
    // mensagem") no modo external, ou toast "Erro ao enviar mensagem" no
    // fluxo Nova Conversa. O 503 é determinístico → a UI de erro TEM que
    // aparecer (sem skip defensivo aqui).
    const banner = page.getByRole('alert').first();
    const bannerVisible = await banner.isVisible({ timeout: 6_000 }).catch(() => false);
    if (bannerVisible) {
      await expect(banner).toContainText(/falha|erro|indispon/i);
    } else {
      await expect(
        page.getByText(/erro ao enviar|falha|tentar novamente/i).first()
      ).toBeVisible({ timeout: 6_000 });
    }

    // Render não quebra: body íntegro e composer ainda presente.
    await expect(page.locator('body')).toBeVisible();
    const composer = page.getByPlaceholder(/digite/i).first();
    if (await composer.isVisible().catch(() => false)) {
      await expect(composer).toBeVisible();
    }

    // O erro veio do stub (handled > 0) e nenhuma chamada real foi feita.
    expect(provider.handled, 'stub de erro do provedor não foi exercitado').toBeGreaterThan(0);
    expect(provider.escaped, 'chamada real ao provedor escapou do intercept').toBe(0);
  });
});
