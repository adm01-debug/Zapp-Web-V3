/**
 * evolution-notification-dispatcher — testes unitários do núcleo de config:
 * parsePriorityFilter, isExcludedByPriorityFilter, fallbacks de destinatário
 * (whatsapp/email/webhook) e getChannelConfig com RPC fake. Sem rede/DB: roda
 * em CI com qualquer env.
 *
 * Rodar: deno test evolution-notification-dispatcher/__tests__/config.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  firstEmailFromConfig,
  getChannelConfig,
  isExcludedByPriorityFilter,
  parsePriorityFilter,
  resolveEmailRecipient,
  resolveWebhookUrl,
  resolveWhatsAppNumber,
  type NotifChannelConfig,
} from "../index.ts";

// ─── parsePriorityFilter ────────────────────────────────────────────────────

Deno.test("parsePriorityFilter: CSV string → lista limpa", () => {
  assertEquals(parsePriorityFilter("high, urgent ,low"), ["high", "urgent", "low"]);
});

Deno.test("parsePriorityFilter: array jsonb → lista limpa", () => {
  assertEquals(parsePriorityFilter(["high", " urgent "]), ["high", "urgent"]);
});

Deno.test("parsePriorityFilter: vazio/null/não-string → [] (filtro inativo)", () => {
  assertEquals(parsePriorityFilter(""), []);
  assertEquals(parsePriorityFilter("   "), []);
  assertEquals(parsePriorityFilter(null), []);
  assertEquals(parsePriorityFilter(undefined), []);
  assertEquals(parsePriorityFilter(42), []);
  assertEquals(parsePriorityFilter([]), []);
});

Deno.test("parsePriorityFilter: itens não-string viram string (jsonb numérico)", () => {
  assertEquals(parsePriorityFilter([1, 2]), ["1", "2"]);
});

// ─── isExcludedByPriorityFilter ─────────────────────────────────────────────

Deno.test("isExcludedByPriorityFilter: sem config ou filtro vazio → false (envia)", () => {
  assertEquals(isExcludedByPriorityFilter(null, { priority: "high" }), false);
  assertEquals(isExcludedByPriorityFilter({}, { priority: "high" }), false);
  assertEquals(
    isExcludedByPriorityFilter({ priority_filter: "" }, { priority: "high" }),
    false,
  );
  assertEquals(
    isExcludedByPriorityFilter({ priority_filter: null }, { priority: "high" }),
    false,
  );
});

Deno.test("isExcludedByPriorityFilter: priority na lista → false (envia)", () => {
  const config: NotifChannelConfig = { priority_filter: "high,urgent" };
  assertEquals(isExcludedByPriorityFilter(config, { priority: "high" }), false);
  assertEquals(
    isExcludedByPriorityFilter({ priority_filter: ["urgent"] }, { priority: "urgent" }),
    false,
  );
});

Deno.test("isExcludedByPriorityFilter: priority fora da lista → true (skip)", () => {
  const config: NotifChannelConfig = { priority_filter: "high,urgent" };
  assertEquals(isExcludedByPriorityFilter(config, { priority: "low" }), true);
  assertEquals(isExcludedByPriorityFilter(config, { priority: "HIGH" }), true); // case-sensitive
});

Deno.test("isExcludedByPriorityFilter: filtro ativo e payload sem priority → true (skip)", () => {
  const config: NotifChannelConfig = { priority_filter: "high" };
  assertEquals(isExcludedByPriorityFilter(config, {}), true);
  assertEquals(isExcludedByPriorityFilter(config, { message: "x" }), true);
});

Deno.test("isExcludedByPriorityFilter: metadata.priority também é considerado", () => {
  const config: NotifChannelConfig = { priority_filter: "high" };
  assertEquals(
    isExcludedByPriorityFilter(config, { metadata: { priority: "high" } }),
    false,
  );
  assertEquals(
    isExcludedByPriorityFilter(config, { metadata: { priority: "low" } }),
    true,
  );
});

// ─── resolveWhatsAppNumber ──────────────────────────────────────────────────

Deno.test("resolveWhatsAppNumber: payload/metadata vence; contact; config.chat_id como fallback", () => {
  const contact = { phone: "5511999990000" };
  const config: NotifChannelConfig = { chat_id: "5511888887777" };
  assertEquals(resolveWhatsAppNumber({ phone: "5511000001111" }, contact, config), "5511000001111");
  assertEquals(resolveWhatsAppNumber({ metadata: { number: "5511000002222" } }, contact, config), "5511000002222");
  assertEquals(resolveWhatsAppNumber({}, contact, config), "5511999990000");
  assertEquals(resolveWhatsAppNumber({}, { phone: null }, config), "5511888887777");
});

Deno.test("resolveWhatsAppNumber: chat_id numérico (jsonb) vira string", () => {
  assertEquals(
    resolveWhatsAppNumber({}, { phone: null }, { chat_id: 5511888887777 }),
    "5511888887777",
  );
});

Deno.test("resolveWhatsAppNumber: nada disponível → null", () => {
  assertEquals(resolveWhatsAppNumber({}, { phone: null }, null), null);
  assertEquals(resolveWhatsAppNumber({}, { phone: null }, { chat_id: "" }), null);
});

// ─── firstEmailFromConfig / resolveEmailRecipient ───────────────────────────

Deno.test("firstEmailFromConfig: primeiro email válido do array; vazio → undefined", () => {
  assertEquals(firstEmailFromConfig({ email_addresses: ["a@x.com", "b@x.com"] }), "a@x.com");
  assertEquals(firstEmailFromConfig({ email_addresses: ["", " b@x.com "] }), "b@x.com");
  assertEquals(firstEmailFromConfig({ email_addresses: [] }), undefined);
  assertEquals(firstEmailFromConfig({ email_addresses: "a@x.com" }), undefined); // não-array
  assertEquals(firstEmailFromConfig(null), undefined);
});

Deno.test("resolveEmailRecipient: payload/metadata vence; contact; config.email_addresses[0]", () => {
  const contact = { email: "contact@x.com" };
  const config: NotifChannelConfig = { email_addresses: ["cfg@x.com"] };
  assertEquals(resolveEmailRecipient({ to: "to@x.com" }, contact, config), "to@x.com");
  assertEquals(resolveEmailRecipient({ metadata: { email: "meta@x.com" } }, contact, config), "meta@x.com");
  assertEquals(resolveEmailRecipient({}, contact, config), "contact@x.com");
  assertEquals(resolveEmailRecipient({}, { email: null }, config), "cfg@x.com");
});

Deno.test("resolveEmailRecipient: nada disponível → null", () => {
  assertEquals(resolveEmailRecipient({}, { email: null }, null), null);
  assertEquals(resolveEmailRecipient({}, { email: null }, { email_addresses: [] }), null);
});

// ─── resolveWebhookUrl ──────────────────────────────────────────────────────

Deno.test("resolveWebhookUrl: payload/metadata vence; slack usa config.slack_webhook", () => {
  const config: NotifChannelConfig = { slack_webhook: "https://hooks.slack.com/cfg", webhook_url: "https://generic.cfg" };
  assertEquals(
    resolveWebhookUrl("slack", { metadata: { webhook_url: "https://meta" } }, config),
    "https://meta",
  );
  assertEquals(resolveWebhookUrl("slack", { url: "https://payload" }, config), "https://payload");
  assertEquals(resolveWebhookUrl("slack", {}, config), "https://hooks.slack.com/cfg");
});

Deno.test("resolveWebhookUrl: webhook genérico usa config.webhook_url", () => {
  const config: NotifChannelConfig = { slack_webhook: "https://hooks.slack.com/cfg", webhook_url: "https://generic.cfg" };
  assertEquals(resolveWebhookUrl("webhook", {}, config), "https://generic.cfg");
});

Deno.test("resolveWebhookUrl: nada disponível → null", () => {
  assertEquals(resolveWebhookUrl("slack", {}, null), null);
  assertEquals(resolveWebhookUrl("webhook", {}, { slack_webhook: "https://hooks.slack.com/x" }), null);
});

// ─── getChannelConfig (RPC fake) ────────────────────────────────────────────

function fakeSupabase(results: Array<{ data: unknown; error: { message: string } | null }>) {
  const calls: Array<{ rpc: string; params: Record<string, unknown> }> = [];
  const supabase = {
    rpc: (rpc: string, params: Record<string, unknown>) => {
      calls.push({ rpc, params });
      return Promise.resolve(results[Math.min(calls.length - 1, results.length - 1)]);
    },
  };
  return { supabase, calls };
}

Deno.test("getChannelConfig: RPC ok com linha → config (jsonb)", async () => {
  const { supabase, calls } = fakeSupabase([
    {
      data: { channel: "email", enabled: true, email_addresses: ["a@x.com"], priority_filter: "high" },
      error: null,
    },
  ]);
  const config = await getChannelConfig(supabase as never, "email");
  assertEquals(config, {
    channel: "email",
    enabled: true,
    email_addresses: ["a@x.com"],
    priority_filter: "high",
  });
  assertEquals(calls, [{ rpc: "zapp_notif_config_get", params: { p_channel: "email" } }]);
});

Deno.test("getChannelConfig: RPC ok sem linha (data null) → null", async () => {
  const { supabase } = fakeSupabase([{ data: null, error: null }]);
  assertEquals(await getChannelConfig(supabase as never, "slack"), null);
});

Deno.test("getChannelConfig: erro da RPC → null (fallback silencioso, não lança)", async () => {
  const { supabase } = fakeSupabase([{ data: null, error: { message: "function not found" } }]);
  assertEquals(await getChannelConfig(supabase as never, "webhook"), null);
});

Deno.test("getChannelConfig: exception no client → null (não lança)", async () => {
  const supabase = {
    rpc: () => Promise.reject(new Error("network down")),
  };
  assertEquals(await getChannelConfig(supabase as never, "email"), null);
});
