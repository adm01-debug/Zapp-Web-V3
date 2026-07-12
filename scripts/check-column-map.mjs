#!/usr/bin/env node
/**
 * check-column-map.mjs — guard-rail para nomes de coluna legados.
 *
 * Falha o CI se encontrar `'instance_name'` como coluna física em código
 * fora de:
 *   - src/integrations/supabase/columnMap.ts        (fonte da verdade)
 *   - src/integrations/supabase/rowNormalizers.ts   (aliases documentados)
 *   - src/lib/evolutionInstance.ts                  (wrapper de compat)
 *   - arquivos __tests__ / *.test.* / *.spec.*     (assertions)
 *   - supabase/functions (edge functions legadas)

 *
 * Uso: `node scripts/check-column-map.mjs`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const ALLOWLIST = new Set([
  'src/integrations/supabase/columnMap.ts',
  'src/integrations/supabase/rowNormalizers.ts',
  'src/lib/evolutionInstance.ts',
]);

const PATTERN = /['"`]instance_name['"`]|\.instance_name\b/;

/** @param {string} dir */
function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, '/');
  if (ALLOWLIST.has(rel)) continue;
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (PATTERN.test(line) && !/\/\/.*columnMap-ok/.test(line)) {
      violations.push(`${rel}:${i + 1}  ${line.trim()}`);
    }
  });
}

// Baseline: arquivos pré-existentes com uso legado tolerado (ratchet).
// Novo arquivo tocando `instance_name` como coluna física deve consumir columnMap.
const BASELINE_PATH = join(ROOT, 'scripts/.column-map-baseline.txt');
let baseline = new Set();
try {
  baseline = new Set(
    readFileSync(BASELINE_PATH, 'utf8')
      .split('\n')
      .map((l) => l.trim().replace(/^\s+/, ''))
      .filter(Boolean),
  );
} catch {
  // baseline ausente = nenhum arquivo tolerado
}

if (violations.length) {
  const newViolations = violations.filter((v) => {
    const file = v.split(':')[0].trim();
    return !baseline.has(file);
  });
  if (newViolations.length) {
    console.error('❌ Novo uso de coluna legada "instance_name" fora do columnMap:\n');
    for (const v of newViolations) console.error('  ' + v);
    console.error(
      '\nUse columnMap/rowNormalizers em src/integrations/supabase/ ou anexe // columnMap-ok se justificado.',
    );
    process.exit(1);
  }
  console.log(
    `✓ column-map guard: ${violations.length} usos legados tolerados via baseline (${baseline.size} arquivos). Zero regressões.`,
  );
} else {
  console.log(`✓ column-map guard: ${files.length} arquivos verificados, nenhuma regressão.`);
}

