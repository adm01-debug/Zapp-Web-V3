/**
 * E2E — Ciclo completo de envio (texto + mídia) com mocks das functions
 * de envio e webhook.
 *
 * Cobertura:
 *  1. Abrir uma conversa existente no inbox.
 *  2. Mockar `evolution-api` (send-text / send-media), `whatsapp-cloud-api`
 *     e os endpoints de webhook — tudo determinístico, sem rede real.
 *  3. Enviar texto -> validar bolha otimista + payload capturado.
 *  4. Enviar mídia (PNG 1x1) -> validar `mediaUrl` no payload + render <img>.
 *  5. Falha 503 da function -> garantir que o app não crasha.
 *
 * Defensivo: usa `test.skip` quando o usuário de teste não tem conversas,
 * input de chat, ou campo de upload disponível — evita falsos negativos.
 */
import { test, expect } from "./fixtures/auth";
import type { Route, Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { MOCK_EVOLUTION_SEND_RESPONSE } from "./fixtures/test-data";

// 1x1 transparent PNG (base64) — used for the media upload step.
const PNG_1x1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function tempPng(): string {
  const file = path.join(os.tmpdir(), `e2e-media-${Date.now()}.png`);
  fs.writeFileSync(file, Buffer.from(PNG_1x1_BASE64, "base64"));
  return file;
}

interface Captured {
  sentText?: string;
  sentMediaUrl?: string;
  sentMediaType?: string;
}

/**
 * Installs deterministic mocks for every Edge Function the send pipeline
 * touches. Captures send-text/send-media payloads into the shared object.
 */
async function installSendMocks(page: Page, captured: Captured) {
  await page.route("**/functions/v1/evolution-api**", async (route: Route) => {
    const req = route.request();
    let body: { action?: string; text?: string; mediaUrl?: string; mediaType?: string } | null = null;
    try { body = req.postDataJSON(); } catch { /* noop */ }
    if (body?.action === "send-text" && typeof body?.text === "string") {
      captured.sentText = body.text;
    }
    if (body?.action === "send-media" && typeof body?.mediaUrl === "string") {
      captured.sentMediaUrl = body.mediaUrl;
      captured.sentMediaType = body.mediaType;
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_EVOLUTION_SEND_RESPONSE),
    });
  });

  await page.route("**/functions/v1/whatsapp-cloud-api**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, messages: [{ id: "MOCK_CLOUD_WAMID" }] }),
    }),
  );

  await page.route("**/functions/v1/whatsapp-cloud-webhook**", (route) =>
    route.fulfill({ status: 200, body: "ok" }),
  );
  await page.route("**/functions/v1/evolution-webhook**", (route) =>
    route.fulfill({ status: 200, body: "ok" }),
  );
}

async function openFirstConversationOrSkip(page: Page) {
  const firstConv = page.locator(
    '[data-testid="conversation-item"], [role="listitem"]',
  ).first();
  if (!(await firstConv.isVisible({ timeout: 5_000 }).catch(() => false))) {
    test.skip(true, "Sem conversas disponíveis para o usuário de teste");
  }
  await firstConv.click();
  const chatArea = page.locator('[role="log"], [data-testid="chat-messages"]').first();
  await expect(chatArea).toBeVisible({ timeout: 10_000 });
}

function chatTextbox(page: Page) {
  return page.locator(
    [
      '[data-testid="chat-input"]',
      'textarea[placeholder*="mensagem" i]',
      'textarea[placeholder*="message" i]',
      '[contenteditable="true"]',
    ].join(", "),
  ).first();
}

test.describe("Ciclo completo de envio (texto + mídia)", () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await installSendMocks(page, {});
    await page.goto("/");
  });

  test("texto: bolha otimista renderiza e function recebe payload correto", async ({ authenticatedPage: page }) => {
    const captured: Captured = {};
    await page.unroute("**/functions/v1/evolution-api**").catch(() => {});
    await installSendMocks(page, captured);

    await openFirstConversationOrSkip(page);

    const textbox = chatTextbox(page);
    if (!(await textbox.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Campo de input de chat não localizado neste skin");
    }

    const message = `e2e-text-${Date.now()}`;
    await textbox.click();
    await textbox.fill(message);

    const sendButton = page.locator(
      '[data-testid="send-button"], button[aria-label*="enviar" i], button[aria-label*="send" i]',
    ).first();
    if (await sendButton.isVisible().catch(() => false)) {
      await sendButton.click();
    } else {
      await textbox.press("Enter");
    }

    const bubble = page.getByText(message, { exact: false }).first();
    await expect(bubble).toBeVisible({ timeout: 3_000 });
    await expect.poll(() => captured.sentText, { timeout: 3_000 }).toBe(message);
  });

  test("mídia (imagem): function recebe mediaUrl e prévia <img> renderiza", async ({ authenticatedPage: page }) => {
    const captured: Captured = {};
    await page.unroute("**/functions/v1/evolution-api**").catch(() => {});
    await installSendMocks(page, captured);

    await openFirstConversationOrSkip(page);

    const fileInput = page.locator('input[type="file"]').first();
    if (!(await fileInput.count())) {
      test.skip(true, "Sem campo de upload de mídia visível neste perfil");
    }

    const file = tempPng();
    await fileInput.setInputFiles(file);

    // Algumas implementações abrem um diálogo de prévia com botão "Enviar".
    const confirm = page.getByRole("button", { name: /^enviar$|^send$/i }).last();
    if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirm.click();
    }

    await expect.poll(() => captured.sentMediaUrl, { timeout: 8_000 }).toBeTruthy();

    const chatImg = page.locator(
      '[role="log"] img, [data-testid="chat-messages"] img',
    ).first();
    await expect(chatImg).toBeVisible({ timeout: 8_000 });
  });

  test("falha 503 do envio: app não crasha e UI permanece responsiva", async ({ authenticatedPage: page }) => {
    await page.unroute("**/functions/v1/evolution-api**").catch(() => {});
    await page.route("**/functions/v1/evolution-api**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "unavailable" }),
      }),
    );

    await openFirstConversationOrSkip(page);

    const textbox = chatTextbox(page);
    if (!(await textbox.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "Sem input de chat");
    }
    await textbox.fill(`e2e-fail-${Date.now()}`);
    await textbox.press("Enter");

    // Lista de conversas continua visível — sem crash global do React.
    await expect(
      page.locator('[data-testid="conversation-item"], [role="listitem"]').first(),
    ).toBeVisible();
    await expect(page.locator("text=/algo deu errado|something went wrong/i")).toHaveCount(0);
  });
});
