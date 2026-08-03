/**
 * E2E — Inbox unificado: chegada de mensagem na thread correta.
 *
 * Cobertura:
 *  1. Abre a primeira conversa do inbox unificado.
 *  2. Mocka o RPC `rpc_list_messages_lite` (e o legacy `rpc_list_messages`)
 *     do Evolution DB para devolver, depois de "armado", uma mensagem nova
 *     adicional com texto único `e2e-incoming-<runId>`.
 *  3. Re-dispara o fetch (re-clicando na conversa) e valida que a mensagem
 *     aparece DENTRO do `role="log"` da conversa selecionada.
 *  4. Alterna para uma segunda conversa (se existir) e valida que a mesma
 *     mensagem NÃO aparece lá — garantindo isolamento por thread.
 *
 * Defensivo: usa `test.skip` quando o usuário de teste não possui conversas
 * suficientes — alinhado com os outros specs (send-message-cycle, etc).
 *
 * Não escreve em produção: tudo acontece via interceptação de rede no
 * navegador do teste (page.route).
 */
import { test, expect } from "./fixtures/auth";
import type { Route, Page, Request } from "@playwright/test";

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const INCOMING_TEXT = `e2e-incoming-${RUN_ID}`;
const BASE_TEXT_A = `e2e-base-A-${RUN_ID}`;
const BASE_TEXT_B = `e2e-base-B-${RUN_ID}`;

type MsgRow = {
  id: string;
  message_id: string;
  remote_jid: string;
  content: string;
  message_type: string;
  from_me: boolean;
  direction: "inbound" | "outbound";
  created_at: string;
  message_timestamp: string;
};

function makeMsg(jid: string, text: string, offsetMs: number, fromMe = false): MsgRow {
  const ts = new Date(Date.now() - offsetMs).toISOString();
  return {
    id: `e2e-${RUN_ID}-${offsetMs}`,
    message_id: `WAID_${RUN_ID}_${offsetMs}`,
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
}

/**
 * Intercepta as chamadas de listagem de mensagens do Evolution DB.
 *
 *  - Se ainda não conhecemos o `targetJid`, capturamos da primeira chamada.
 *  - Para `targetJid`: devolve baseMessages; quando armado, devolve
 *    baseMessages + INCOMING_TEXT.
 *  - Para qualquer outro JID: lista vazia (garante isolamento de thread).
 */
async function installMessagesMock(page: Page, state: MockState) {
  const handler = async (route: Route) => {
    const req: Request = route.request();
    let body: { p_remote_jid?: string } | null = null;
    try { body = req.postDataJSON(); } catch { /* noop */ }
    const jid: string | undefined = body?.p_remote_jid;

    if (!jid) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }

    if (!state.targetJid) {
      state.targetJid = jid;
    }

    if (jid !== state.targetJid) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }

    const base = [
      makeMsg(jid, BASE_TEXT_A, 60_000, false),
      makeMsg(jid, BASE_TEXT_B, 30_000, true),
    ];
    const payload = state.armed
      ? [...base, makeMsg(jid, INCOMING_TEXT, 1_000, false)]
      : base;

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  };

  await page.route("**/rest/v1/rpc/rpc_list_messages_lite**", handler);
  await page.route("**/rest/v1/rpc/rpc_list_messages**", handler);
}

async function getConversationItems(page: Page) {
  return page.getByRole("listbox", { name: /lista de conversas/i })
    .getByRole("option");
}

async function openInboxOrSkip(page: Page) {
  await page.goto("/");
  // A app define hash routes (#connections etc); o inbox geralmente é a home
  // ou /inbox. Tentamos /inbox e fallback para /.
  const list = page.getByRole("listbox", { name: /lista de conversas/i }).first();
  if (!(await list.isVisible({ timeout: 5_000 }).catch(() => false))) {
    await page.goto("/inbox").catch(() => {});
  }
  if (!(await list.isVisible({ timeout: 8_000 }).catch(() => false))) {
    test.skip(true, "Inbox unificado não disponível para o usuário de teste");
  }
}

test.describe("Inbox — chegada de mensagem na thread correta", () => {
  test("mensagem nova injetada renderiza no log da conversa aberta", async ({
    authenticatedPage: page,
  }) => {
    const state: MockState = { targetJid: null, armed: false };
    await installMessagesMock(page, state);

    await openInboxOrSkip(page);

    const items = await getConversationItems(page);
    const count = await items.count();
    if (count < 1) {
      test.skip(true, "Sem conversas para abrir");
    }

    await items.first().click();

    const log = page.getByRole("log", { name: /mensagens da conversa/i }).first();
    await expect(log).toBeVisible({ timeout: 10_000 });

    // Mensagem base deve aparecer (mock está respondendo).
    await expect(log.getByText(BASE_TEXT_A)).toBeVisible({ timeout: 10_000 });

    // Garante que o JID foi capturado pelo mock.
    expect(state.targetJid, "RPC de mensagens não foi chamado").toBeTruthy();

    // Arma o mock para devolver a mensagem nova nas próximas chamadas e
    // força um refetch trocando para a próxima conversa (se houver) e
    // voltando, ou re-clicando na mesma.
    state.armed = true;

    if (count >= 2) {
      await items.nth(1).click();
      await page.waitForTimeout(400);
      await items.first().click();
    } else {
      // Re-clica para forçar re-render. Como fallback, recarrega a página.
      await items.first().click();
      await page.waitForTimeout(300);
      await items.first().click();
    }

    await expect(log.getByText(INCOMING_TEXT)).toBeVisible({ timeout: 15_000 });
    // Sanidade: o texto base ainda está lá (não foi substituído).
    await expect(log.getByText(BASE_TEXT_A)).toBeVisible();
  });

  test("mensagem injetada não vaza para outra conversa", async ({
    authenticatedPage: page,
  }) => {
    const state: MockState = { targetJid: null, armed: true };
    await installMessagesMock(page, state);

    await openInboxOrSkip(page);

    const items = await getConversationItems(page);
    const count = await items.count();
    if (count < 2) {
      test.skip(true, "Precisa de pelo menos 2 conversas para validar isolamento");
    }

    // Abre a primeira para fixar o targetJid.
    await items.first().click();
    const log = page.getByRole("log", { name: /mensagens da conversa/i }).first();
    await expect(log).toBeVisible({ timeout: 10_000 });
    await expect(log.getByText(INCOMING_TEXT)).toBeVisible({ timeout: 15_000 });

    // Vai para a segunda conversa — JID diferente => mock devolve [].
    await items.nth(1).click();
    await page.waitForTimeout(800);

    // A INCOMING_TEXT NÃO pode aparecer no log da segunda conversa.
    await expect(log.getByText(INCOMING_TEXT)).toHaveCount(0);

    // Volta para a primeira: a mensagem segue lá.
    await items.first().click();
    await expect(log.getByText(INCOMING_TEXT)).toBeVisible({ timeout: 10_000 });
  });
});
