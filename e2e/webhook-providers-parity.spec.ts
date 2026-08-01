/**
 * E2E: webhook → unified inbox parity for both providers.
 *
 * For Evolution and WhatsApp Cloud we POST a synthetic webhook event
 * (signed server-side by the e2e-webhook-fixture function) and assert
 * the message lands in the unified FATOR X model with the same
 * normalized remote_jid + content + direction.
 *
 * Gated by E2E_WEBHOOK_PARITY=1 so it only runs in environments that
 * have EVOLUTION_WEBHOOK_SECRET + EXTERNAL_SUPABASE_SERVICE_ROLE_KEY
 * configured for the e2e-webhook-fixture function.
 */
import { test, expect } from "./fixtures/auth";

const ENABLED = process.env.E2E_WEBHOOK_PARITY === "1";
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
if (ENABLED && (!SUPABASE_URL || !SUPABASE_KEY)) {
  throw new Error("VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY ausentes (E2E_WEBHOOK_PARITY=1)");
}

interface SendResult {
  provider: "evolution" | "cloud";
  status: number;
  response: unknown;
  remoteJid: string;
  messageId: string;
  instanceName: string;
  content: string;
}

async function callFixture(token: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/e2e-webhook-fixture`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`fixture ${body.action} failed: ${JSON.stringify(json)}`);
  return json;
}

async function pollMessage(token: string, remoteJid: string, messageId: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let last: unknown = null;
  while (Date.now() < deadline) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/external-db-proxy`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "select",
        table: "evolution_messages",
        filters: [
          { column: "remote_jid", op: "eq", value: remoteJid },
          { column: "message_id", op: "eq", value: messageId },
        ],
        limit: 1,
      }),
    });
    const data = await res.json().catch(() => null);
    last = data;
    const row = Array.isArray(data?.rows) ? data.rows[0] : Array.isArray(data) ? data[0] : null;
    if (row) return row;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`message ${messageId} not found in evolution_messages within ${timeoutMs}ms; last=${JSON.stringify(last)?.slice(0, 300)}`);
}

test.describe("Webhook → unified inbox parity", () => {
  test.skip(!ENABLED, "Set E2E_WEBHOOK_PARITY=1 to enable provider parity tests");

  const runId = `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let token = "";
  let cloudPhoneNumberId = "";

  test.beforeAll(async ({ browser }) => {
    // Get an admin JWT via the authenticated fixture page.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    token = await page.evaluate(() => {
      // Supabase v2 stores session under a key like sb-<ref>-auth-token
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
          try {
            const raw = JSON.parse(localStorage.getItem(k) ?? "null");
            return raw?.access_token ?? raw?.currentSession?.access_token ?? "";
          } catch { /* noop */ }
        }
      }
      return "";
    });
    await ctx.close();
    expect(token, "expected an authenticated admin token in localStorage").toBeTruthy();

    const seed = (await callFixture(token, { action: "seed-cloud-creds", runId })) as {
      phoneNumberId: string;
    };
    cloudPhoneNumberId = seed.phoneNumberId;
    expect(cloudPhoneNumberId).toMatch(/^e2e-phone-/);
  });

  test.afterAll(async () => {
    if (token) {
      await callFixture(token, { action: "cleanup", runId }).catch(() => {});
    }
  });

  test("evolution provider: synthetic webhook lands in evolution_messages", async () => {
    const sent = (await callFixture(token, { action: "send-evolution", runId })) as SendResult;
    expect(sent.status, `evolution-webhook returned ${sent.status}: ${JSON.stringify(sent.response)}`).toBe(200);

    const row = await pollMessage(token, sent.remoteJid, sent.messageId);
    expect(row.remote_jid).toBe(sent.remoteJid);
    expect(row.content).toBe(sent.content);
    expect(row.from_me).toBe(false);
    expect(["inbound", "incoming"]).toContain(row.direction);
  });

  test("cloud provider: synthetic webhook lands in evolution_messages", async () => {
    const sent = (await callFixture(token, {
      action: "send-cloud",
      runId,
      phoneNumberId: cloudPhoneNumberId,
    })) as SendResult;
    expect(sent.status, `whatsapp-cloud-webhook returned ${sent.status}: ${JSON.stringify(sent.response)}`).toBe(200);

    const row = await pollMessage(token, sent.remoteJid, sent.messageId);
    expect(row.remote_jid).toBe(sent.remoteJid);
    expect(row.content).toBe(sent.content);
    expect(row.from_me).toBe(false);
    expect(["inbound", "incoming"]).toContain(row.direction);
  });

  test("parity: both providers produce structurally identical rows", async () => {
    // Send a fresh pair with the same content and assert column-by-column parity.
    const evo = (await callFixture(token, {
      action: "send-evolution",
      runId,
      content: `parity-${runId}`,
      messageId: `${runId}-evo-${Date.now()}`,
    })) as SendResult;
    const cloud = (await callFixture(token, {
      action: "send-cloud",
      runId,
      phoneNumberId: cloudPhoneNumberId,
      content: `parity-${runId}`,
      messageId: `${runId}-cloud-${Date.now()}`,
    })) as SendResult;
    expect(evo.status).toBe(200);
    expect(cloud.status).toBe(200);

    const [evoRow, cloudRow] = await Promise.all([
      pollMessage(token, evo.remoteJid, evo.messageId),
      pollMessage(token, cloud.remoteJid, cloud.messageId),
    ]);

    // Same normalized JID format
    expect(evoRow.remote_jid).toMatch(/^\d+@s\.whatsapp\.net$/);
    expect(cloudRow.remote_jid).toMatch(/^\d+@s\.whatsapp\.net$/);
    // Same content, both inbound, both not from_me
    expect(evoRow.content).toBe(cloudRow.content);
    expect(evoRow.from_me).toBe(cloudRow.from_me);
    expect(evoRow.from_me).toBe(false);
    expect(["inbound", "incoming"]).toContain(evoRow.direction);
    expect(["inbound", "incoming"]).toContain(cloudRow.direction);
  });
});
