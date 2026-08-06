/**
 * Contract Matrix — teste universal para TODOS os contratos registrados.
 *
 * Aplica os casos T3 (body ausente), T4 (não-JSON), T8 (versão não suportada)
 * e T15 (CORS headers no 422) a CADA contrato em CONTRACT_SCHEMAS.
 *
 * Um arquivo, cobertura universal — contrato novo ganha teste de graça.
 * Roda em CI: deno test --allow-all _shared/__tests__/contract-matrix.test.ts
 */

import { assert, assertEquals, assertExists } from "jsr:@std/assert";
import { parseOrReject } from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import { CONTRACTS } from "../contract-versions.ts";

const ALL_CONTRACTS = Object.keys(CONTRACT_SCHEMAS);
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-contract-version",
};

// ─── T3: Body ausente (null) → invalid_json ────────────────────────────────

for (const contractName of ALL_CONTRACTS) {
  Deno.test(`Contract Matrix [T3]: ${contractName} — body ausente → 422 invalid_json`, () => {
    const result = parseOrReject(
      contractName,
      CONTRACT_SCHEMAS[contractName],
      null,
      null, // body ausente
      { extraHeaders: CORS_HEADERS }
    );

    assertEquals(result.ok, false, `${contractName}: esperado ok=false para body null`);
    if (!result.ok) {
      assertEquals(result.response.status, 422);
      assertEquals(result.body.error, true);
      assertEquals(result.body.code, "invalid_json",
        `${contractName}: esperado code="invalid_json", recebido "${result.body.code}"`);
      assertExists(result.body.contract,
        `${contractName}: contract label ausente`);
      assertExists(result.body.details,
        `${contractName}: details ausente`);
      assertEquals(result.body.details.length > 0, true,
        `${contractName}: details vazio`);
      assertEquals(result.body.details[0].path, "root",
        `${contractName}: esperado path="root"`);
    }
  });
}

// ─── T4: JSON não-objeto (string) → invalid_json ───────────────────────────

for (const contractName of ALL_CONTRACTS) {
  Deno.test(`Contract Matrix [T4]: ${contractName} — string → 422 invalid_json`, () => {
    const result = parseOrReject(
      contractName,
      CONTRACT_SCHEMAS[contractName],
      null,
      "not-an-object",
      { extraHeaders: CORS_HEADERS }
    );

    assertEquals(result.ok, false, `${contractName}: esperado ok=false para string`);
    if (!result.ok) {
      assertEquals(result.response.status, 422);
      assertEquals(result.body.code, "invalid_json");
    }
  });

  Deno.test(`Contract Matrix [T4b]: ${contractName} — number → 422 invalid_json`, () => {
    const result = parseOrReject(
      contractName,
      CONTRACT_SCHEMAS[contractName],
      null,
      42,
      { extraHeaders: CORS_HEADERS }
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      assertEquals(result.response.status, 422);
      assertEquals(result.body.code, "invalid_json");
    }
  });
}

// ─── T8: Versão não suportada → unsupported_contract_version ───────────────

for (const contractName of ALL_CONTRACTS) {
  Deno.test(`Contract Matrix [T8]: ${contractName} — x-contract-version: v99 → 422`, () => {
    const headers = new Headers({ "x-contract-version": "v99" });
    const req = new Request("http://localhost", { headers });

    const result = parseOrReject(
      contractName,
      CONTRACT_SCHEMAS[contractName],
      req,
      { test: true }, // corpo mínimo
      { extraHeaders: CORS_HEADERS }
    );

    assertEquals(result.ok, false, `${contractName}: esperado ok=false para v99`);
    if (!result.ok) {
      assertEquals(result.response.status, 422);
      assertEquals(result.body.code, "unsupported_contract_version",
        `${contractName}: esperado code="unsupported_contract_version", recebido "${result.body.code}"`);
      // details[0].path deve ser "version"
      assertExists(result.body.details[0]);
      assertEquals(result.body.details[0].path, "version");
    }
  });
}

// ─── T15: 422 response contém headers CORS ─────────────────────────────────

for (const contractName of ALL_CONTRACTS) {
  Deno.test(`Contract Matrix [T15]: ${contractName} — 422 contém headers CORS`, () => {
    const result = parseOrReject(
      contractName,
      CONTRACT_SCHEMAS[contractName],
      null,
      null, // body ausente → 422
      { extraHeaders: CORS_HEADERS }
    );

    assertEquals(result.ok, false);
    if (!result.ok) {
      // Content-Type sempre presente
      assertEquals(
        result.response.headers.get("Content-Type"),
        "application/json",
        `${contractName}: Content-Type ausente`
      );

      // CORS headers propagados
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        assertEquals(
          result.response.headers.get(key),
          value,
          `${contractName}: header CORS "${key}" ausente ou incorreto`
        );
      }
    }
  });
}

// ─── Smoke: contratos com schema V1 aceitam payload mínimo vazio ───────────

for (const contractName of ALL_CONTRACTS) {
  const spec = CONTRACTS[contractName];
  if (!spec || !spec.supported.includes("v1")) continue;

  Deno.test(`Contract Matrix [smoke]: ${contractName}@v1 — payload vazio {}`, () => {
    const result = parseOrReject(
      contractName,
      CONTRACT_SCHEMAS[contractName],
      null,
      {},
      { extraHeaders: CORS_HEADERS }
    );

    // {} pode ser aceito (permissivo/nullish) ou rejeitado (strict com required)
    // O importante é que NÃO dê exceção (crash) e que o resultado seja bem-formado
    if (result.ok) {
      assertExists(result.data, `${contractName}: data ausente em ok=true`);
      assertExists(result.version, `${contractName}: version ausente`);
    } else {
      assertEquals(result.response.status, 422);
      assertEquals(result.body.error, true);
      assertExists(result.body.code);
      assertExists(result.body.contract);
    }
  });
}

// ─── Relatório final ────────────────────────────────────────────────────────

Deno.test("Contract Matrix: resumo", () => {
  const total = ALL_CONTRACTS.length;
  const withV2 = ALL_CONTRACTS.filter(n => {
    const spec = CONTRACTS[n];
    return spec && spec.supported.includes("v2");
  }).length;

  console.log(`\n📊 Contract Matrix Summary:`);
  console.log(`   Total contracts tested: ${total}`);
  console.log(`   Contracts with V2 support: ${withV2}`);
  console.log(`   Contracts V1-only: ${total - withV2}`);
  console.log(`   Test cases per contract: 7 (T3, T4, T4b, T8, T15×3, smoke)`);
  console.log(`   Total test cases: ${total * 7 + 1} (including summary)\n`);

  assert(total > 0, "Nenhum contrato registrado em CONTRACT_SCHEMAS!");
});
