/**
 * Contract Registry Integrity Tests
 *
 * Garante que TODO contrato registrado em CONTRACTS (contract-versions.ts)
 * tenha schema correspondente em CONTRACT_SCHEMAS (contract-schemas.ts).
 *
 * Invariantes:
 *  - CONTRACT_SCHEMAS ⊇ CONTRACTS (todo contrato tem pelo menos 1 schema)
 *  - current ∈ supported (versão corrente está nas suportadas)
 *  - sunset keys ⊆ supported (sunset só para versões registradas)
 *  - Nenhum contrato em CONTRACTS sem entrada em CONTRACT_SCHEMAS
 *
 * CI: se este teste falhar, o build DEVE quebrar.
 * Isso fecha o gap onde 43 contratos estavam registrados mas só 14 tinham schema.
 */

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { CONTRACTS, isDeprecatedVersion } from "../contract-versions.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";

// ─── Invariante 1: TODO contrato registrado tem schema ─────────────────────

Deno.test("Registry Integrity: CONTRACT_SCHEMAS cobre todos os CONTRACTS", () => {
  const contractNames = Object.keys(CONTRACTS);
  const schemaNames = Object.keys(CONTRACT_SCHEMAS);

  const missing: string[] = [];
  for (const name of contractNames) {
    if (!schemaNames.includes(name)) {
      missing.push(name);
    }
  }

  assertEquals(
    missing,
    [],
    `Os seguintes contratos em CONTRACTS não têm entrada em CONTRACT_SCHEMAS: ${missing.join(", ")}.\n` +
    `Adicione schemas em contract-schemas.ts e registre em CONTRACT_SCHEMAS.`
  );
});

// ─── Invariante 2: current ∈ supported ─────────────────────────────────────

Deno.test("Registry Integrity: current version está em supported", () => {
  const failures: string[] = [];
  for (const [name, spec] of Object.entries(CONTRACTS)) {
    if (!spec.supported.includes(spec.current)) {
      failures.push(`${name}: current="${spec.current}" ∉ supported=[${spec.supported.join(", ")}]`);
    }
  }
  assertEquals(failures, [], "Contratos com current fora de supported:");
});

// ─── Invariante 3: sunset keys ⊆ supported ─────────────────────────────────

Deno.test("Registry Integrity: sunset versions estão em supported", () => {
  const failures: string[] = [];
  for (const [name, spec] of Object.entries(CONTRACTS)) {
    if (!spec.sunset) continue;
    for (const version of Object.keys(spec.sunset)) {
      if (!spec.supported.includes(version)) {
        failures.push(`${name}: sunset.${version} ∉ supported=[${spec.supported.join(", ")}]`);
      }
    }
  }
  assertEquals(failures, [], "Contratos com sunset fora de supported:");
});

// ─── Invariante 4: todo schema registrado tem pelo menos 1 versão ──────────

Deno.test("Registry Integrity: cada CONTRACT_SCHEMAS tem pelo menos 1 versão", () => {
  const failures: string[] = [];
  for (const [name, versions] of Object.entries(CONTRACT_SCHEMAS)) {
    if (!versions || Object.keys(versions).length === 0) {
      failures.push(`${name}: sem versões registradas`);
    }
  }
  assertEquals(failures, [], "Contratos sem versões em CONTRACT_SCHEMAS:");
});

// ─── Invariante 5: versões em CONTRACT_SCHEMAS ⊆ supported em CONTRACTS ────

Deno.test("Registry Integrity: versões do schema ⊆ supported do contrato", () => {
  const failures: string[] = [];
  for (const [name, schemas] of Object.entries(CONTRACT_SCHEMAS)) {
    const spec = CONTRACTS[name];
    if (!spec) continue; // schema sem contrato — ok, pode ser interno

    for (const version of Object.keys(schemas)) {
      if (!spec.supported.includes(version)) {
        failures.push(
          `${name}: schema tem "${version}" mas supported=[${spec.supported.join(", ")}]`
        );
      }
    }
  }
  assertEquals(
    failures,
    [],
    "Schemas com versões não listadas em supported do contrato:"
  );
});

// ─── Invariante 6: NENHUM contrato com supported=["v1","v2"] usa mesmo schema

Deno.test("Registry Integrity: versionamento fantasma — V1 e V2 não podem apontar para o mesmo schema", () => {
  const failures: string[] = [];
  for (const [name, schemas] of Object.entries(CONTRACT_SCHEMAS)) {
    if (schemas.v1 && schemas.v2 && schemas.v1 === schemas.v2) {
      failures.push(
        `${name}: v1 e v2 apontam para o mesmo schema (versionamento fantasma). ` +
        `Crie um V2 real ou reduza supported para ["v1"].`
      );
    }
  }
  assertEquals(failures, [], "Contratos com versionamento fantasma:");
});

// ─── Smoke: isDeprecatedVersion só retorna true durante sunset ativo ───────

Deno.test("Registry Integrity: isDeprecatedVersion comportamento", () => {
  // evolution-webhook V1 tem sunset: "2027-01-01" → ainda no futuro → deprecated=true
  assert(isDeprecatedVersion("evolution-webhook", "v1"),
    "evolution-webhook@v1 deve estar deprecated (sunset=2027-01-01 ainda no futuro)");

  // evolution-webhook V2 é current → não deprecated
  assertEquals(isDeprecatedVersion("evolution-webhook", "v2"), false,
    "evolution-webhook@v2 é current, não deve estar deprecated");

  // Contrato inexistente
  assertEquals(isDeprecatedVersion("nao-existe", "v1"), false);
});
