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

import { assertEquals, assert } from "jsr:@std/assert";
import { z } from "https://esm.sh/zod@3.23.8";
import { fromFileUrl } from "https://deno.land/std@0.168.0/path/mod.ts";
import { CONTRACTS, isDeprecatedVersion } from "../contract-versions.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import { EdgeFunctionContractSchemas } from "../edge-contract-schemas.ts";

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

// ─── Invariante 7: NENHUM CONTRACT_SCHEMAS['x'] referenciado em index.ts pode
//     apontar para chave ausente (incidente P0 2026-08-04: ai-churn-analysis e
//     classify-emoji chamavam o gate com chave undefined → TypeError → 502/500).

const EDGE_ROOT = new URL("../../", import.meta.url);

function stripComments(src: string): string {
  // Remove comentários // e /* */ para o regex não casar texto morto
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/[^\n]*/g, "$1");
}

function walkDir(dir: URL): string[] {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const p = new URL(entry.name + "/", dir);
    if (entry.isDirectory) {
      out.push(...walkDir(p));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(fromFileUrl(new URL(entry.name, dir)));
    }
  }
  return out;
}

Deno.test("Registry Integrity: toda referência CONTRACT_SCHEMAS['x'] no código existe no registro", () => {
  const registered = new Set(Object.keys(CONTRACT_SCHEMAS));
  const missing = new Set<string>();
  let checked = 0;

  for (const filePath of walkDir(EDGE_ROOT)) {
    const src = stripComments(Deno.readTextFileSync(filePath));
    const refs = src.matchAll(/CONTRACT_SCHEMAS\s*\[\s*['"]([a-z0-9-]+)['"]\s*\]/g);
    for (const m of refs) {
      checked++;
      if (!registered.has(m[1])) missing.add(`${m[1]} (${filePath.split(/[\\/]/).slice(-3).join("/")})`);
    }
  }

  assertEquals(
    [...missing].sort(),
    [],
    `Referências a contratos NÃO registrados em CONTRACT_SCHEMAS (${checked} refs verificadas):\n` +
    `Cada contrato usado no gate precisa de entrada em CONTRACT_SCHEMAS (contract-schemas.ts) ` +
    `e CONTRACTS (contract-versions.ts).`
  );
  assert(checked > 0, "nenhuma referência CONTRACT_SCHEMAS encontrada — verificar scanner");
});

// ─── Invariante 8 (causa-raiz do P0): os DOIS registros devem estar sincronizados.
//     EdgeFunctionContractSchemas (edge-contract-schemas.ts) é o registro
//     "oficial" de funções; CONTRACT_SCHEMAS é o que o gate lê em RUNTIME.
//     Drift entre eles = a mesma classe de incidente (função quebrada em prod).

Deno.test("Registry Integrity: EdgeFunctionContractSchemas ⊆ CONTRACT_SCHEMAS (sem drift)", () => {
  const edgeNames = new Set(Object.keys(EdgeFunctionContractSchemas));
  const schemaNames = new Set(Object.keys(CONTRACT_SCHEMAS));
  const drift = [...edgeNames].filter((n) => !schemaNames.has(n)).sort();
  assertEquals(
    drift,
    [],
    `Drift de registro: ${drift.length} funções em EdgeFunctionContractSchemas sem entrada em CONTRACT_SCHEMAS ` +
    `(o gate lê CONTRACT_SCHEMAS em runtime — função registrada só no edge registry quebra em produção com 422).`
  );
  assert(edgeNames.size > 0, "EdgeFunctionContractSchemas vazio — verificar scanner");
});

// ─── Invariante 9 (anti-placeholder): nenhum schema registrado pode aceitar
//     QUALQUER payload ({}) e {__x:1} ao mesmo tempo, salvo allowlist explícita.
//     Placeholders `z.object({}).passthrough()` dão falsa cobertura (gap do PR #774).

const PLACEHOLDER_ALLOWLIST = new Set([
  // GET/sem body legítimos (contrato por query param, nunca derrubam ingestão)
  "email-track-link", "email-track-pixel",
  "webhook-secret-status", "whatsapp-cloud-secrets-status",
  "whatsapp-cloud-webhook-verify",
  // warroom-monthly-test: POST-only com payload de saída FIXO — body IGNORADO
  // por design (self-contained, sem gate no handler). Registro permissivo.
  "warroom-monthly-test",
  // Hook interno do Supabase Auth — schema permissivo por design (evento Auth
  // varia por versão do GoTrue); sem diretório de função (invocado via Auth,
  // não via gateway). Reintroduzido pelo PR #782 — restaurado na allowlist
  // 2026-08-04 (fix CI follow-up #787).
  "auth-email-hook",
]);

Deno.test("Registry Integrity: nenhum schema placeholder (z.object vazio) fora da allowlist", async () => {
  const violations: string[] = [];
  for (const [name, versions] of Object.entries(CONTRACT_SCHEMAS)) {
    if (PLACEHOLDER_ALLOWLIST.has(name)) continue;
    for (const [version, schema] of Object.entries(versions)) {
      if (!schema) continue; // versão sem schema — coberto pela Invariante 4
      // Placeholder REAL = z.object vazio PERMISSIVO: shape vazio E aceita
      // payload arbitrário. EmptyStrict (z.object({}).strict()) também tem
      // shape vazio mas REJEITA {__x:1} — é legítimo (GET/cron sem body).
      const shape = (schema as z.ZodObject<any>).shape;
      if (shape && Object.keys(shape).length === 0) {
        const acceptsExtra = schema.safeParse({ __x: 1 }).success;
        if (acceptsExtra) {
          violations.push(`${name}@${version}: z.object vazio PERMISSIVO — placeholder sem validação real`);
        }
      }
    }
  }
  assertEquals(violations, [], `Placeholders em CONTRACT_SCHEMAS (${violations.length}):\n` + violations.join("\n"));
});
