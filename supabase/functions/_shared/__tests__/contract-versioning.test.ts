/**
 * Testes de compatibilidade retroativa do versionamento V1/V2 de webhooks.
 *
 * Cobre o contrato público do `parseOrReject` (contract-kit.ts) para o caso
 * em que V2 é a versão current e V1 está em janela de sunset:
 *   1. Payload V1 (sem campo `version`) continua aceito → auto-detecção V1.
 *   2. Payload V2 (com `version: "2.0"`) é preferido quando V2 é current.
 *   3. Header `x-contract-version` força a versão explicitamente.
 *   4. Versão não suportada → 422 unsupported_contract_version.
 *   5. Versão deprecated → headers `x-contract-deprecated: true` + `sunset`.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-versioning.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOrReject } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";

Deno.test("Versioning: V1 payload aceito quando V2 é current", () => {
  const v1Payload = { event: "messages.upsert", instance: "inst_1", data: { id: "1" } };
  const result = parseOrReject("evolution-webhook", CONTRACT_SCHEMAS["evolution-webhook"], null, v1Payload);
  assertEquals(result.ok, true);
  if (result.ok) {
    // Auto-detectou V1 (retrocompat)
    assertEquals(result.version, "v1");
  }
});

Deno.test("Versioning: V2 payload preferido quando V2 é current", () => {
  const v2Payload = { version: "2.0", event: "messages.upsert", instance: "inst_1", timestamp: Date.now(), data: { id: "1" } };
  const result = parseOrReject("evolution-webhook", CONTRACT_SCHEMAS["evolution-webhook"], null, v2Payload);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.version, "v2");
  }
});

Deno.test("Versioning: x-contract-version header força versão", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const v1Payload = { event: "test", instance: "i1" };
  const result = parseOrReject("evolution-webhook", CONTRACT_SCHEMAS["evolution-webhook"], req, v1Payload);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: versão não suportada → 422", () => {
  const headers = new Headers({ "x-contract-version": "v99" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("evolution-webhook", CONTRACT_SCHEMAS["evolution-webhook"], req, { event: "t" });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.body.code, "unsupported_contract_version");
    assertEquals(result.response.status, 422);
  }
});

Deno.test("Versioning: sunset header presente para versão deprecated", () => {
  // Evolution V1 tem sunset: "2027-01-01" (ainda no futuro → deprecated=true)
  const v1Payload = { event: "test", instance: "i1" };
  const result = parseOrReject("evolution-webhook", CONTRACT_SCHEMAS["evolution-webhook"], null, v1Payload);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.deprecated, true);
    assertEquals(result.headers["x-contract-deprecated"], "true");
    assertExists(result.headers["sunset"]);
  }
});
