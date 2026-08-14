#!/usr/bin/env node
// scripts/decouple/run-all-gates.mjs — Runner sequencial dos gates de desacoplamento
//
// Executa em ordem: inventory.mjs → ownership-gate.mjs → sql-gate.mjs
// (cada um só se existir; sql-gate requer report.json gerado no banco — SKIP se ausente).
//
// Uso: node scripts/decouple/run-all-gates.mjs
//      SQL_REPORT_PATH=/caminho/report.json node scripts/decouple/run-all-gates.mjs  (override do report do sql-gate)
//
// Exit composto: 0 = todos os gates executados passaram | 1 = algum gate falhou
// (gates SKIP por ausência de script/report não contam como falha).
//
// Zero dependências (Node ESM, stdlib apenas).

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const NODE = process.execPath;

// ownership-gate recebe --ci para expor exit code real (sem --ci ele sempre sai 0).
// sql-gate recebe o report.json (gerado no Supabase self-hosted via --sample).
const GATES = [
  { name: 'inventory', script: 'inventory.mjs', args: [] },
  { name: 'ownership', script: 'ownership-gate.mjs', args: ['--ci'] },
  { name: 'sql', script: 'sql-gate.mjs', args: [], needsReport: true },
];

const hr = '═'.repeat(64);
let failed = 0;
let skipped = 0;

for (const gate of GATES) {
  const scriptPath = join(DIR, gate.script);
  console.log(`\n${hr}\n▶ GATE: ${gate.name} (${gate.script})`);
  console.log(`${hr}`);

  if (!existsSync(scriptPath)) {
    console.log(`⏭  SKIP: ${gate.script} não existe — gate não registrado neste repo.`);
    skipped++;
    continue;
  }

  let args = gate.args;
  if (gate.needsReport) {
    const reportPath = process.env.SQL_REPORT_PATH || join(DIR, 'report.json');
    if (!existsSync(reportPath)) {
      console.log('⏭  SKIP: sql-gate requer report.json do banco (gerar na VPS com "node sql-gate.mjs --sample");');
      console.log(`    use SQL_REPORT_PATH para apontar o arquivo (procurado em: ${reportPath}).`);
      skipped++;
      continue;
    }
    args = [reportPath];
  }

  const r = spawnSync(NODE, [scriptPath, ...args], { stdio: 'inherit' });
  const code = r.status ?? 1;
  if (r.error) {
    console.error(`❌ GATE ${gate.name}: erro ao executar — ${r.error.message}`);
    failed++;
  } else if (code !== 0) {
    console.error(`❌ GATE ${gate.name} FALHOU (exit ${code})`);
    failed++;
  } else {
    console.log(`✅ GATE ${gate.name} OK (exit 0)`);
  }
}

console.log(`\n${hr}`);
if (failed === 0) {
  console.log(`✅ RESULTADO: todos os ${GATES.length - skipped} gate(s) executado(s) passaram (${skipped} skip(s)).`);
} else {
  console.error(`❌ RESULTADO: ${failed} gate(s) falharam (${skipped} skip(s)).`);
}
process.exit(failed > 0 ? 1 : 0);
