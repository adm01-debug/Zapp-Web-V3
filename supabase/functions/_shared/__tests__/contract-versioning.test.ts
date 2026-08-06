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

import { assertEquals, assertExists } from "jsr:@std/assert";
import { parseOrReject } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import { CONTRACTS, isDeprecatedVersion } from "../contract-versions.ts";

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

// ─── Retrocompatibilidade V1/V2 dos 4 webhooks externos (zapp-web-v3) ───────
//
// Para CADA contrato com current=v2 e v1 em janela de sunset (evolution-webhook,
// whatsapp-cloud-webhook, gmail-webhook, elevenlabs-webhook) cobre-se:
//   1. Payload V2 + header `x-contract-version: v2` → ok, resposta com
//      `x-contract-version: v2`.
//   2. Payload V1 + header `x-contract-version: v1` → ok, mas resposta com
//      `x-contract-deprecated: true` + header `sunset` (deprecação ativa).
//   3. Versão inexistente (`x-contract-version: v9`) → 422
//      `unsupported_contract_version` com envelope canônico.
//   4. Auto-detecção: payload V2 sem header → ok, resolve para v2.

const WEBHOOK_FIXTURES = [
  {
    name: "evolution-webhook",
    v2: {
      version: "2.0",
      event: "messages.upsert",
      instance: "inst_1",
      timestamp: Date.now(),
      data: { id: "1" },
    },
    v1: { event: "messages.upsert", instance: "inst_1", data: { id: "1" } },
  },
  {
    name: "whatsapp-cloud-webhook",
    v2: {
      version: "2.0",
      timestamp: Date.now(),
      delivery_attempt: 1,
      object: "whatsapp_business_account",
      entry: [{
        id: "entry_1",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5511999999999", phone_number_id: "123456789" },
            messages: [{ id: "wamid.1" }],
          },
        }],
      }],
    },
    v1: {
      object: "whatsapp_business_account",
      entry: [{
        id: "entry_1",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5511999999999", phone_number_id: "123456789" },
            messages: [{ id: "wamid.1" }],
          },
        }],
      }],
    },
  },
  {
    name: "gmail-webhook",
    v2: {
      version: "2.0",
      timestamp: Date.now(),
      action: "process",
      accountId: "acc_1",
      message: {
        data: "eyJmb28iOiJiYXIifQ==",
        messageId: "m_1",
        publishTime: "2026-08-04T00:00:00.000Z",
      },
    },
    v1: {
      action: "process",
      accountId: "acc_1",
      message: {
        data: "eyJmb28iOiJiYXIifQ==",
        messageId: "m_1",
        publishTime: "2026-08-04T00:00:00.000Z",
      },
    },
  },
  {
    name: "elevenlabs-webhook",
    v2: { version: "2.0", timestamp: Date.now(), type: "voice.conversion.done", id: "req_1" },
    v1: { type: "voice.conversion.done", id: "req_1" },
  },
];

for (const { name, v2, v1 } of WEBHOOK_FIXTURES) {
  const sunsetV1 = CONTRACTS[name].sunset?.["v1"];

  Deno.test(`Versioning ${name}: payload V2 com header v2 → ok com x-contract-version: v2`, () => {
    const req = new Request("http://localhost", { headers: { "x-contract-version": "v2" } });
    const result = parseOrReject(name, CONTRACT_SCHEMAS[name], req, v2, { extraHeaders: {} });
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.version, "v2");
      assertEquals(result.headers["x-contract-version"], "v2");
      assertEquals(result.deprecated, false);
      assertEquals(result.headers["x-contract-deprecated"], undefined);
    }
  });

  Deno.test(`Versioning ${name}: payload V1 com header v1 → ok com sunset ativo`, () => {
    const req = new Request("http://localhost", { headers: { "x-contract-version": "v1" } });
    const result = parseOrReject(name, CONTRACT_SCHEMAS[name], req, v1, { extraHeaders: {} });
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.version, "v1");
      // Data-bomba guard (validação Claude B3): NUNCA assertar `true` literal —
      // viraria false quando o sunset passar. Comparar com isDeprecatedVersion.
      assertEquals(result.deprecated, isDeprecatedVersion(name, "v1"));
      assertEquals(result.headers["x-contract-deprecated"], isDeprecatedVersion(name, "v1") ? "true" : undefined);
      if (isDeprecatedVersion(name, "v1")) {
        assertEquals(result.headers["sunset"], sunsetV1);
      }
    }
  });

  Deno.test(`Versioning ${name}: x-contract-version: v9 → 422 unsupported_contract_version canônico`, () => {
    const req = new Request("http://localhost", { headers: { "x-contract-version": "v9" } });
    const result = parseOrReject(name, CONTRACT_SCHEMAS[name], req, v2, { extraHeaders: {} });
    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.response.status, 422);
      assertEquals(result.body.code, "unsupported_contract_version");
      assertEquals(result.body.error, true);
      assertEquals(result.body.contract, `${name}@v9`);
      assertEquals(result.body.details.length, 1);
      assertEquals(result.body.details[0].path, "version");
      assertEquals(result.body.details[0].message, "use uma de: v1, v2");
    }
  });

  Deno.test(`Versioning ${name}: auto-detecção de payload V2 sem header → v2`, () => {
    const result = parseOrReject(name, CONTRACT_SCHEMAS[name], null, v2, { extraHeaders: {} });
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals(result.version, "v2");
      assertEquals(result.headers["x-contract-version"], "v2");
    }
  });
}
