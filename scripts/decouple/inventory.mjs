#!/usr/bin/env node
// scripts/decouple/inventory.mjs
// Conta bypasses de acoplamento vs baseline (E5 do Plano 100 Etapas)
// Uso: node scripts/decouple/inventory.mjs

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = new URL('../..', import.meta.url).pathname;

const BASELINE = {
  frontEvoBypass: 10,     // arquivos front chamando invoke('evolution-api') direto
  backendUrlBypass: 17,   // edge fns lendo EVOLUTION_API_URL direto
  frontDirectRead: 24,    // arquivos front lendo evolution_* direto
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

let frontEvoBypass = 0, backendUrlBypass = 0, frontDirectRead = 0;

for (const f of tsFiles) {
  const src = readFileSync(f, 'utf8');
  if (src.includes("invoke('evolution-api')") || src.includes('invoke("evolution-api")')) frontEvoBypass++;
  if (src.match(/from\(['"]evo\./)) frontDirectRead++;
}

for (const f of edgeFns) {
  const src = readFileSync(f, 'utf8');
  if (src.includes('EVOLUTION_API_URL') && !f.includes('evolution-api-proxy') && !f.includes('providers/evolution')) backendUrlBypass++;
}

console.log('════ INVENTORY — Acoplamento Evolution ════');
console.log(`front invoke bypass:   ${frontEvoBypass} (baseline: ${BASELINE.frontEvoBypass}, delta: ${frontEvoBypass - BASELINE.frontEvoBypass})`);
console.log(`backend URL bypass:    ${backendUrlBypass} (baseline: ${BASELINE.backendUrlBypass}, delta: ${backendUrlBypass - BASELINE.backendUrlBypass})`);
console.log(`front direct read evo: ${frontDirectRead} (baseline: ${BASELINE.frontDirectRead}, delta: ${frontDirectRead - BASELINE.frontDirectRead})`);
console.log('═══════════════════════════════════════════');
const total = frontEvoBypass + backendUrlBypass + frontDirectRead;
const btotal = BASELINE.frontEvoBypass + BASELINE.backendUrlBypass + BASELINE.frontDirectRead;
console.log(`TOTAL: ${total} (baseline: ${btotal}, delta: ${total - btotal})`);
