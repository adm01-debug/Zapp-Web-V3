#!/usr/bin/env node
/**
 * check-e2e-spec-coverage.mjs — E02/F10-02
 *
 * Compara os specs versionados em `e2e/` com os specs efetivamente alcançados
 * por algum workflow do CI. Um spec é considerado coberto se:
 *   a) é citado nominalmente em algum `.github/workflows/*.yml`; OU
 *   b) é alcançado por um workflow que roda a suíte inteira sem filtro
 *      (hoje: `e2e-nightly-full.yml`, via `test:e2e:full`); OU
 *   c) casa com o testMatch do gate de a11y (`*-accessibility`,
 *      `*-keyboard-navigation`).
 *
 * Saída: lista de órfãos + exit 1 se houver algum.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const E2E_DIR = 'e2e';
const WF_DIR = '.github/workflows';

const specs = readdirSync(E2E_DIR).filter((f) => f.endsWith('.spec.ts'));

const workflows = readdirSync(WF_DIR).filter((f) => f.endsWith('.yml'));
const wfText = workflows
  .map((f) => readFileSync(join(WF_DIR, f), 'utf8'))
  .join('\n');

const runsFullSuite =
  existsSync(join(WF_DIR, 'e2e-nightly-full.yml')) &&
  /test:e2e:full/.test(readFileSync(join(WF_DIR, 'e2e-nightly-full.yml'), 'utf8'));

const a11yPattern = /-(accessibility|keyboard-navigation)\.spec\.ts$/;

const orphans = specs.filter((spec) => {
  if (runsFullSuite) return false;
  if (a11yPattern.test(spec)) return false;
  return !wfText.includes(spec);
});

console.log(`specs em ${E2E_DIR}/: ${specs.length}`);
console.log(`suíte completa agendada: ${runsFullSuite ? 'sim (e2e-nightly-full.yml)' : 'NÃO'}`);
console.log(`specs órfãos: ${orphans.length}`);

if (orphans.length > 0) {
  for (const o of orphans) console.log(`  - ${o}`);
  console.error('\n🚨 Há specs em e2e/ que nenhum workflow executa.');
  process.exit(1);
}
console.log('\n✅ Nenhum spec órfão.');
