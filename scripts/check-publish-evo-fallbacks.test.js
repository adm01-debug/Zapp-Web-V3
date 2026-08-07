#!/usr/bin/env node
/**
 * Regression test (E46) — fix(ci) publish-evolution-api-custom:
 * valida que os fallbacks de EVO_REF/BASE_IMAGE existem e que NENHUMA
 * referência a inputs.evolution_ref/inputs.base_image ficou sem fallback.
 * Falha se alguém remover os fallbacks (o bug de push-triggered volta).
 * Uso: node scripts/check-publish-evo-fallbacks.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WF = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".github/workflows/publish-evolution-api-custom.yml",
);

const src = readFileSync(WF, "utf8");
const failures = [];

// 1. Env com fallbacks presentes
if (!/EVO_REF: \$\{\{ inputs\.evolution_ref \|\| '2\.3\.7' \}\}/.test(src)) {
  failures.push("env.EVO_REF com fallback '2.3.7' ausente");
}
if (!/BASE_IMAGE: \$\{\{ inputs\.base_image \|\| 'evoapicloud\/evolution-api@sha256:/.test(src)) {
  failures.push("env.BASE_IMAGE com fallback de digest ausente");
}

// 2. Nenhuma referência crua (sem fallback) aos inputs
const bareRefs = src.match(/inputs\.(evolution_ref|base_image)(?!\s*\|\|)/g) || [];
if (bareRefs.length > 0) {
  failures.push(`referências sem fallback: ${bareRefs.join(", ")}`);
}

// 3. As 4 referências corrigidas usam env.*
for (const needle of [
  "git clone --depth 1 --branch ${{ env.EVO_REF }}",
  'docker pull "${{ env.BASE_IMAGE }}"',
  'docker image inspect "${{ env.BASE_IMAGE }}"',
  "BASE_IMAGE=${{ env.BASE_IMAGE }}",
]) {
  if (!src.includes(needle)) {
    failures.push(`referência esperada ausente: ${needle.slice(0, 60)}...`);
  }
}

if (failures.length > 0) {
  console.error("FAIL: fallbacks do publish evolution-api-custom quebrados:");
  for (const f of failures) console.error("  -", f);
  process.exit(1);
}
console.log("PASS: fallbacks EVO_REF/BASE_IMAGE presentes e sem refs cruas");
