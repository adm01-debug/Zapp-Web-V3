#!/usr/bin/env node
/**
 * CI gate: falha o build quando o número de arquivos com `// @ts-nocheck`
 * ultrapassa o baseline OU quando arquivos novos (não listados no baseline)
 * são introduzidos.
 *
 * Uso:
 *   node scripts/check-ts-nocheck.mjs              # falha se drift
 *   node scripts/check-ts-nocheck.mjs --update     # regrava baseline
 *   node scripts/check-ts-nocheck.mjs --max=120    # override do teto
 *
 * Baseline: scripts/ts-nocheck-baseline.txt (uma linha por arquivo, ordenado).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, relative } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const BASELINE = resolve(ROOT, 'scripts/ts-nocheck-baseline.txt');

const args = new Set(process.argv.slice(2));
const UPDATE = args.has('--update');
const MAX_ARG = [...args].find((a) => a.startsWith('--max='));
const MAX = MAX_ARG ? parseInt(MAX_ARG.split('=')[1], 10) : null;

function listCurrent() {
  const out = execSync(
    `grep -rl "@ts-nocheck" src supabase 2>/dev/null | sort || true`,
    { cwd: ROOT, encoding: 'utf8' }
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

const current = listCurrent();

if (UPDATE) {
  writeFileSync(BASELINE, current.join('\n') + '\n');
  console.log(`✅ Baseline atualizado: ${current.length} arquivo(s).`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error(`❌ Baseline ausente em ${relative(ROOT, BASELINE)}.`);
  console.error(`   Rode: node scripts/check-ts-nocheck.mjs --update`);
  process.exit(1);
}

const baseline = new Set(
  readFileSync(BASELINE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
);

const added = current.filter((f) => !baseline.has(f));
const removed = [...baseline].filter((f) => !current.includes(f));

console.log(`ℹ️  Baseline: ${baseline.size} arquivo(s)`);
console.log(`ℹ️  Atual:    ${current.length} arquivo(s)`);
if (removed.length) {
  console.log(`\n🎉 Removidos ${removed.length} (progresso!):`);
  for (const f of removed) console.log(`   - ${f}`);
  console.log(`\n   Regrave o baseline: node scripts/check-ts-nocheck.mjs --update`);
}

let failed = false;

if (added.length) {
  console.error(`\n❌ ${added.length} arquivo(s) novo(s) com \`// @ts-nocheck\`:`);
  for (const f of added) console.error(`   + ${f}`);
  console.error(
    `\n   Corrija os tipos ou (em último caso) atualize o baseline:`
  );
  console.error(`   node scripts/check-ts-nocheck.mjs --update`);
  failed = true;
}

if (MAX !== null && current.length > MAX) {
  console.error(
    `\n❌ Limite excedido: ${current.length} > --max=${MAX}`
  );
  failed = true;
}

if (removed.length && !added.length && !failed) {
  console.error(
    `\n⚠️  Baseline desatualizado (arquivos removidos). Rode com --update e commit.`
  );
  process.exit(1);
}

process.exit(failed ? 1 : 0);
