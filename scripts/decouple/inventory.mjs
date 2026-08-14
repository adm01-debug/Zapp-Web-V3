#!/usr/bin/env node
// scripts/decouple/inventory.mjs
// Conta bypasses de acoplamento vs baseline (E5 do Plano 100 Etapas)
// Uso: node scripts/decouple/inventory.mjs
//
// Métricas (redefinidas 2026-08-13 — corrige detecção falsa-zero):
//   1. frontEvoBypass:  arquivos front chamando invoke('evolution-api', …) FORA de whatsappAdapter.ts
//   2. backendUrlBypass: edge fns lendo Deno.env.get('EVOLUTION_API_URL') fora do gateway
//   3. frontEvoWrites:  arquivos front fazendo .from('evolution_*').insert/update/delete direto
//      (leituras via PostgREST são arquiteturalmente legítimas — não contamos)
//
// Metas: 1→0, 2→0 (já), 3→0

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = new URL('../..', import.meta.url).pathname;

const BASELINE = {
  frontEvoBypass:   9,  // arquivos front que invocam 'evolution-api' diretamente (ex-whatsappAdapter)
  backendUrlBypass: 0,  // edge fns lendo EVOLUTION_API_URL direto (zerado em F5)
  frontEvoWrites:   6,  // arquivos front com .from('evolution_*').insert/update/delete direto
};

function walk(dir, exts, results = []) {
  for (const f of readdirSync(dir)) {
    if (f.startsWith('.') || f === 'node_modules' || f === '.git') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, exts, results);
    else if (exts.includes(extname(f))) results.push(p);
  }
  return results;
}

const tsFiles = walk(join(ROOT, 'src'), ['.ts', '.tsx']);
const edgeFns = walk(join(ROOT, 'supabase/functions'), ['.ts']);

let frontEvoBypass = 0, backendUrlBypass = 0, frontEvoWrites = 0;

// Regex detecta invoke('evolution-api', com qualquer argumento seguinte
const RE_INVOKE_EVO = /invoke\(['"]evolution-api['"]/;
// Regex detecta .from('evolution_ALGO').método-de-escrita
const RE_EVO_WRITE  = /\.from\(['"]evolution_[^'"]+['"]\)\s*\n?[^;]*(\.insert|\.update|\.delete|\.upsert)/;

for (const f of tsFiles) {
  if (f.includes('__tests__') || f.includes('.test.ts') || f.includes('.test.tsx')) continue;
  // Métrica 1: invoke direto — excluir o próprio adapter (ele invoca por design)
  const isAdapter = f.endsWith('whatsappAdapter.ts') || f.endsWith('sendFunctionRouter.ts');
  const src = readFileSync(f, 'utf8');
  // Excluir arquivos onde a única ocorrência é em comment/docstring (ex: withRequestId.ts)
  const codeLines = src.split('\n').filter(l => { const t=l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); }).join('\n');
  if (!isAdapter && RE_INVOKE_EVO.test(codeLines)) frontEvoBypass++;
  // Métrica 3: writes diretos em tabelas evolution_*
  if (!isAdapter && RE_EVO_WRITE.test(codeLines)) frontEvoWrites++;
}

for (const f of edgeFns) {
  if (f.includes('__tests__') || f.includes('.test.ts')
      || f.includes('evolution-api-proxy') || f.includes('providers/evolution')) continue;
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  const code = lines.join('\n');
  if (code.match(/Deno\.env\.get\(['"]EVOLUTION_API_URL['"]/)) backendUrlBypass++;
}

const passEmoji = (n, b) => n === 0 ? '✅' : n < b ? '🔶' : '🔴';

console.log('════ INVENTORY — Acoplamento Evolution ════');
console.log(`front invoke bypass:  ${frontEvoBypass}  ${passEmoji(frontEvoBypass, BASELINE.frontEvoBypass)} (baseline: ${BASELINE.frontEvoBypass}, delta: ${frontEvoBypass - BASELINE.frontEvoBypass})`);
console.log(`backend URL bypass:   ${backendUrlBypass}  ${passEmoji(backendUrlBypass, BASELINE.backendUrlBypass)} (baseline: ${BASELINE.backendUrlBypass}, delta: ${backendUrlBypass - BASELINE.backendUrlBypass})`);
console.log(`front evo writes:     ${frontEvoWrites}  ${passEmoji(frontEvoWrites, BASELINE.frontEvoWrites)} (baseline: ${BASELINE.frontEvoWrites}, delta: ${frontEvoWrites - BASELINE.frontEvoWrites})`);
console.log('═══════════════════════════════════════════');
const total = frontEvoBypass + backendUrlBypass + frontEvoWrites;
const btotal = BASELINE.frontEvoBypass + BASELINE.backendUrlBypass + BASELINE.frontEvoWrites;
console.log(`TOTAL: ${total} (baseline: ${btotal}, delta: ${total - btotal})`);
console.log('Meta: TOTAL → 0 (desacoplamento completo)');
