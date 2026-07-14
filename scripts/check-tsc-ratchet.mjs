#!/usr/bin/env node
/**
 * TypeScript error ratchet.
 *
 * Roda `tsc --noEmit -p tsconfig.app.json` e compara o número de erros
 * contra o baseline em `scripts/tsc-error-baseline.json`. Falha o CI se:
 *   - Aparecerem novos erros em arquivos que hoje estão limpos (regressão).
 *   - O total de erros crescer.
 *
 * Como avançar (destravar melhoria):
 *   node scripts/check-tsc-ratchet.mjs --update
 *
 * O baseline é congelado por causa do mismatch entre o
 * `@supabase/postgrest-js` publicado no Google Artifact Registry privado
 * (usado pelo ambiente Lovable) e a versão pública que o CI do GitHub
 * Actions consegue baixar — não é regressão de código do projeto.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'tsc-error-baseline.json');
const UPDATE = process.argv.includes('--update');

function runTsc() {
  // Preferimos tsgo (bundle interno do Lovable) quando disponível;
  // caímos para tsc padrão em ambientes que não têm.
  const candidates = [
    ['bunx', ['tsgo', '--noEmit', '-p', 'tsconfig.app.json']],
    ['npx', ['tsc', '--noEmit', '-p', 'tsconfig.app.json']],
  ];
  for (const [cmd, args] of candidates) {
    const res = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (res.error && res.error.code === 'ENOENT') continue;
    return (res.stdout ?? '') + (res.stderr ?? '');
  }
  throw new Error('Nem tsgo nem tsc encontrados no PATH.');
}

function parseErrors(output) {
  const files = new Map(); // file → count
  let total = 0;
  const re = /^([^\s(]+\.(?:ts|tsx))\((\d+),(\d+)\): error TS\d+:/gm;
  let m;
  while ((m = re.exec(output)) !== null) {
    total += 1;
    const file = m[1].replace(/\\/g, '/');
    files.set(file, (files.get(file) ?? 0) + 1);
  }
  return { total, files: Object.fromEntries([...files.entries()].sort()) };
}

const output = runTsc();
const current = parseErrors(output);

if (UPDATE) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n');
  console.log(`baseline atualizado: ${current.total} erros em ${Object.keys(current.files).length} arquivos.`);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.error(`baseline ausente em ${BASELINE_PATH}. Gere com --update.`);
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));

const regressions = [];
for (const [file, count] of Object.entries(current.files)) {
  const prev = baseline.files[file] ?? 0;
  if (count > prev) regressions.push({ file, prev, count });
}

if (current.total > baseline.total || regressions.length > 0) {
  console.error('❌ TypeScript ratchet: regressão detectada.');
  console.error(`   total: baseline=${baseline.total} atual=${current.total}`);
  for (const r of regressions) {
    console.error(`   ${r.file}: ${r.prev} → ${r.count}`);
  }
  console.error('\nCorrija os erros ou, se removeu erros, avance o baseline:');
  console.error('  node scripts/check-tsc-ratchet.mjs --update');
  process.exit(1);
}

if (current.total < baseline.total) {
  console.log(
    `✅ TypeScript ratchet: ${baseline.total - current.total} erros removidos ` +
      `(${baseline.total} → ${current.total}). Rode --update para congelar o progresso.`
  );
} else {
  console.log(`✅ TypeScript ratchet: ${current.total} erros (baseline preservado).`);
}
process.exit(0);
