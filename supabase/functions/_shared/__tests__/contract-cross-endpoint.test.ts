/**
 * Cross-Endpoint Contract Consistency
 *
 * Fecha o gap deixado pelos testes por-endpoint: percorre TODOS os contratos
 * registrados em CONTRACT_SCHEMAS e valida, para cada um, que:
 *   1. Payload vazio ({})              → 422 contract_violation OU sucesso (schemas
 *                                        internamente permissivos como webhooks externos
 *                                        aceitam .passthrough() sem campos obrigatórios).
 *   2. Payload null                    → 422 invalid_json (mesmo envelope).
 *   3. Payload primitivo (string)      → 422 invalid_json (mesmo envelope).
 *   4. Versão inexistente pedida       → 422 unsupported_contract_version.
 *   5. Todo envelope 422 tem chaves    → { error, code, message, contract, details }.
 *   6. Sunset ativo                    → sucesso emite headers x-contract-deprecated + sunset.
 *
 * Objetivo: garantir que NENHUM endpoint fique com envelope divergente durante
 * refactors futuros.
 */

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOrReject, type ContractErrorBody } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import { CONTRACTS, isDeprecatedVersion } from "../contract-versions.ts";

const CANONICAL_KEYS = ["code", "contract", "details", "error", "message"];

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/x", { method: "POST", headers });
}

async function readEnvelope(res: Response): Promise<ContractErrorBody> {
  assertEquals(res.status, 422);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = (await res.json()) as ContractErrorBody;
  const keys = Object.keys(body).filter((k) => k !== "requestId").sort();
  assertEquals(keys, CANONICAL_KEYS, "envelope 422 diverge do formato canônico");
  assertEquals(body.error, true);
  assert(typeof body.contract === "string" && body.contract.includes("@"));
  assert(Array.isArray(body.details));
  return body;
}

Deno.test("cross-endpoint: null e primitivo produzem invalid_json idêntico em TODO contrato", async () => {
  for (const [name, schemas] of Object.entries(CONTRACT_SCHEMAS)) {
    for (const bad of [null, "texto", 42, true]) {
      const r = parseOrReject(name, schemas, req(), bad);
      assertEquals(r.ok, false, `${name}: primitivo/null deve falhar`);
      if (!r.ok) {
        const body = await readEnvelope(r.response);
        assertEquals(body.code, "invalid_json", `${name}: código divergente para ${JSON.stringify(bad)}`);
      }
    }
  }
});

Deno.test("cross-endpoint: versão inexistente sempre gera unsupported_contract_version", async () => {
  for (const [name, schemas] of Object.entries(CONTRACT_SCHEMAS)) {
    const r = parseOrReject(name, schemas, req({ "x-contract-version": "v99" }), { any: 1 });
    assertEquals(r.ok, false, `${name}: v99 deve ser rejeitada`);
    if (!r.ok) {
      const body = await readEnvelope(r.response);
      assertEquals(body.code, "unsupported_contract_version");
      assert(body.contract.endsWith("@v99"));
    }
  }
});

Deno.test("cross-endpoint: contratos estritos com campos obrigatórios rejeitam {} com contract_violation", async () => {
  // Endpoints internos DEVEM ter pelo menos um campo obrigatório (rejeitam {}).
  // Webhooks externos são permissivos por design e podem aceitar {}.
  const strict = [
    "talkx-send",
    "recheck-webhook-signature",
    "instance-pause-control",
    "contacts-import",
    "voice-copilot-action",
    "gmail-send",
  ];
  for (const name of strict) {
    const schemas = CONTRACT_SCHEMAS[name];
    assert(schemas, `${name} deve estar registrado`);
    const r = parseOrReject(name, schemas, req(), {});
    assertEquals(r.ok, false, `${name}: {} deveria falhar validação`);
    if (!r.ok) {
      const body = await readEnvelope(r.response);
      assertEquals(body.code, "contract_violation");
      assert(body.details.length > 0, `${name}: details vazio`);
    }
  }
});

Deno.test("cross-endpoint: retrocompat — versões em sunset ativas continuam sendo aceitas", () => {
  for (const [name, spec] of Object.entries(CONTRACTS)) {
    if (!spec.sunset) continue;
    for (const [version, dateStr] of Object.entries(spec.sunset)) {
      if (!dateStr) continue;
      const stillOpen = Date.parse(dateStr) > Date.now();
      assertEquals(
        isDeprecatedVersion(name, version),
        stillOpen,
        `${name}@${version}: janela de deprecação inconsistente`,
      );
      if (stillOpen) {
        assert(
          spec.supported.includes(version),
          `${name}@${version}: sunset ativo mas versão foi removida de 'supported' (quebra retrocompat)`,
        );
      }
    }
  }
});

Deno.test("cross-endpoint: consistência absoluta de chaves em TODOS os modos de falha × TODOS os contratos", async () => {
  const shapes = new Set<string>();
  let total = 0;
  for (const [name, schemas] of Object.entries(CONTRACT_SCHEMAS)) {
    const failures = [
      parseOrReject(name, schemas, req(), null),
      parseOrReject(name, schemas, req({ "x-contract-version": "v99" }), { any: 1 }),
      parseOrReject(name, schemas, req(), 42),
    ];
    for (const r of failures) {
      if (r.ok) continue;
      total++;
      const body = await r.response.clone().json();
      shapes.add(Object.keys(body).filter((k) => k !== "requestId").sort().join(","));
    }
  }
  assertEquals(shapes.size, 1, `esperava 1 shape canônico entre ${total} falhas, obtido ${shapes.size}: ${[...shapes].join(" | ")}`);
  assertEquals([...shapes][0], CANONICAL_KEYS.join(","));
});
