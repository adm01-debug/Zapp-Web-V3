#!/usr/bin/env node
// scripts/decouple/coverage-report.mjs — Cobertura REAL do desacoplamento (V4-FINAL #44-45)
//
// Mede quantas operações de mensageria WhatsApp expostas pelo router da edge
// function `evolution-api` têm contrato Zod na porta oficial do gateway
// (providers/evolution/contract.zod.ts — 12 verbos) e gera
// docs/decouple/COVERAGE_V4.md com o número honesto, a fórmula documentada e a
// seção "Gaps conhecidos" listando CADA action sem contrato com arquivo:linha.
//
// Fórmula (etapa 44 do plano):
//   cobertura_contrato = verbos_com_zod / actions_totais
//   - actions_totais (denominador) = TODAS as actions reais do router
//       (if action === '...' em supabase/functions/evolution-api/index.ts) —
//       NÃO apenas os 12 verbos do client (sem inflar).
//   - verbos_com_zod (numerador)   = actions cuja operação tem verbo
//       EQUIVALENTE no contrato Zod. Equivalência por endpoint da Evolution
//       API, auditada contra providers/evolution/client.ts (tabela
//       ACTION_TO_VERB abaixo).
//
// Uso: node scripts/decouple/coverage-report.mjs
// Exit: 0 sempre (é relatório, não gate). Drift de contrato/fake imprime ⚠️
//       no stdout e fica registrado no MD, sem quebrar a execução.
// Zero dependências (Node ESM, stdlib apenas).

import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// fileURLToPath: resolve o caminho corretamente em Windows e POSIX
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ROUTER_PATH = 'supabase/functions/evolution-api/index.ts';
const CONTRACT_PATH = 'supabase/functions/_shared/providers/evolution/contract.zod.ts';
const FAKE_PATH = 'supabase/functions/_shared/providers/fake/index.ts';
const REPORT_PATH = 'docs/decouple/COVERAGE_V4.md';

// ─── Equivalência action do router → verbo do contrato (por ENDPOINT Evolution) ──
// Auditado 2026-08-14 contra providers/evolution/client.ts (evolutionClient):
//   send-text      → POST /message/sendText/{instance}         == client.sendText
//   send-media     → POST /message/sendMedia/{instance}        == client.sendMedia
//   send-sticker   → POST /message/sendSticker/{instance}      == client.sendSticker
//   status         → GET  /instance/connectionState/{instance} == client.getConnectionState
//   list-instances → GET  /instance/fetchInstances             == client.listInstances
//   check-numbers  → POST /chat/whatsappNumbers/{instance}     == client.checkWhatsApp
//   connect        → GET  /instance/connect/{instance}         == client.getQrCode
//   pairing-code   → GET  /instance/connect/{instance}?number= == client.getQrCode
//                     (mesmo endpoint + query param — o schema Zod do getQrCode
//                      documenta inclusive `pairingCode` no response)
// Demais actions NÃO têm verbo equivalente no contrato (send-audio/send-ptv/
// send-location/... usam endpoints sem verbo dedicado; get/post genéricos do
// contrato são escape hatch do evolution-proxy, NÃO contam — seria inflar).
const ACTION_TO_VERB = Object.freeze({
  'send-text': 'sendText',
  'send-media': 'sendMedia',
  'send-sticker': 'sendSticker',
  'status': 'getConnectionState',
  'list-instances': 'listInstances',
  'check-numbers': 'checkWhatsApp',
  'connect': 'getQrCode',
  'pairing-code': 'getQrCode',
});

/** Lê arquivo sob ROOT com mensagem de erro PT-BR. */
function read(rel) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch (err) {
    console.error(`❌ coverage-report: não foi possível ler "${rel}": ${err.message}`);
    process.exit(1);
  }
}

/**
 * Extrai as actions do router: `if (action === 'x')` com a linha de cada case.
 * Exclui o fallback `action === 'evolution-api'` (linha ~90 do index.ts) —
 * não é rota, é a queda para pathAction quando o body não traz action.
 * @param {string} src
 * @returns {{ name: string, line: number }[]}
 */
function extractRouterActions(src) {
  const out = [];
  const re = /if\s*\(\s*action\s*===\s*'([a-z0-9-]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[1] === 'evolution-api') continue; // fallback pathAction, não é rota
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ name: m[1], line });
  }
  return out;
}

/**
 * Extrai as chaves de objeto exportado em nível superior (convenção do
 * verb-contract-gate.mjs: indentação de 1-2 espaços, chaves aninhadas ficam fora).
 * @param {string} src
 * @param {RegExp} objRe regex com grupo 1 = corpo do objeto
 * @returns {string[] | null}
 */
function extractObjectKeys(src, objRe) {
  const m = src.match(objRe);
  if (!m) return null;
  const keys = [];
  for (const line of m[1].split('\n')) {
    const pm = line.match(/^ {1,2}([A-Za-z_$][\w$]*)\s*:/);
    if (pm) keys.push(pm[1]);
  }
  return [...new Set(keys)];
}

const CONTRACT_OBJ_RE = /export\s+const\s+evolutionGatewayContract\s*:\s*Record<[^>]+>\s*=\s*\{([\s\S]*?)\n\};/;
const FAKE_OBJ_RE = /export\s+const\s+fakeProvider\s*=\s*\{([\s\S]*?)\n\};/;

/**
 * Extrai as chaves do fakeProvider (métodos em shorthand: `async sendText(...) {`).
 * @param {string} src
 * @returns {string[]}
 */
function extractFakeVerbs(src) {
  const m = src.match(FAKE_OBJ_RE);
  if (!m) return [];
  const keys = [];
  for (const line of m[1].split('\n')) {
    const pm = line.match(/^ {1,2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:\(|:)/);
    if (pm) keys.push(pm[1]);
  }
  return [...new Set(keys)];
}

function main() {
  const routerSrc = read(ROUTER_PATH);
  const contractSrc = read(CONTRACT_PATH);
  const fakeSrc = read(FAKE_PATH);

  // (a) actions reais do router
  const actions = extractRouterActions(routerSrc);
  // (b) 12 verbos com contrato Zod
  const contractVerbs = extractObjectKeys(contractSrc, CONTRACT_OBJ_RE) || [];
  // (c) verbos do fake (filtra helpers assertSafe/mock/reset)
  const fakeKeys = extractFakeVerbs(fakeSrc);
  const fakeVerbs = fakeKeys.filter(k => contractVerbs.includes(k));

  if (actions.length === 0) {
    console.error('❌ coverage-report: nenhuma action encontrada no router — regex desatualizada?');
    process.exit(1);
  }
  if (contractVerbs.length === 0) {
    console.error('❌ coverage-report: evolutionGatewayContract não encontrado em contract.zod.ts');
    process.exit(1);
  }

  // Integridade do mapeamento: todo verbo referenciado precisa existir no contrato
  const mappedVerbs = new Set(Object.values(ACTION_TO_VERB));
  const missingVerbs = [...mappedVerbs].filter(v => !contractVerbs.includes(v));
  if (missingVerbs.length > 0) {
    console.error(`❌ coverage-report: ACTION_TO_VERB referencia verbos ausentes do contrato: ${missingVerbs.join(', ')}`);
    process.exit(1);
  }

  // (d) cálculo
  const covered = actions.filter(a => ACTION_TO_VERB[a.name]);
  const gaps = actions.filter(a => !ACTION_TO_VERB[a.name]);
  const pct = (covered.length / actions.length) * 100;

  // Métricas auxiliares honestas
  const FAKE_HELPERS = new Set(['assertSafe', 'mock', 'reset']); // helpers por design, não verbos
  const fakeMissing = contractVerbs.filter(v => !fakeVerbs.includes(v));
  const fakeExtra = fakeKeys.filter(k => !contractVerbs.includes(k) && !FAKE_HELPERS.has(k));
  const orphanVerbs = contractVerbs.filter(v => !Object.values(ACTION_TO_VERB).includes(v));

  // Commit/branch para o rodapé do MD (read-only; nunca faz git add/commit/push)
  let commit = '', branch = '';
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    branch = execFileSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { /* sem git: deixa vazio */ }

  // ─── Relatório no stdout ────────────────────────────────────────────────────
  const pad = n => String(n).padEnd(24);
  console.log('📊 COVERAGE V4 — Cobertura real do desacoplamento (mensageria WhatsApp)');
  console.log('─'.repeat(70));
  console.log(`${pad('actions do router')} ${actions.length}`);
  console.log(`${pad('verbos com contrato Zod')} ${contractVerbs.length}`);
  console.log(`${pad('verbos do fake')} ${fakeVerbs.length}/${contractVerbs.length}`);
  console.log(`${pad('COBERTURA_CONTRATO')} ${covered.length}/${actions.length} = ${pct.toFixed(1).replace('.', ',')}%`);
  console.log('─'.repeat(70));
  console.log('Actions cobertas por verbo do contrato:');
  for (const a of actions) {
    const verb = ACTION_TO_VERB[a.name];
    console.log(`  ${verb ? '✅' : '❌'} ${a.name.padEnd(24)} linha ${String(a.line).padEnd(4)}${verb ? `→ ${verb}` : ''}`);
  }
  if (gaps.length > 0) {
    console.log('─'.repeat(70));
    console.log(`🔴 Gaps conhecidos (${gaps.length} actions sem contrato — ver COVERAGE_V4.md):`);
    for (const g of gaps) console.log(`  - ${g.name} @ ${ROUTER_PATH}:${g.line}`);
  }
  if (fakeMissing.length > 0 || fakeExtra.length > 0) {
    console.log('─'.repeat(70));
    console.log(`⚠️  Drift no fake provider: faltando=${fakeMissing.join(',') || '-'} extras=${fakeExtra.join(',') || '-'}`);
  }
  console.log('─'.repeat(70));
  console.log(`📄 Relatório gerado em ${REPORT_PATH}`);

  // ─── Geração do COVERAGE_V4.md ──────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const fmtPct = pct.toFixed(1).replace('.', ',');
  const rows = actions.map(a => {
    const verb = ACTION_TO_VERB[a.name] || '—';
    const ok = verb !== '—' ? '✅' : '❌';
    return `| \`${a.name}\` | ${a.line} | \`${verb}\` | ${ok} |`;
  }).join('\n');
  const gapRows = gaps.map(g => `| \`${g.name}\` | \`${ROUTER_PATH}:${g.line}\` |`).join('\n');
  const auxRows = [
    `| Cobertura efetiva de roteamento | 0/${actions.length} (0%) | Actions que HOJE roteiam pelo \`evolutionClient\` contratado. Todas usam \`proxyToEvolution\` direto (\`_shared/evolution-api-proxy.ts\`) — o contrato cobre a OPERAÇÃO, mas o router ainda não roteia pela porta contratada. |`,
    `| Verbos contratados sem action no router | ${orphanVerbs.length} | ${orphanVerbs.length ? orphanVerbs.map(v => `\`${v}\``).join(', ') : '—'} — contrato existe, mas o router não expõe a operação (ex.: consumidos por outra edge function/evolução futura). |`,
    fakeMissing.length || fakeExtra.length
      ? `| Drift no fake provider | ⚠️ faltando: ${fakeMissing.map(v => `\`${v}\``).join(', ') || '—'} · extras: ${fakeExtra.map(v => `\`${v}\``).join(', ') || '—'} | Fake fora do espelho do contrato. |`
      : '',
  ].filter(Boolean).join('\n');

  const md = `# COVERAGE_V4 — Cobertura real do desacoplamento de mensageria WhatsApp

> **Gerado por** \`scripts/decouple/coverage-report.mjs\` — não editar manualmente.
> **Data:** ${today} · **Commit:** ${commit || 'n/d'} · **Branch:** ${branch || 'n/d'}

## Veredito

| Métrica | Valor |
|---|---|
| Actions do router (\`supabase/functions/evolution-api/index.ts\`) | ${actions.length} |
| Verbos com contrato Zod (\`contract.zod.ts\`) | ${contractVerbs.length} |
| Verbos do fake (\`providers/fake/index.ts\`) | ${fakeVerbs.length}/${contractVerbs.length} |
| **Cobertura de contrato** | **${covered.length}/${actions.length} = ${fmtPct}%** |

🔴 **Cobertura < 100%** — ver [Gaps conhecidos](#gaps-conhecidos).

## Fórmula

\`\`\`
cobertura_contrato = verbos_com_zod / actions_totais
                   = ${covered.length} / ${actions.length}
                   = ${fmtPct}%
\`\`\`

- **\`actions_totais\`** (denominador): TODAS as operações reais roteadas pelo router da edge function \`evolution-api\` (\`if (action === '...')\` em \`supabase/functions/evolution-api/index.ts\`). São ${actions.length} — a métrica NÃO usa só os 12 verbos do client (seria inflar).
- **\`verbos_com_zod\`** (numerador): actions cuja operação tem verbo **equivalente** no contrato Zod do gateway (\`providers/evolution/contract.zod.ts\` — 12 verbos). Equivalência por endpoint da Evolution API, auditada contra \`providers/evolution/client.ts\` (tabela \`ACTION_TO_VERB\` do script). Os verbos genéricos \`get\`/\`post\` do contrato NÃO contam para actions específicas — são escape hatch do \`evolution-proxy\`, não contrato de operação (sem inflar).

### Métricas auxiliares (para não inflar)

| Métrica | Valor | Significado |
|---|---|---|
${auxRows}

## Cobertura por action (${actions.length})

| Action | Linha | Verbo do contrato | Coberto |
|---|---|---|---|
${rows}

## Gaps conhecidos (${gaps.length})

Cada operação abaixo está **fora do contrato Zod** — sem verbo equivalente na porta oficial (\`contract.zod.ts\`). Fechar um gap = adicionar o verbo ao contrato (request/response Zod), implementar no \`evolutionClient\` e no \`fakeProvider\`, e rotear a action por ele.

| Action | Onde |
|---|---|
${gapRows}

## Como ler este número

- **${fmtPct}%** é a fração das operações de mensageria expostas pelo router que **já têm porta oficial com contrato definido** (teto: mesmo roteando tudo pelo gateway contratado, o número não sobe além disso sem contratar os verbos faltantes).
- A **cobertura efetiva de roteamento (0%)** é o passo seguinte do desacoplamento: trocar \`proxyToEvolution\` pelo \`evolutionClient\` + validação Zod nas ações cobertas, e contratar os verbos dos gaps.
`;
  writeFileSync(join(ROOT, REPORT_PATH), md);
  console.log(`✅ COVERAGE_V4.md escrito (${md.split('\n').length} linhas)`);
}

main();
