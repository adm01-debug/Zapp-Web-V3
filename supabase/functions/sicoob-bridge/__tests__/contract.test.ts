/**
 * Contract tests — sicoob-bridge@v1.
 *
 * O endpoint é roteado por `action` no body e valida com parseBody:
 *   - action: "new_message" → SicoobBridgeNewMessageSchema
 *     (obrigatórios: message_id, content; demais campos nullish)
 *   - action: "mark_read"   → SicoobBridgeMarkReadSchema
 *     (obrigatório: external_ids[]; sem min — array vazio é aceito)
 *
 * Schemas testados: SicoobBridgeNewMessageSchema / SicoobBridgeMarkReadSchema
 * (_shared/schemas.ts) — os MESMOS usados pelo index.ts via parseBody,
 * não mocks. (Não registrados em CONTRACT_SCHEMAS: são dois schemas por
 * rota de action, não versões de contrato.)
 *
 * Casos: válidos (completo/mínimo), obrigatórios ausentes, tipos errados,
 * array vazio, null/undefined, campos extras (strip).
 */
import { assertEquals } from "jsr:@std/assert";
import {
  SicoobBridgeNewMessageSchema,
  SicoobBridgeMarkReadSchema,
} from "../../_shared/schemas.ts";
import { SicoobBridgeV2Schema } from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

Deno.test("Contract: sicoob-bridge v1 (new_message) — payload completo válido", () => {
  const payload = {
    message_id: "msg_001",
    sender_name: "Maria Silva",
    sender_email: "maria@example.com",
    sender_phone: "+5511999999999",
    singular_name: "Cooperativa Exemplo",
    singular_id: "sing_42",
    content: "Olá, gostaria de saber o saldo",
    vendedor_user_id: "user_1",
    created_at: "2026-08-04T12:00:00-03:00",
  };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — payload mínimo válido (message_id + content)", () => {
  const payload = { message_id: "msg_002", content: "oi" };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: message_id ausente (obrigatório)", () => {
  const result = SicoobBridgeNewMessageSchema.safeParse({ content: "oi" });
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: content ausente (obrigatório)", () => {
  const result = SicoobBridgeNewMessageSchema.safeParse({ message_id: "msg_003" });
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: payload vazio {}", () => {
  const result = SicoobBridgeNewMessageSchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: message_id com tipo errado (number)", () => {
  const payload = { message_id: 12345, content: "oi" };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: content com tipo errado (number)", () => {
  const payload = { message_id: "msg_004", content: 42 };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: sender_name com tipo errado (object)", () => {
  const payload = { message_id: "msg_005", content: "oi", sender_name: { first: "Maria" } };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: message_id acima do limite (200 chars)", () => {
  const payload = { message_id: "x".repeat(201), content: "oi" };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — inválido: content acima do limite (10k chars)", () => {
  const payload = { message_id: "msg_006", content: "x".repeat(10001) };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — null é rejeitado", () => {
  const result = SicoobBridgeNewMessageSchema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — undefined é rejeitado", () => {
  const result = SicoobBridgeNewMessageSchema.safeParse(undefined);
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (new_message) — campos extras são ignorados (strip)", () => {
  // Nota: index.ts lê parsed.data.sender_id, mas sender_id NÃO está no schema —
  // é strippado pelo Zod e o endpoint cai no fallback `message_id`. Contrato
  // atual: sender_id não faz parte do contrato validado.
  const payload = { message_id: "msg_007", content: "oi", sender_id: "sicoob_99", action: "new_message" };
  const result = SicoobBridgeNewMessageSchema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge v1 (mark_read) — payload válido", () => {
  const payload = { external_ids: ["msg_001", "msg_002"] };
  const result = SicoobBridgeMarkReadSchema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge v1 (mark_read) — array vazio é aceito (sem min(1))", () => {
  // Comportamento REAL do schema: z.array().max(1000) sem .min(1) — o update
  // com IN () vazio não atualiza nada e responde success com count 0.
  const result = SicoobBridgeMarkReadSchema.safeParse({ external_ids: [] });
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge v1 (mark_read) — inválido: external_ids ausente", () => {
  const result = SicoobBridgeMarkReadSchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (mark_read) — inválido: external_ids com tipo errado (string)", () => {
  const result = SicoobBridgeMarkReadSchema.safeParse({ external_ids: "msg_001" });
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge v1 (mark_read) — inválido: external_ids acima do limite (1000)", () => {
  const payload = { external_ids: Array.from({ length: 1001 }, (_, i) => `msg_${i}`) };
  const result = SicoobBridgeMarkReadSchema.safeParse(payload);
  assertEquals(result.success, false);
});

// ─── Versionamento v1/v2 (contrato sicoob-bridge) ────────────────────────────

Deno.test("Versioning: payload V1 aceito quando V2 é current (auto-detecção v1)", () => {
  const v1Payload = { action: "new_message", message_id: "m1", content: "olá" };
  const result = parseOrReject("sicoob-bridge", CONTRACT_SCHEMAS["sicoob-bridge"], null, v1Payload);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: payload V2 (version 2.0) preferido quando V2 é current", () => {
  const v2Payload = { action: "new_message", message_id: "m1", content: "olá", version: "2.0", timestamp: Date.now() };
  const result = parseOrReject("sicoob-bridge", CONTRACT_SCHEMAS["sicoob-bridge"], null, v2Payload);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v2");
});

Deno.test("Versioning: x-contract-version header força v1", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject(
    "sicoob-bridge",
    CONTRACT_SCHEMAS["sicoob-bridge"],
    req,
    { action: "mark_read", external_ids: ["x"] },
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: versão não suportada → 422 unsupported_contract_version", () => {
  const headers = new Headers({ "x-contract-version": "v99" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("sicoob-bridge", CONTRACT_SCHEMAS["sicoob-bridge"], req, { action: "mark_read", external_ids: ["x"] });
  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.body.code, "unsupported_contract_version");
    assertEquals(result.response.status, 422);
  }
});

Deno.test("Versioning: v1 deprecated → headers x-contract-deprecated + sunset", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("sicoob-bridge", CONTRACT_SCHEMAS["sicoob-bridge"], req, { action: "new_message", message_id: "m1", content: "c" });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.deprecated, true);
    assertEquals(result.headers["x-contract-deprecated"], "true");
    assertEquals(result.headers["sunset"], "2027-06-01");
  }
});

Deno.test("Versioning: V2 schema exige timestamp (ausente → contract_violation)", () => {
  const bad = { action: "mark_read", external_ids: ["x"], version: "2.0" };
  const result = SicoobBridgeV2Schema.safeParse(bad);
  assertEquals(result.success, false);
});

Deno.test("Versioning: V2 schema com timestamp inválido (negativo) → rejeitado", () => {
  const bad = { action: "mark_read", external_ids: ["x"], version: "2.0", timestamp: -1 };
  const result = SicoobBridgeV2Schema.safeParse(bad);
  assertEquals(result.success, false);
});
