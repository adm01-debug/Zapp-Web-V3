#!/usr/bin/env node
/**
 * check-dead-code.mjs — Guard de código morto (Refactor Wave 1, 2026-07-06)
 *
 * Constrói o grafo de imports do src/ (estáticos, dinâmicos, re-exports, index.html)
 * e falha se existirem arquivos .ts/.tsx sem nenhum importador.
 *
 * Exclusões conscientes:
 *  - src/components/ui/**  (primitivos do design system; lidos pelo generate-component-registry)
 *  - testes, stories, setup de teste, main.tsx, App.tsx, *.d.ts
 *  - arquivos listados em scripts/dead-code-allowlist.txt (1 path por linha, com justificativa em comentário)
 *
 * Uso:  node scripts/check-dead-code.mjs [--list]
 * Exit: 0 = limpo | 1 = código morto detectado
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const LIST_ONLY = process.argv.includes('--list');

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f === 'node_modules') continue; walk(p); }
    else if (/\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')) files.push(p);
  }
})(SRC);

const fileSet = new Set(files);
const referenced = new Set();
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;

function resolveSpec(spec, fromFile) {
  let base = null;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null;
  for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (fileSet.has(base + ext)) return base + ext;
  }
  return null;
}

const scanRoots = [SRC, join(ROOT, 'scripts'), join(ROOT, 'e2e'), join(ROOT, '.storybook')].filter(existsSync);
const scanFiles = [];
for (const r of scanRoots) (function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    try {
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js|html)$/.test(f)) scanFiles.push(p);
    } catch { /* symlink quebrado etc. */ }
  }
})(r);
for (const cf of ['index.html', 'vite.config.ts', 'vitest.config.ts', 'tailwind.config.ts', 'playwright.config.ts', 'playwright.e2e.config.ts']) {
  const p = join(ROOT, cf);
  if (existsSync(p)) scanFiles.push(p);
}

for (const f of scanFiles) {
  const content = readFileSync(f, 'utf-8');
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const t = resolveSpec(m[1], f);
    if (t) referenced.add(t);
  }
  for (const h of content.match(/src=["']\/?src\/([^"']+)["']/g) || []) {
    const p = join(SRC, h.replace(/src=["']\/?src\//, '').replace(/["']$/, ''));
    if (fileSet.has(p)) referenced.add(p);
  }
}

const allowlistPath = join(ROOT, 'scripts', 'dead-code-allowlist.txt');
const allowlist = new Set(
  existsSync(allowlistPath)
    ? readFileSync(allowlistPath, 'utf-8').split('\n').map(l => l.split('#')[0].trim()).filter(Boolean)
    : []
);

const dead = files
  .filter(f => !referenced.has(f))
  .map(f => f.replace(ROOT + '/', ''))
  .filter(rel => !rel.startsWith('src/components/ui/'))
  .filter(rel => !/\.(test|spec|stories)\.(ts|tsx)$/.test(rel))
  .filter(rel => !/__tests__|src\/test\/|src\/tests\/|src\/stories\//.test(rel))
  .filter(rel => !/src\/main\.tsx$|src\/App\.tsx$/.test(rel))
  .filter(rel => !allowlist.has(rel));

if (dead.length === 0) {
  console.log('✅ check-dead-code: nenhum arquivo morto detectado.');
  process.exit(0);
}
console.error(`❌ check-dead-code: ${dead.length} arquivo(s) sem nenhum importador:`);
for (const d of dead.sort()) console.error('   - ' + d);
console.error('\nRemova o arquivo, importe-o de fato, ou adicione a scripts/dead-code-allowlist.txt com justificativa.');
process.exit(LIST_ONLY ? 0 : 1);
