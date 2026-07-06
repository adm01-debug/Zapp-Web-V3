#!/usr/bin/env node
/**
 * check-data-layer.mjs — Ratchet de arquitetura da camada de dados (Refactor Wave 1, 2026-07-06)
 *
 * Problema: chamadas diretas `supabase.from(...)` espalhadas em camadas de UI
 * (components/pages) misturam regra de negócio com apresentação e travam a
 * migração para services/hooks por domínio.
 *
 * Estratégia ratchet: o número de chamadas por camada NÃO PODE AUMENTAR.
 * Baseline em scripts/data-layer-baseline.json. Ao reduzir, rode com
 * --update-baseline para travar o novo teto (ratchet aperta, nunca afrouxa).
 *
 * Regra-alvo (Wave 3): componentes e páginas nunca chamam supabase direto —
 * sempre via hooks de domínio ou services.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const BASELINE_PATH = join(ROOT, 'scripts', 'data-layer-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
const LAYERS = ['src/components', 'src/pages', 'src/features', 'src/hooks'];
const CALL_RE = /supabase\s*\.\s*from\s*\(/g;

function countLayer(dir) {
  let count = 0;
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return 0;
  (function walk(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(f) || /\.(test|spec|stories)\./.test(f)) continue;
      if (/__tests__/.test(p)) continue;
      count += (readFileSync(p, 'utf-8').match(CALL_RE) || []).length;
    }
  })(abs);
  return count;
}

const current = Object.fromEntries(LAYERS.map((l) => [l, countLayer(l)]));

if (UPDATE || !existsSync(BASELINE_PATH)) {
  writeFileSync(BASELINE_PATH, JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), calls: current }, null, 2) + '\n');
  console.log('📌 Baseline data-layer gravado:', JSON.stringify(current));
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')).calls;
let failed = false;
for (const layer of LAYERS) {
  const cur = current[layer];
  const max = baseline[layer] ?? 0;
  const status = cur > max ? '❌' : cur < max ? '⬇️ ' : '✅';
  console.log(`${status} ${layer.padEnd(16)} ${cur} chamadas supabase.from() (teto: ${max})`);
  if (cur > max) failed = true;
}
if (failed) {
  console.error('\n❌ check-data-layer: novas chamadas diretas a supabase.from() em camada de UI.');
  console.error('   Mova o acesso a dados para um hook de domínio ou service (@/features/<dominio>/hooks | services/).');
  process.exit(1);
}
const reduced = LAYERS.some((l) => current[l] < (baseline[l] ?? 0));
if (reduced) console.log('\n💡 Reduções detectadas — rode `node scripts/check-data-layer.mjs --update-baseline` para apertar o ratchet.');
console.log('✅ check-data-layer: dentro do teto.');
