/**
 * Matriz de testes de contrato — schemas de INFRAESTRUTURA (v1) de zapp-web-v3.
 *
 * Cobre as 35 funções de infra registradas no registro canônico:
 *   (A) GET/cron sem body (17): EmptyStrictV1Schema — `{}` passa, qualquer
 *       campo desconhecido falha (422).
 *   (B) com body (16): payload válido conforme o CONSUMO REAL documentado nos
 *       comentários de contract-schemas-infra.ts + campo obrigatório ausente
 *       falha + tipo errado falha.
 *   (C) multipart (3): File válido passa; string no lugar de File falha.
 *
 * Usa SEMPRE `CONTRACT_SCHEMAS['<nome>'].v1` (registro canônico) — nunca
 * importa o index.ts da função nem re-implementa o schema.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-schemas-infra.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import type { z } from "../contract-kit.ts";

interface Matrix {
  name: string;
  schema: z.ZodTypeAny;
  valid: unknown[];
  invalid: Array<{ label: string; payload: unknown; expectPath?: string }>;
}

const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

/** Acesso tipado ao registro canônico — CONTRACT_SCHEMAS['<nome>'].v1. */
const V1 = (name: string): z.ZodTypeAny => CONTRACT_SCHEMAS[name].v1 as z.ZodTypeAny;

// ─── (A) GET/cron sem body — EmptyStrict ─────────────────────────────────────
// {} DEVE passar; {qualquer: 1} DEVE falhar (strict).
const EMPTY_STRICT_NAMES = [
  "batch-fetch-avatars",
  "cleanup-rate-limit-logs",
  "cleanup-storage-orphans",
  "elevenlabs-scribe-token",
  "get-mapbox-token",
  "get-sip-password",
  "lgpd-scheduled-jobs",
  "main",
  "mcp",
  "migrate-media-storage",
  "nps-scheduler",
  "provider-healthcheck",
  "sicoob-outbox-consumer",
  "talkx-scheduler",
] as const;

for (const name of EMPTY_STRICT_NAMES) {
  const schema = V1(name);

  Deno.test(`infra ${name}@v1 — GET/cron sem body: {} é aceito`, () => {
    const r = schema.safeParse({});
    assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
  });

  Deno.test(`infra ${name}@v1 — GET/cron sem body: campo desconhecido é rejeitado (EmptyStrict)`, () => {
    const r = schema.safeParse({ qualquer: 1 });
    assertEquals(r.success, false, "body com campo desconhecido foi aceito");
    if (!r.success) {
      const paths = r.error.issues.map((it) => it.path.join("."));
      assert(
        // zod 3.23.8 reporta unrecognized_keys com path "" (raiz) — verificado
        // com probe executável; aceitar o path raiz também cobre isso.
        paths.some((p) => p === "qualquer" || p === ""),
        `esperava issue em 'qualquer', obtido: ${paths.join(" | ")}`,
      );
    }
  });
}

// ─── (B) Com body — payloads conforme consumo real documentado ───────────────
const MATRICES: Matrix[] = [
{
    name: "reprocess-failed-messages",
    schema: CONTRACT_SCHEMAS["reprocess-failed-messages"].v1!,
    valid: [
      {},
      { limit: 25 },
      { dryRun: true },
      { limit: 1, dryRun: false },
    ],
    invalid: [
      { label: "limit fora do range", payload: { limit: 26 }, expectPath: "limit" },
      { label: "limit tipo errado", payload: { limit: "dez" }, expectPath: "limit" },
    ],
  },

  {
    name: "client-observability@v1 (estrito — metrics[] min 1)",
    schema: V1("client-observability"),
    valid: [
      {
        metrics: [{
          name: "LCP",
          value: 2.5,
          rating: "good",
          delta: 120,
          id: "m-1",
          path: "/",
          url: "https://app.exemplo.com",
          userAgent: "Mozilla/5.0",
          timestamp: "2026-08-04T12:00:00Z",
        }],
      },
      {
        metrics: [
          { name: "TTFB", value: 300, rating: "needs-improvement", delta: 10, id: "m-2" },
          { name: "CLS", value: 0.05, rating: "poor", delta: 0.01, id: "m-3" },
        ],
      },
    ],
    invalid: [
      { label: "metrics ausente", payload: {}, expectPath: "metrics" },
      { label: "metrics vazio (min 1)", payload: { metrics: [] }, expectPath: "metrics" },
      { label: "name fora do enum", payload: { metrics: [{ name: "FOO", value: 1, rating: "good", delta: 1, id: "x" }] }, expectPath: "metrics" },
      { label: "value com tipo errado", payload: { metrics: [{ name: "LCP", value: "2.5", rating: "good", delta: 1, id: "x" }] }, expectPath: "metrics" },
    ],
  },
  {
    name: "connection-test@v1 (estrito — mode opcional)",
    schema: V1("connection-test"),
    valid: [
      {},
      { mode: "official" },
      { mode: "unofficial" },
    ],
    invalid: [
      { label: "mode fora do enum", payload: { mode: "hybrid" }, expectPath: "mode" },
      { label: "mode com tipo errado", payload: { mode: 42 }, expectPath: "mode" },
      { label: "campo extra (strict)", payload: { channel: "wpp1" } },
    ],
  },
  {
    name: "contact-media@v1 (estrito — contact_id UUID obrigatório)",
    schema: V1("contact-media"),
    valid: [
      { contact_id: UUID },
      { contact_id: UUID, limit: 30, media_type: "image", cursor: "opaque-cursor", offset: 5 },
    ],
    invalid: [
      { label: "contact_id ausente", payload: { limit: 10 }, expectPath: "contact_id" },
      { label: "contact_id não é UUID", payload: { contact_id: "abc" }, expectPath: "contact_id" },
      { label: "limit acima de 100", payload: { contact_id: UUID, limit: 101 }, expectPath: "limit" },
      { label: "media_type fora do enum", payload: { contact_id: UUID, media_type: "gif" }, expectPath: "media_type" },
    ],
  },
  {
    name: "fetch-whatsapp-avatar@v1 (estrito — phone obrigatório)",
    schema: V1("fetch-whatsapp-avatar"),
    valid: [
      { phone: "5511999999999" },
      { phone: "1" },
    ],
    invalid: [
      { label: "phone ausente", payload: {}, expectPath: "phone" },
      { label: "phone vazio", payload: { phone: "" }, expectPath: "phone" },
      { label: "phone com tipo errado", payload: { phone: 5511999999999 }, expectPath: "phone" },
    ],
  },
  {
    name: "login-attempts@v1 (estrito — action/email obrigatórios)",
    schema: V1("login-attempts"),
    valid: [
      { action: "check", email: "user@exemplo.com", userAgent: "Mozilla/5.0" },
      { action: "record_failed", email: "user@exemplo.com", userAgent: null },
      { action: "clear", email: "user@exemplo.com" },
    ],
    invalid: [
      { label: "action ausente", payload: { email: "user@exemplo.com" }, expectPath: "action" },
      { label: "action fora do enum", payload: { action: "ban", email: "user@exemplo.com" }, expectPath: "action" },
      { label: "email ausente", payload: { action: "check" }, expectPath: "email" },
      { label: "email inválido", payload: { action: "check", email: "not-an-email" }, expectPath: "email" },
    ],
  },
  {
    name: "mcp-server@v1 (permissivo — protocolo JSON-RPC)",
    schema: V1("mcp-server"),
    valid: [
      {},
      { method: "list_tools" },
      // Envelope JSON-RPC 2.0 real — PERMISSIVO por design (B1 2026-08-04:
      // .strict() rejeitaria todo request legítimo do protocolo MCP).
      { jsonrpc: "2.0", id: 1, method: "list_tools", params: {} },
    ],
    invalid: [
      { label: "method com tipo errado", payload: { method: 123 }, expectPath: "method" },
    ],
  },
  {
    name: "provider-router@v1 (estrito — action obrigatório)",
    schema: V1("provider-router"),
    valid: [
      { action: "sendText", channel_connection_id: "ch1", whatsapp_connection_id: "wpp1", payload: { to: "5511" } },
      { action: "ping" },
    ],
    invalid: [
      { label: "action ausente", payload: { channel_connection_id: "ch1" }, expectPath: "action" },
      { label: "action fora do enum", payload: { action: "deleteAll" }, expectPath: "action" },
      { label: "payload com tipo errado", payload: { action: "ping", payload: "x" }, expectPath: "payload" },
    ],
  },
  {
    name: "queue-rebalance@v1 (estrito — body opcional)",
    schema: V1("queue-rebalance"),
    valid: [
      {},
      { limit: 50, dry_run: true, source: "panel" },
    ],
    invalid: [
      { label: "limit abaixo de 1", payload: { limit: 0 }, expectPath: "limit" },
      { label: "limit acima de 200", payload: { limit: 201 }, expectPath: "limit" },
      { label: "dry_run com tipo errado", payload: { dry_run: "yes" }, expectPath: "dry_run" },
    ],
  },
  {
    name: "recover-corrupted-audios@v1 (estrito — body opcional)",
    schema: V1("recover-corrupted-audios"),
    valid: [
      {},
      { batch_size: 20, offset: 0, dry_run: false },
    ],
    invalid: [
      { label: "batch_size abaixo de 1", payload: { batch_size: 0 }, expectPath: "batch_size" },
      { label: "offset negativo", payload: { offset: -1 }, expectPath: "offset" },
      { label: "batch_size com tipo errado", payload: { batch_size: "20" }, expectPath: "batch_size" },
    ],
  },
  {
    name: "send-rate-limit-alert@v1 (RateLimitAlertSchema — campos obrigatórios)",
    schema: V1("send-rate-limit-alert"),
    valid: [
      { ip_address: "200.1.2.3", endpoint: "/functions/v1/send-message", request_count: 42, blocked: true },
      { ip_address: "::1", endpoint: "/x", request_count: 0 },
    ],
    invalid: [
      { label: "ip_address ausente", payload: { endpoint: "/x", request_count: 1 }, expectPath: "ip_address" },
      { label: "endpoint ausente", payload: { ip_address: "1.1.1.1", request_count: 1 }, expectPath: "endpoint" },
      { label: "request_count com tipo errado", payload: { ip_address: "1.1.1.1", endpoint: "/x", request_count: "42" }, expectPath: "request_count" },
    ],
  },
  {
    name: "sla-alert-forward@v1 (estrito — 5 campos obrigatórios)",
    schema: V1("sla-alert-forward"),
    valid: [
      {
        contact_id: "ct-1",
        contact_name: "João",
        kind: "first_response",
        severity: "warning",
        scope: "current",
        rule_name: null,
        duration_ms: 5000,
        occurred_at: "2026-08-04T12:00:00Z",
      },
      { contact_id: "ct-2", contact_name: "Maria", kind: "delivery_delay", severity: "breached", scope: "none" },
    ],
    invalid: [
      { label: "contact_id ausente", payload: { contact_name: "João", kind: "first_response", severity: "warning", scope: "current" }, expectPath: "contact_id" },
      { label: "kind fora do enum", payload: { contact_id: "ct-1", contact_name: "João", kind: "escalation", severity: "warning", scope: "current" }, expectPath: "kind" },
      { label: "duration_ms com tipo errado", payload: { contact_id: "ct-1", contact_name: "João", kind: "first_response", severity: "warning", scope: "current", duration_ms: "5000" }, expectPath: "duration_ms" },
    ],
  },
  {
    name: "sla-alert-log-failure@v1 (estrito — contact_id/attempted_event_type obrigatórios)",
    schema: V1("sla-alert-log-failure"),
    valid: [
      {
        contact_id: UUID,
        attempted_event_type: "sla.check",
        event_type: "sla",
        error_code: "500",
        error_message: "timeout",
        error_details: "stack",
        original_metadata: { key: "value" },
      },
      { contact_id: null, attempted_event_type: "sla.check" },
    ],
    invalid: [
      { label: "contact_id ausente", payload: { attempted_event_type: "sla.check" }, expectPath: "contact_id" },
      { label: "contact_id não é UUID", payload: { contact_id: "abc", attempted_event_type: "sla.check" }, expectPath: "contact_id" },
      { label: "attempted_event_type ausente", payload: { contact_id: UUID }, expectPath: "attempted_event_type" },
      { label: "attempted_event_type vazio", payload: { contact_id: UUID, attempted_event_type: "" }, expectPath: "attempted_event_type" },
    ],
  },
  {
    name: "talkx-add-recipients@v1 (estrito — campaignId/contactIds obrigatórios)",
    schema: V1("talkx-add-recipients"),
    valid: [
      { campaignId: "camp-1", contactIds: ["5511999999999", "5511888888888"] },
    ],
    invalid: [
      { label: "campaignId ausente", payload: { contactIds: ["5511"] }, expectPath: "campaignId" },
      { label: "contactIds vazio", payload: { campaignId: "camp-1", contactIds: [] }, expectPath: "contactIds" },
      { label: "contactIds com tipo errado", payload: { campaignId: "camp-1", contactIds: "5511" }, expectPath: "contactIds" },
    ],
  },
  {
    name: "talkx-control@v1 (estrito — action/campaignId obrigatórios)",
    schema: V1("talkx-control"),
    valid: [
      { action: "start", campaignId: "camp-1" },
      { action: "pause", campaignId: "camp-1" },
      { action: "cancel", campaignId: "camp-1" },
    ],
    invalid: [
      { label: "action ausente", payload: { campaignId: "camp-1" }, expectPath: "action" },
      { label: "action fora do enum", payload: { action: "stop", campaignId: "camp-1" }, expectPath: "action" },
      { label: "campaignId ausente", payload: { action: "start" }, expectPath: "campaignId" },
    ],
  },
  {
    name: "ticket-router@v1 (estrito — contact_id obrigatório)",
    schema: V1("ticket-router"),
    valid: [
      { contact_id: "ct-1" },
      { contact_id: "ct-1", channel_connection_id: "ch1", queue_id: "q1", apply: true },
      { contact_id: "ct-1", channel_connection_id: null, queue_id: null },
    ],
    invalid: [
      { label: "contact_id ausente", payload: { queue_id: "q1" }, expectPath: "contact_id" },
      { label: "contact_id com tipo errado", payload: { contact_id: 123 }, expectPath: "contact_id" },
      { label: "apply com tipo errado", payload: { contact_id: "ct-1", apply: "yes" }, expectPath: "apply" },
    ],
  },
  {
    name: "virustotal-test@v1 (estrito — apiKey obrigatório)",
    schema: V1("virustotal-test"),
    valid: [
      { apiKey: "vt-api-key-123" },
    ],
    invalid: [
      { label: "apiKey ausente", payload: {}, expectPath: "apiKey" },
      { label: "apiKey vazio", payload: { apiKey: "" }, expectPath: "apiKey" },
      { label: "apiKey com tipo errado", payload: { apiKey: 123 }, expectPath: "apiKey" },
    ],
  },
];

for (const m of MATRICES) {
  for (const [i, payload] of m.valid.entries()) {
    Deno.test(`infra ${m.name} — válido #${i + 1}`, () => {
      const r = m.schema.safeParse(payload);
      assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
    });
  }
  for (const c of m.invalid) {
    Deno.test(`infra ${m.name} — inválido: ${c.label}`, () => {
      const r = m.schema.safeParse(c.payload);
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
}

// ─── (C) Multipart — File válido passa; string no lugar de File falha ────────
const MULTIPART_MATRICES: Matrix[] = [
  {
    name: "file-security-scanner@v1 (multipart — file obrigatório)",
    schema: V1("file-security-scanner"),
    valid: [
      { file: new File(["fake-content"], "scan.bin") },
      { file: new File(["fake-content"], "scan.bin", { type: "application/pdf" }), bucket: "uploads" },
    ],
    invalid: [
      { label: "file ausente", payload: { bucket: "uploads" }, expectPath: "file" },
      { label: "file com tipo errado (string)", payload: { file: "not-a-file", bucket: "uploads" }, expectPath: "file" },
      { label: "campo extra (strict)", payload: { file: new File(["x"], "a.bin"), size: 10 } },
    ],
  },
  {
    name: "secure-upload@v1 (multipart — file obrigatório)",
    schema: V1("secure-upload"),
    valid: [
      { file: new File(["fake-media"], "foto.jpg", { type: "image/jpeg" }) },
      { file: new File(["fake-media"], "foto.jpg"), bucket: "whatsapp-media", path: "chat/123/foto.jpg" },
      { file: new File(["fake-media"], "foto.jpg"), path: null },
    ],
    invalid: [
      { label: "file ausente", payload: { bucket: "whatsapp-media" }, expectPath: "file" },
      { label: "file com tipo errado (string)", payload: { file: "not-a-file" }, expectPath: "file" },
      { label: "path com tipo errado", payload: { file: new File(["x"], "a.jpg"), path: 123 }, expectPath: "path" },
    ],
  },
  {
    name: "voice-changer@v1 (multipart — audio obrigatório)",
    schema: V1("voice-changer"),
    valid: [
      { audio: new File(["fake-audio"], "voz.mp3", { type: "audio/mpeg" }) },
      { audio: new File(["fake-audio"], "voz.mp3"), voice_preset: "grave", task_id: "t-1", authorized: "true" },
      { audio: new File(["fake-audio"], "voz.mp3"), voice_preset: "agudo", task_id: null, authorized: true },
    ],
    invalid: [
      { label: "audio ausente", payload: { voice_preset: "grave" }, expectPath: "audio" },
      { label: "audio com tipo errado (string)", payload: { audio: "not-a-file" }, expectPath: "audio" },
      { label: "campo extra (strict)", payload: { audio: new File(["x"], "a.mp3"), text: "oi" } },
    ],
  },
];

for (const m of MULTIPART_MATRICES) {
  for (const [i, payload] of m.valid.entries()) {
    Deno.test(`infra ${m.name} — válido #${i + 1}`, () => {
      const r = m.schema.safeParse(payload);
      assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
    });
  }
  for (const c of m.invalid) {
    Deno.test(`infra ${m.name} — inválido: ${c.label}`, () => {
      const r = m.schema.safeParse(c.payload);
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
}

// ─── Sanity — todos os 34 nomes estão registrados com v1 no registro canônico ─
Deno.test("infra: os 34 nomes de infra estão registrados com v1 no CONTRACT_SCHEMAS", () => {
  const all = [...EMPTY_STRICT_NAMES, ...MATRICES.map((m) => m.name.split("@")[0]), ...MULTIPART_MATRICES.map((m) => m.name.split("@")[0])];
  assertEquals(new Set(all).size, 34, "esperava exatamente 34 nomes de infra distintos");
  for (const name of all) {
    assert(CONTRACT_SCHEMAS[name], `CONTRACT_SCHEMAS não registra '${name}'`);
    assert(CONTRACT_SCHEMAS[name].v1, `'${name}' não tem versão v1`);
  }
});
