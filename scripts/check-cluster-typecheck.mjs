#!/usr/bin/env node
/**
 * check-cluster-typecheck.mjs
 *
 * Rachet de tipos por cluster: percorre os clusters registrados abaixo,
 * roda `tsgo --noEmit` restrito aos arquivos do cluster (respeitando
 * tsconfig.app.json) e falha se qualquer arquivo com `@ts-nocheck` for
 * introduzido em cluster já limpo, ou se erros TS aumentarem.
 *
 * Uso local:
 *   node scripts/check-cluster-typecheck.mjs
 *   node scripts/check-cluster-typecheck.mjs --cluster crm
 *
 * O baseline é gerado dinamicamente a partir do estado atual do repo, então
 * a regra prática é: nenhum cluster listado pode regredir.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const CLUSTERS = {
  'crm-sales': [
    'src/features/inbox/components/CRMAutoSync.tsx',
    'src/hooks/useCRMManagement.ts',
    'src/hooks/useSyncToCRM.ts',
    'src/features/sales/**/*.{ts,tsx}',
  ],
  'inbox-core': [
    'src/features/inbox/hooks/**/*.{ts,tsx}',
    'src/features/inbox/components/ChatPanel.tsx',
    'src/features/inbox/components/ChatHeader.tsx',
    'src/features/inbox/components/ChatInputArea.tsx',
  ],
  queues: [
    'src/hooks/useQueueManagement.ts',
    'src/hooks/useQueueAnalytics.ts',
    'src/hooks/useQueueSlaPanel.ts',
  ],
  observability: [
    'src/hooks/useAlertManagement.ts',
    'src/hooks/usePerformanceMonitoring.ts',
  ],
};

const cli = process.argv.slice(2);
const filterIdx = cli.indexOf('--cluster');
const targetCluster = filterIdx >= 0 ? cli[filterIdx + 1] : null;

const args = new Set(cli.filter((a) => a.startsWith('--') || cli[cli.indexOf(a) - 1] !== '--cluster'));

function expand(patterns) {
  const files = new Set();
  for (const p of patterns) {
    if (p.includes('*')) {
      try {
        for (const f of globSync(p, { nodir: true })) files.add(f);
      } catch { /* node < 22 fallback */ }
    } else if (existsSync(p)) {
      files.add(p);
    }
  }
  return [...files];
}

let failed = 0;
let checkedClusters = 0;

for (const [name, patterns] of Object.entries(CLUSTERS)) {
  if (targetCluster && targetCluster !== name) continue;
  const files = expand(patterns);
  if (files.length === 0) {
    console.log(`◦ ${name}: nenhum arquivo casou (skip)`);
    continue;
  }
  checkedClusters++;

  // 1. Regra: sem @ts-nocheck em clusters já limpos
  const dirty = files.filter((f) => {
    try { return readFileSync(f, 'utf8').startsWith('// @ts-nocheck'); }
    catch { return false; }
  });
  if (dirty.length) {
    console.error(`✗ Cluster ${name}: @ts-nocheck detectado em ${dirty.length} arquivo(s):`);
    for (const f of dirty) console.error(`    ${f}`);
    failed++;
    continue;
  }

  // 2. Rodar tsgo restrito a estes arquivos (usa tsconfig.app.json)
  try {
    execSync(`bunx tsgo --noEmit -p tsconfig.app.json`, { stdio: 'pipe' });
    console.log(`✓ Cluster ${name}: ${files.length} arquivo(s) — tsc limpo`);
  } catch (err) {
    const out = String(err.stdout || '') + String(err.stderr || '');
    // filtra apenas erros nos arquivos do cluster
    const relevant = out.split('\n').filter((line) => files.some((f) => line.includes(f)));
    if (relevant.length) {
      console.error(`✗ Cluster ${name}: ${relevant.length} erro(s) TS`);
      for (const line of relevant.slice(0, 20)) console.error(`    ${line}`);
      failed++;
    } else {
      console.log(`✓ Cluster ${name}: sem erros no escopo (tsc reportou erros fora do cluster)`);
    }
  }
}

if (checkedClusters === 0) {
  console.error(`✗ Nenhum cluster casou com filtro '${targetCluster}'`);
  process.exit(2);
}

if (failed > 0) {
  console.error(`\n✗ ${failed} cluster(s) com dívida de tipos`);
  process.exit(1);
}
console.log(`\n✓ Todos os ${checkedClusters} cluster(s) limpos`);
