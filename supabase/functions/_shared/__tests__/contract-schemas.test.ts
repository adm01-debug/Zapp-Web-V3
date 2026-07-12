/**
 * Matriz de testes de contrato por schema — casos válidos, campos ausentes,
 * tipos incorretos e valores vazios, por endpoint.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-schemas.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  ElevenLabsWebhookV1Schema,
  GmailWebhookV1Schema,
  TalkxSendV1Schema,
  SendEmailV1Schema,
  ReprocessFailedMessagesV1Schema,
  RecheckWebhookSignatureV1Schema,
  WebhookDiagnosticV1Schema,
  InstancePauseControlV1Schema,
  ContactsImportV1Schema,
  VoiceCopilotActionV1Schema,
  GmailSendV1Schema,
  EvolutionSyncV1Schema,
} from "../contract-schemas.ts";
import type { z } from "../contract-schemas.ts";

const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

interface Matrix {
  name: string;
  schema: z.ZodTypeAny;
  valid: unknown[];
  invalid: Array<{ label: string; payload: unknown; expectPath?: string }>;
}

const MATRICES: Matrix[] = [
  {
    name: "elevenlabs-webhook@v1 (permissivo — webhook externo)",
    schema: ElevenLabsWebhookV1Schema,
    valid: [
      { type: "tts.completed", request_id: "abc" },
      { event_type: "tts.failed", error: { msg: "x" }, id: 99 },
      {}, // provedor pode mandar evento desconhecido → logado como 'unknown'
      { type: null, campo_novo_do_provedor: { a: 1 } }, // passthrough + nullish
    ],
    invalid: [
      { label: "type com tipo errado (objeto)", payload: { type: { nested: true } }, expectPath: "type" },
      { label: "type acima de 100 chars", payload: { type: "x".repeat(101) }, expectPath: "type" },
      { label: "id com tipo errado (array)", payload: { id: [1, 2] }, expectPath: "id" },
    ],
  },
  {
    name: "gmail-webhook@v1 (envelope Pub/Sub OU ação interna)",
    schema: GmailWebhookV1Schema,
    valid: [
      { action: "health" },
      { accountId: "acc_1", action: "sync" },
      { message: { data: "eyJmb28iOiJiYXIifQ==", messageId: "m1", publishTime: "2026-07-10T00:00:00Z" }, subscription: "projects/x/subscriptions/y" },
      { message: { data: null } }, // push sem data — tratado no handler
    ],
    invalid: [
      { label: "message com tipo errado (string)", payload: { message: "raw" }, expectPath: "message" },
      { label: "message.data com tipo errado (number)", payload: { message: { data: 42 } }, expectPath: "message.data" },
    ],
  },
  {
    name: "talkx-send@v1 (estrito — UI)",
    schema: TalkxSendV1Schema,
    valid: [
      { campaignId: UUID, action: "start" },
      { campaignId: UUID, action: "pause" },
      { campaignId: UUID, action: "cancel" },
      { campaignId: UUID }, // action omitida = start (comportamento atual)
    ],
    invalid: [
      { label: "campaignId ausente", payload: { action: "start" }, expectPath: "campaignId" },
      { label: "campaignId vazio", payload: { campaignId: "" }, expectPath: "campaignId" },
      { label: "campaignId não-UUID", payload: { campaignId: "123" }, expectPath: "campaignId" },
      { label: "campaignId tipo errado", payload: { campaignId: 42 }, expectPath: "campaignId" },
      { label: "action fora do enum", payload: { campaignId: UUID, action: "resume" }, expectPath: "action" },
      { label: "action tipo errado", payload: { campaignId: UUID, action: 1 }, expectPath: "action" },
      { label: "campo extra (strict)", payload: { campaignId: UUID, hack: true } },
    ],
  },
  {
    name: "send-email@v1 (duas formas: accountId OU to+subject+html)",
    schema: SendEmailV1Schema,
    valid: [
      { accountId: "acc_1", to: "a@b.com", subject: "s", html: "<p>x</p>" },
      { accountId: "acc_1" }, // delega — gmail-send valida o resto
      { to: "a@b.com", subject: "Oi", html: "<b>corpo</b>" },
      { to: ["a@b.com", "c@d.com"], subject: "s", html: "x" },
    ],
    invalid: [
      { label: "sem accountId e sem to", payload: { subject: "s", html: "x" }, expectPath: "to" },
      { label: "sem accountId e subject vazio", payload: { to: "a@b.com", subject: "", html: "x" }, expectPath: "subject" },
      { label: "sem accountId e html ausente", payload: { to: "a@b.com", subject: "s" }, expectPath: "html" },
      { label: "to com e-mail inválido", payload: { to: "não-é-email", subject: "s", html: "x" }, expectPath: "to" },
      { label: "to array vazio", payload: { to: [], subject: "s", html: "x" }, expectPath: "to" },
      { label: "to array com tipo errado", payload: { to: [123], subject: "s", html: "x" } },
      { label: "51 destinatários (limite 50)", payload: { to: Array.from({ length: 51 }, (_, i) => `u${i}@x.com`), subject: "s", html: "x" }, expectPath: "to" },
    ],
  },
  {
    name: "reprocess-failed-messages@v1 (body opcional, estrito quando presente)",
    schema: ReprocessFailedMessagesV1Schema,
    valid: [{}, { limit: 10 }, { limit: 25, dryRun: true }],
    invalid: [
      { label: "limit acima do batch máximo (25)", payload: { limit: 26 }, expectPath: "limit" },
      { label: "limit zero", payload: { limit: 0 }, expectPath: "limit" },
      { label: "limit tipo errado", payload: { limit: "10" }, expectPath: "limit" },
      { label: "dryRun tipo errado", payload: { dryRun: "yes" }, expectPath: "dryRun" },
      { label: "campo extra (strict)", payload: { force: true } },
    ],
  },
  {
    name: "recheck-webhook-signature@v1",
    schema: RecheckWebhookSignatureV1Schema,
    valid: [
      { event_id: "evt_1" },
      { event_id: "evt_1", observed_signature: "sha256=abc" },
      { event_id: "evt_1", observed_signature: null },
    ],
    invalid: [
      { label: "event_id ausente", payload: {}, expectPath: "event_id" },
      { label: "event_id vazio", payload: { event_id: "" }, expectPath: "event_id" },
      { label: "event_id tipo errado", payload: { event_id: 42 }, expectPath: "event_id" },
    ],
  },
  {
    name: "webhook-diagnostic@v1",
    schema: WebhookDiagnosticV1Schema,
    valid: [{}, { action: "full-diagnostic" }, { action: "ping", instanceName: "wpp2" }],
    invalid: [
      { label: "instanceName vazio", payload: { instanceName: "" }, expectPath: "instanceName" },
      { label: "instanceName tipo errado", payload: { instanceName: { x: 1 } }, expectPath: "instanceName" },
    ],
  },
  {
    name: "instance-pause-control@v1",
    schema: InstancePauseControlV1Schema,
    valid: [
      { action: "list" },
      { action: "pause", instance: "wpp2", minutes: 15 },
      { action: "history", limit: 200 },
    ],
    invalid: [
      { label: "action ausente", payload: { instance: "wpp2" }, expectPath: "action" },
      { label: "action vazia", payload: { action: "" }, expectPath: "action" },
      { label: "minutes acima de 1440", payload: { action: "pause", minutes: 1441 }, expectPath: "minutes" },
      { label: "limit acima de 200", payload: { action: "history", limit: 201 }, expectPath: "limit" },
      { label: "minutes tipo errado", payload: { action: "pause", minutes: "15" }, expectPath: "minutes" },
    ],
  },
  {
    name: "contacts-import@v1",
    schema: ContactsImportV1Schema,
    valid: [
      { rows: [{ name: "A", phone: "5511..." }] },
      { rows: [{}], workspace_id: "wpp2" },
    ],
    invalid: [
      { label: "rows ausente", payload: {}, expectPath: "rows" },
      { label: "rows vazio", payload: { rows: [] }, expectPath: "rows" },
      { label: "rows tipo errado (objeto)", payload: { rows: { a: 1 } }, expectPath: "rows" },
      { label: "workspace_id vazio", payload: { rows: [{}], workspace_id: "" }, expectPath: "workspace_id" },
    ],
  },
  {
    name: "voice-copilot-action@v1",
    schema: VoiceCopilotActionV1Schema,
    valid: [{ action: "search" }, { action: "open", params: { id: "1" } }, { action: "x", params: null }],
    invalid: [
      { label: "action ausente", payload: { params: {} }, expectPath: "action" },
      { label: "action vazia", payload: { action: "" }, expectPath: "action" },
      { label: "params tipo errado (string)", payload: { action: "x", params: "raw" }, expectPath: "params" },
    ],
  },
  {
    name: "gmail-send@v1",
    schema: GmailSendV1Schema,
    valid: [
      { accountId: "acc", action: "send", to: "a@b.com", subject: "s", bodyHtml: "<p>x</p>" },
      { accountId: "acc", action: "markRead", messageIds: ["m1"], read: true },
      { accountId: "acc", action: "labels", messageId: "m1", addLabelIds: ["INBOX"] },
    ],
    invalid: [
      { label: "accountId ausente", payload: { action: "send" }, expectPath: "accountId" },
      { label: "to inválido", payload: { accountId: "acc", to: "x" }, expectPath: "to" },
      { label: "cc com e-mail inválido", payload: { accountId: "acc", cc: ["oi"] } },
      { label: "read tipo errado", payload: { accountId: "acc", read: "true" }, expectPath: "read" },
    ],
  },
  {
    name: "evolution-sync@v1",
    schema: EvolutionSyncV1Schema,
    valid: [{}, { action: "sync-contacts" }, { action: "sync-messages", instanceName: "wpp2", page: 2, offset: 100 }],
    invalid: [
      { label: "page zero", payload: { page: 0 }, expectPath: "page" },
      { label: "offset tipo errado", payload: { offset: "100" }, expectPath: "offset" },
      { label: "instanceName vazio", payload: { instanceName: "" }, expectPath: "instanceName" },
    ],
  },
];

for (const m of MATRICES) {
  for (const [i, payload] of m.valid.entries()) {
    Deno.test(`${m.name} — válido #${i + 1}`, () => {
      const r = m.schema.safeParse(payload);
      assertEquals(r.success, true, r.success ? "" : JSON.stringify(r.error.issues));
    });
  }
  for (const c of m.invalid) {
    Deno.test(`${m.name} — inválido: ${c.label}`, () => {
      const r = m.schema.safeParse(c.payload);
      assertEquals(r.success, false, "payload inválido foi aceito");
      if (!r.success && c.expectPath) {
        const paths = r.error.issues.map((it) => it.path.join("."));
        assert(
          paths.some((p) => p === c.expectPath || p.startsWith(c.expectPath + ".") || p === ""),
          `esperava issue em '${c.expectPath}', obtido: ${paths.join(" | ")}`,
        );
      }
    });
  }
}
