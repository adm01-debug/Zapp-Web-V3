/**
 * E2E — Conexão criada -> Inbox unificado -> webhook inbound mockado ->
 * bolha aparece na thread correta.
 *
 * Difere de `inbox-created-thread-inbound.spec.ts` por interagir
 * explicitamente com um card de conexão (clique no <h3> do nome) antes
 * de ir ao inbox, exercitando o gesto "abri uma conexão criada".
 *
 * Hermético: nenhum efeito real em produção. Webhooks e RPCs do FATOR X
 * são interceptados via `page.route`.
 */
import { test, expect } from "./fixtures/auth";
import type { Route, Page, Request } from "@playwright/test";

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const INBOUND_TEXT = `e2e-inbound-${RUN_ID}`;
const BASE_OUT = `e2e-base-out-${RUN_ID}`;
const BASE_IN = `e2e-base-in-${RUN_ID}`;

interface MsgRow {
  id: string;
  message_id: string;
  remote_jid: string;
  content: string;
  message_type: string;
  from_me: boolean;
  direction: "inbound" | "outbound";
  created_at: string;
  message_timestamp: string;
}

function makeMsg(jid: string, text: string, ageMs: number, fromMe: boolean): MsgRow {
  const ts = new Date(Date.now() - ageMs).toISOString();
  return {
    id: `e2e-${RUN_ID}-${ageMs}-${fromMe ? "o" : "i"}`,
    message_id: `WAID_${RUN_ID}_${ageMs}`,
    remote_jid: jid,
    content: text,
    message_type: "text",
    from_me: fromMe,
    direction: fromMe ? "outbound" : "inbound",
    created_at: ts,
    message_timestamp: ts,
  };
}

interface MockState {
  targetJid: string | null;
  armed: boolean;
  webhookHits: number;
}

async function installMocks(page: Page, state: MockState) {
  const webhookHandler = (route: Route) => {
    state.webhookHits += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, mocked: true }),
    });
  };
  await page.route("**/functions/v1/evolution-webhook**", webhookHandler);
  await page.route("**/functions/v1/whatsapp-cloud-webhook**", webhookHandler);

  const messagesHandler = async (route: Route) => {
    const req: Request = route.request();
    let body: any = null;
    try { body = req.postDataJSON(); } catch { /* noop */ }
    const jid: string | undefined = body?.p_remote_jid;

    if (!jid) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (!state.targetJid) state.targetJid = jid;
    if (jid !== state.targetJid) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }

    const base: MsgRow[] = [
      makeMsg(jid, BASE_IN, 90_000, false),
      makeMsg(jid, BASE_OUT, 60_000, true),
    ];
    const payload = state.armed
      ? [...base, makeMsg(jid, INBOUND_TEXT, 1_000, false)]
      : base;

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  };
  await page.route("**/rest/v1/rpc/rpc_list_messages_lite**", messagesHandler);
  await page.route("**/rest/v1/rpc/rpc_list_messages**", messagesHandler);
}

/** Abre a tela de Conexões e clica no card da primeira conexão criada. */
async function openFirstConnectionOrSkip(page: Page): Promise<string> {
  await page.goto("/#connections");
  // ConnectionCard renderiza o nome da conexão como <h3 class="font-semibold">.
  const firstCardName = page.locator("h3.font-semibold").first();
  if (!(await firstCardName.isVisible({ timeout: 8_000 }).catch(() => false))) {
    test.skip(true, "Nenhuma conexão criada visível para o usuário de teste");
  }
  const name = (await firstCardName.textContent())?.trim() ?? "";
  // Clique best-effort no card. Não exige navegação — apenas exercita o gesto.
  await firstCardName.click({ trial: false }).catch(() => { /* ignore */ });
  return name;
}

async function openUnifiedInboxOrSkip(page: Page) {
  await page.goto("/");
  const list = page.getByRole("listbox", { name: /lista de conversas/i }).first();
  if (!(await list.isVisible({ timeout: 8_000 }).catch(() => false))) {
    await page.goto("/inbox").catch(() => {});
  }
  if (!(await list.isVisible({ timeout: 8_000 }).catch(() => false))) {
    test.skip(true, "Inbox unificado não acessível para o usuário de teste");
  }
}

test.describe("Conexão criada -> Inbox unificado -> webhook inbound mockado", () => {
  test("bolha inbound renderiza na thread alvo da conexão aberta", async ({
    authenticatedPage: page,
  }) => {
    const state: MockState = { targetJid: null, armed: false, webhookHits: 0 };
    await installMocks(page, state);

    // 1) Abre uma conexão criada (clique no card).
    const connectionName = await openFirstConnectionOrSkip(page);
    test.info().annotations.push({
      type: "context",
      description: `Conexão alvo: "${connectionName}"`,
    });

    // 2) Inbox unificado.
    await openUnifiedInboxOrSkip(page);

    const items = page
      .getByRole("listbox", { name: /lista de conversas/i })
      .getByRole("option");
    const count = await items.count();
    if (count < 1) {
      test.skip(true, "Sem conversas para abrir no inbox unificado");
    }

    // 3) Abre a primeira thread (= conversa associada à conexão).
    await items.first().click();
    const log = page.getByRole("log", { name: /mensagens da conversa/i }).first();
    await expect(log).toBeVisible({ timeout: 10_000 });
    await expect(log.getByText(BASE_IN)).toBeVisible({ timeout: 10_000 });
    expect(state.targetJid, "RPC de mensagens não foi chamado").toBeTruthy();

    // 4) Webhook sintético inbound — interceptado pelo mock (200, hermético).
    const supabaseUrl = process.env.E2E_SUPABASE_URL || "https://supabase.atomicabr.com.br";
    const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
    await page.evaluate(async (url) => {
      try {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "messages.upsert",
            instance: "wpp2",
            data: {
              key: { remoteJid: "MOCKED@s.whatsapp.net", fromMe: false },
              message: { conversation: "mocked inbound" },
            },
          }),
        });
      } catch {
        /* mock garante 200; ignore qualquer erro de transporte */
      }
    }, webhookUrl);

    expect(state.webhookHits, "webhook sintético não atingiu o mock")
      .toBeGreaterThan(0);

    // 5) Arma o mock de DB e força refetch (toggle de conversa).
    state.armed = true;
    if (count >= 2) {
      await items.nth(1).click();
      await page.waitForTimeout(400);
      await items.first().click();
    } else {
      await items.first().click();
      await page.waitForTimeout(300);
      await items.first().click();
    }

    // 6) Bolha nova aparece na thread alvo.
    await expect(log.getByText(INBOUND_TEXT)).toBeVisible({ timeout: 15_000 });
    await expect(log.getByText(BASE_IN)).toBeVisible();

    // 7) Isolamento: não vaza para outras threads.
    if (count >= 2) {
      await items.nth(1).click();
      await page.waitForTimeout(800);
      await expect(log.getByText(INBOUND_TEXT)).toHaveCount(0);
    }
  });
});
