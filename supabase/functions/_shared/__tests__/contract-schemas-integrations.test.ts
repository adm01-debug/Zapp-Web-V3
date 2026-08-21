/**
 * Contract Schemas — Integrações externas (zapp-web-v3).
 *
 * Cobre os 14 contratos de integração via o registro canônico
 * CONTRACT_SCHEMAS['<nome>'].v1 (contract-schemas.ts):
 *   bitrix-api, contacts-import, create-user, evolution-api, evolution-sync,
 *   gmail-send, instance-pause-control, promogifts-catalog,
 *   public-api, sicoob-bridge, sicoob-bridge-reply, whatsapp-cloud-send,
 *   whatsapp-webhook.
 *
 * Regra de ouro: webhooks/payloads externos são PERMISSIVOS (.passthrough()
 * ou strip default do Zod) — campo desconhecido NUNCA pode derrubar a
 * ingestão. Por isso os casos "payload desconhecido extra" esperam SUCESSO.
 * Únicas exceções (unions discriminadas ESTRITAS, endpoints internos):
 * promogifts-catalog — campo extra no topo FALHA por design.
 *
 * body null → 422 invalid_json (parseOrReject) para todos os 14 contratos.
 *
 * Rodar: deno test --allow-net --allow-env --allow-read \
 *   supabase/functions/_shared/__tests__/contract-schemas-integrations.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { parseOrReject } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";

const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

// ─── Sanity: todos os 14 contratos registrados no registro canônico ────────

const INTEGRATION_CONTRACTS = [
  "bitrix-api",
  "contacts-import",
  "create-user",
  "evolution-api",
  "evolution-sync",
  "gmail-send",
  "instance-pause-control",
  "promogifts-catalog",
  "public-api",
  "sicoob-bridge",
  "sicoob-bridge-reply",
  "whatsapp-cloud-send",
] as const;

Deno.test("integrations: os 12 contratos estão registrados em CONTRACT_SCHEMAS com v1", () => {
  for (const name of INTEGRATION_CONTRACTS) {
    const map = CONTRACT_SCHEMAS[name];
    assert(map, `${name}: ausente de CONTRACT_SCHEMAS`);
    assert(map.v1, `${name}: v1 ausente`);
  }
});

// ─── Matriz genérica (12 contratos permissivos: passthrough/strip) ─────────
// Casos por contrato: payloads válidos (campos conhecidos), payloads com
// campo desconhecido EXTRA (devem PASSAR — permissivo), payloads inválidos,
// e body null → invalid_json (aplicado no runner).

interface IntegrationCase {
  name: string;
  valid: unknown[];
  /** Payloads com campos desconhecidos — DEVEM passar (permissivo/strip). */
  extraPass: unknown[];
  invalid: Array<{ label: string; payload: unknown; expectPath?: string }>;
}

const MATRICES: IntegrationCase[] = [
  {
    name: "bitrix-api",
    valid: [
      { action: "list", entityType: "lead" },
      { action: "create", entityType: "contact", data: { NAME: "João", PHONE: "5511999999999" }, filters: { onlyMy: true } },
      { action: "register_call", entityType: "call" },
    ],
    extraPass: [
      { action: "get", entityId: "123", extra_field: "ignored" }, // extras do portal Bitrix passam
      { action: "sync_contacts", entityType: "lead", hook_secret: "x", retry_count: 2 },
    ],
    invalid: [
      { label: "action ausente", payload: {}, expectPath: "action" },
      { label: "action fora do enum", payload: { action: "hack" }, expectPath: "action" },
      { label: "entityType fora do enum", payload: { action: "list", entityType: "company" }, expectPath: "entityType" },
    ],
  },
  {
    name: "contacts-import",
    valid: [
      { rows: [{ name: "João", phone: "5511999999999" }] },
      { rows: [{ a: 1 }, { b: 2 }], workspace_id: "wpp2" },
    ],
    extraPass: [
      { rows: [{ name: "João" }], extra: true, source: "csv-upload" }, // extras passam
    ],
    invalid: [
      { label: "rows ausente", payload: {}, expectPath: "rows" },
      { label: "rows vazio", payload: { rows: [] }, expectPath: "rows" },
      { label: "rows com tipo errado", payload: { rows: "nope" }, expectPath: "rows" },
    ],
  },
  {
    name: "create-user",
    valid: [
      { email: "joao@example.com", password: "senha12345", name: "João" },
      {
        email: "admin@example.com", password: "senha12345", name: "Admin",
        role: "admin", google_services: ["google_sheets", "google_docs"],
        avatar_url: "https://cdn.example.com/a.png", gmail_email: "g@example.com",
        dropbox_email: "d@example.com", nickname: "J", signature: "Att",
        job_title: "Suporte",
      },
    ],
    extraPass: [
      { email: "x@example.com", password: "senha12345", name: "X", extra: true }, // extras passam
    ],
    invalid: [
      { label: "sem email/password/name", payload: {}, expectPath: "email" },
      { label: "password curta (<8)", payload: { email: "a@b.com", password: "123", name: "X" }, expectPath: "password" },
      { label: "email inválido", payload: { email: "bad", password: "senha12345", name: "X" }, expectPath: "email" },
      { label: "role fora do enum", payload: { email: "a@b.com", password: "senha12345", name: "X", role: "owner" }, expectPath: "role" },
    ],
  },
  {
    name: "evolution-api",
    valid: [
      { action: "sendText", instanceName: "wpp2", number: "5511999999999" },
      {}, // tudo opcional — proxy roteia por action
    ],
    extraPass: [
      { action: "sendMedia", instanceName: "wpp2", url: "https://x.com/a.jpg", mediatype: "image" }, // url/mediatype não estão no schema
      { instance: "wpp2", remoteJid: "5511@s.whatsapp.net", key: { id: "k1" }, message: { text: "oi" }, extra: 1 },
    ],
    invalid: [
      { label: "body primitivo (string)", payload: "x" },
    ],
  },
  {
    name: "evolution-sync",
    valid: [
      { action: "sync-contacts", instanceName: "wpp2" },
      { action: "sync-contacts", page: 2, offset: 10, contactPhone: "5511999999999" },
    ],
    extraPass: [
      { action: "sync-contacts", webhookUrl: "https://x.com/hook", messagesPerContact: 5 }, // extras passam
    ],
    invalid: [
      { label: "body primitivo (string)", payload: "x" },
    ],
  },
  {
    name: "gmail-send",
    valid: [
      { accountId: "acc_1", to: "a@example.com", subject: "Oi", bodyHtml: "<p>oi</p>" },
      {
        accountId: "acc_1", action: "send", to: ["a@example.com", "c@example.com"],
        cc: ["x@example.com"], bcc: ["z@example.com"], bodyPlain: "oi", threadId: "t1",
        messageId: "m1", read: true, addLabelIds: ["INBOX"], removeLabelIds: ["UNREAD"],
        attachments: [{ name: "f.pdf", contentType: "application/pdf" }],
      },
    ],
    extraPass: [
      { accountId: "acc_1", to: "a@example.com", extra_field: 1 }, // extras passam
    ],
    invalid: [
      { label: "accountId ausente", payload: {}, expectPath: "accountId" },
      { label: "accountId vazio", payload: { accountId: "" }, expectPath: "accountId" },
      { label: "to com e-mail inválido", payload: { accountId: "a", to: "not-an-email" }, expectPath: "to" },
    ],
  },
  {
    name: "instance-pause-control",
    valid: [
      { action: "pause", instance: "wpp2", minutes: 30 },
      { action: "list", limit: 50 },
    ],
    extraPass: [
      { action: "pause", instance: "wpp2", reason: "manutenção", since_minutes: 60 }, // extras passam
    ],
    invalid: [
      { label: "action ausente", payload: {}, expectPath: "action" },
      { label: "action vazia", payload: { action: "" }, expectPath: "action" },
      { label: "minutes acima de 1440", payload: { action: "pause", minutes: 99999 }, expectPath: "minutes" },
    ],
  },
  {
    name: "public-api",
    valid: [
      { action: "send", number: "5511999999999", message: "Olá" },
      {
        action: "send", number: "+55 (11) 99999-9999", message: "msg",
        connectionId: UUID,
      },
    ],
    extraPass: [
      { action: "send", number: "5511999999999", message: "Olá", extra: true }, // extras passam
    ],
    invalid: [
      { label: "action ausente", payload: { number: "5511999999999", message: "Olá" }, expectPath: "action" },
      { label: "number curto (<10 dígitos)", payload: { action: "send", number: "119", message: "Olá" }, expectPath: "number" },
      { label: "message vazio", payload: { action: "send", number: "5511999999999", message: "" }, expectPath: "message" },
      { label: "connectionId não-UUID", payload: { action: "send", number: "5511999999999", message: "x", connectionId: "nope" }, expectPath: "connectionId" },
    ],
  },
  {
    name: "sicoob-bridge",
    valid: [
      {
        action: "new_message", message_id: "m1", content: "Olá",
        sender_name: "João", sender_email: "j@example.com", sender_phone: "5511999999999",
        singular_name: "Empresa", singular_id: "s1", vendedor_user_id: "v1",
        created_at: "2026-01-01T00:00:00Z", sender_id: "snd1",
      },
      { action: "mark_read", external_ids: ["a", "b"] },
    ],
    extraPass: [
      { action: "new_message", message_id: "m1", content: "Olá", provider_extra: { x: 1 } }, // campo novo do provedor passa
    ],
    invalid: [
      { label: "new_message sem message_id", payload: { action: "new_message", content: "x" }, expectPath: "message_id" },
      { label: "new_message sem content", payload: { action: "new_message", message_id: "m" }, expectPath: "content" },
      { label: "mark_read sem external_ids", payload: { action: "mark_read" }, expectPath: "external_ids" },
      { label: "action fora da union", payload: { action: "hack" }, expectPath: "action" },
      // Bloco 4 (2026-08-21): sender_email/sender_phone agora validam formato.
      { label: "sender_email inválido", payload: { action: "new_message", message_id: "m1", content: "x", sender_email: "não-é-email" }, expectPath: "sender_email" },
      { label: "sender_phone curto (<10 dígitos)", payload: { action: "new_message", message_id: "m1", content: "x", sender_phone: "551" }, expectPath: "sender_phone" },
    ],
  },
  {
    name: "sicoob-bridge-reply",
    valid: [
      { contact_id: "c1", content: "Oi", message_id: "m1" },
      { contact_id: "c1", content: "Oi" }, // message_id/created_at/agent_id opcionais
    ],
    extraPass: [
      { contact_id: "c1", content: "x", created_at: "2026-01-01T00:00:00Z", agent_id: "a1", extra_field: true }, // extras passam
    ],
    invalid: [
      { label: "body primitivo (string)", payload: "x" },
      // Bloco 2/3 (2026-08-21): contact_id/content viraram obrigatórios —
      // {} era aceito antes do fix do drift (schema tinha os dois optional
      // enquanto o handler sempre exigiu ambos via bloco 400 manual).
      { label: "{} sem contact_id/content", payload: {} },
    ],
  },
  {
    name: "whatsapp-cloud-send",
    valid: [
      { to: "5511999999999", type: "text", text: "Olá" },
      { to: "5511999999999", type: "template", template: { name: "welcome", language: "pt_BR" } },
    ],
    extraPass: [
      { to: "5511999999999", type: "image", mediaUrl: "https://x.com/a.jpg", caption: "foto", previewUrl: "https://x.com/p.jpg" }, // previewUrl não está no schema
    ],
    invalid: [
      { label: "to ausente", payload: { type: "text" }, expectPath: "to" },
      { label: "to curto (<5)", payload: { to: "5511", type: "text" }, expectPath: "to" },
      { label: "type ausente", payload: { to: "5511999999999" }, expectPath: "type" },
      { label: "type fora do enum", payload: { to: "5511999999999", type: "gif" }, expectPath: "type" },
      { label: "to tipo errado (number)", payload: { to: 42, type: "text" }, expectPath: "to" },
    ],
  },
];

for (const m of MATRICES) {
  for (const [i, payload] of m.valid.entries()) {
    Deno.test(`integrations: ${m.name}@v1 — payload válido #${i + 1}`, () => {
      const schema = CONTRACT_SCHEMAS[m.name].v1!;
      const r = schema.safeParse(payload);
      assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
    });
  }
  for (const [i, payload] of m.extraPass.entries()) {
    Deno.test(`integrations: ${m.name}@v1 — campo desconhecido extra PASS #${i + 1} (permissivo)`, () => {
      const schema = CONTRACT_SCHEMAS[m.name].v1!;
      const r = schema.safeParse(payload);
      assertEquals(r.success, true, `payload com campo extra foi rejeitado: ${JSON.stringify(r.success ? "" : r.error.issues)}`);
    });
  }
  for (const c of m.invalid) {
    Deno.test(`integrations: ${m.name}@v1 — inválido: ${c.label}`, () => {
      const schema = CONTRACT_SCHEMAS[m.name].v1!;
      const r = schema.safeParse(c.payload);
      assertEquals(r.success, false, "payload inválido foi aceito");
      if (!r.success && c.expectPath) {
        const paths = r.error.issues.map((it) => it.path.join("."));
        assert(
          paths.some((p) => p === c.expectPath || p.startsWith(c.expectPath + ".")),
          `esperava issue em '${c.expectPath}', obtido: ${paths.join(" | ")}`,
        );
      }
    });
  }
  Deno.test(`integrations: ${m.name}@v1 — body null → 422 invalid_json`, () => {
    const result = parseOrReject(m.name, CONTRACT_SCHEMAS[m.name], null, null);
    assertEquals(result.ok, false, `${m.name}: esperado ok=false para body null`);
    if (result.ok === false) {
      assertEquals(result.response.status, 422);
      assertEquals(result.body.code, "invalid_json");
      assertEquals(result.body.details[0].path, "root");
    }
  });
}

// ─── promogifts-catalog@v1 — union discriminada por action (endpoint interno, ESTRITO) ──

Deno.test("integrations: promogifts-catalog@v1 — list_products válido (com params)", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({
    action: "list_products",
    params: {
      search: "camisa", category_id: UUID, supplier_id: UUID,
      limit: 10, offset: 0, order_by: "name", ascending: true,
      only_active: true, only_in_stock: false,
    },
  });
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
});

Deno.test("integrations: promogifts-catalog@v1 — get_product válido", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({
    action: "get_product",
    params: { product_id: UUID },
  });
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
});

Deno.test("integrations: promogifts-catalog@v1 — health válido (está na union)", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({ action: "health" });
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
});

Deno.test("integrations: promogifts-catalog@v1 — list_categories válido", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({ action: "list_categories" });
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
});

Deno.test("integrations: promogifts-catalog@v1 — list_suppliers válido", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({ action: "list_suppliers" });
  assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
});

Deno.test("integrations: promogifts-catalog@v1 — action inválida FALHA", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({ action: "delete_product" });
  assertEquals(r.success, false, "action desconhecida foi aceita");
});

Deno.test("integrations: promogifts-catalog@v1 — campo extra no topo FALHA (strict)", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({ action: "health", hack: true });
  assertEquals(r.success, false, "campo extra em union estrita foi aceito");
});

Deno.test("integrations: promogifts-catalog@v1 — get_product com params sem product_id FALHA", () => {
  const r = CONTRACT_SCHEMAS["promogifts-catalog"].v1!.safeParse({ action: "get_product", params: {} });
  assertEquals(r.success, false, "get_product sem product_id foi aceito");
});

Deno.test("integrations: promogifts-catalog@v1 — body null → 422 invalid_json", () => {
  const result = parseOrReject("promogifts-catalog", CONTRACT_SCHEMAS["promogifts-catalog"], null, null);
  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.response.status, 422);
    assertEquals(result.body.code, "invalid_json");
  }
});
