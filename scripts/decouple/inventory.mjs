#!/usr/bin/env node
// scripts/decouple/inventory.mjs — v3 (2026-08-14)
// Conta bypasses de acoplamento vs baseline (E5 do Plano 100 Etapas)
// Uso: node scripts/decouple/inventory.mjs
//      INVENTORY_ROOT=/caminho/do/repo node scripts/decouple/inventory.mjs  (override p/ testes)
//
// Métricas (v3 — redefinidas 2026-08-14; v2 corrigiu detecção falsa-zero):
//   1. frontEvoBypass:     arquivos front chamando invoke('evolution-api', …) FORA de whatsappAdapter.ts
//   2. backendUrlBypass:   edge fns lendo Deno.env.get('EVOLUTION_API_URL') fora do gateway
//   3. frontEvoWrites:     arquivos front fazendo .from('evolution_*').insert/update/delete direto
//      (leituras via PostgREST são arquiteturalmente legítimas — não contamos)
//   4. frontDirectEvoHttp: arquivos front com HTTP direto à Evolution API:
//      - referência a VITE_EVOLUTION_API_URL
//      - fetch para URL de Evolution construída ('evolution-api' / '/message/sendText' no alvo do fetch)
//      - import de 'evolutionClient' vindo de fora de src/_archive e src/lib/whatsappAdapter
//
// Whitelist de tooling (métricas 1 e 4): scripts/, .github/, __tests__/, *.test.ts(x),
// eslint.config.js, docs/ — código que não é produto não conta.
//
// Baseline NOVO: 0/0/0/0 (meta). Delta calculado contra o baseline ANTIGO 9/0/6/2.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, sep } from 'path';
import { fileURLToPath } from 'url';

// fileURLToPath: resolve o caminho corretamente em Windows (o pathname cru gera C:\C:\...) e POSIX
const ROOT = process.env.INVENTORY_ROOT
  ? process.env.INVENTORY_ROOT
  : fileURLToPath(new URL('../..', import.meta.url));

// Baseline NOVO (meta) — usado no veredito ✅/🔴
const BASELINE = {
  frontEvoBypass:     0,
  backendUrlBypass:   0,
  frontEvoWrites:     0,
  frontDirectEvoHttp: 0,
};

// Baseline ANTIGO (v2, 2026-08-13) — usado para calcular o delta
const OLD_BASELINE = {
  frontEvoBypass:     9,  // arquivos front que invocam 'evolution-api' diretamente (ex-whatsappAdapter)
  backendUrlBypass:   0,  // edge fns lendo EVOLUTION_API_URL direto (zerado em F5)
  frontEvoWrites:     6,  // arquivos front com .from('evolution_*').insert/update/delete direto
  frontDirectEvoHttp: 0,  // V3: exceções documentadas em isEvoAdapterOrArchive
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

// Whitelist de tooling: caminhos que não são código de produto (métricas 1 e 4)
const TOOLING_MARKERS = ['scripts/', '.github/', '__tests__', '.test.ts', 'eslint.config.js', 'docs/'];
function isTooling(p) {
  const n = p.split(sep).join('/');
  return TOOLING_MARKERS.some(m => n.includes(m));
}

// Exclusões da métrica 4: arquivos/áreas onde o HTTP direto é por design
function isEvoAdapterOrArchive(p) {
  const n = p.split(sep).join('/');
  return n.includes('src/_archive/')
    || /src\/lib\/whatsappAdapter[^/]*\.ts$/.test(n)
    || n.endsWith('src/lib/sendFunctionRouter.ts')
    // Exceção documentada (V3 F2): demo admin legada usa evolutionClient direto
    || n.includes('src/pages/admin/ZappWebbDemoPage.tsx')
    // V3 etapa 23: evolutionClient.ts é o cliente legado (evoFetch → Evolution API direto).
    // Em migração: ZappWebbDemoPage → edge fn evolution-api → arquivar este módulo.
    // Rastreado em PLANO_DESACOPLAMENTO_V3_100_ETAPAS.md etapas 23/28.
    || n.endsWith('src/integrations/zappweb/evolutionClient.ts');
}

// Remove linhas de comentário/docstring (mesma regra do v2)
function codeOnly(src) {
  return src.split('\n').filter(l => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
}

const tsFiles = walk(join(ROOT, 'src'), ['.ts', '.tsx']);
const edgeFns = walk(join(ROOT, 'supabase/functions'), ['.ts']);

let frontEvoBypass = 0, backendUrlBypass = 0, frontEvoWrites = 0, frontDirectEvoHttp = 0;

// Regex detecta invoke('evolution-api', com qualquer argumento seguinte (idêntico ao v2)
const RE_INVOKE_EVO = /invoke\(['\"]evolution-api['\"]/;
// Regex detecta .from('evolution_ALGO').método-de-escrita (idêntico ao v2)
const RE_EVO_WRITE  = /\.from\(['\"]evolution_[^'\"]+['\"]\)\s*\n?[^;]*(\.insert|\.update|\.delete|\.upsert)/;

// Métrica 4 — regex
const RE_EVO_ENV_URL    = /VITE_EVOLUTION_API_URL/;                                   // env var direta no front
const RE_EVO_FETCH_URL  = /fetch\s*\([^)]*(evolution-api|message\/sendText)/i;        // fetch p/ URL Evolution construída
const RE_EVO_CLIENT_IMP = /import\s+(?:type\s+)?[^;]*\bevolutionClient\b[^;]*from\s+['"][^'"]+['"]/;

// Import de evolutionClient é válido (não conta) se a origem for _archive ou whatsappAdapter
function hasEvoClientImport(code) {
  const m = code.match(RE_EVO_CLIENT_IMP);
  if (!m) return false;
  const fm = m[0].match(/from\s+['"]([^'"]+)['"]/);
  if (!fm) return false;
  return !fm[1].includes('_archive') && !fm[1].includes('whatsappAdapter');
}

for (const f of tsFiles) {
  if (f.includes('__tests__') || f.includes('.test.ts') || f.includes('.test.tsx')) continue;
  if (isTooling(f)) continue; // whitelist de tooling (métricas 1/3 compartilham o scan de src/)
  // Métrica 1: invoke direto — excluir o próprio adapter (ele invoca por design)
  const isAdapter = f.endsWith('whatsappAdapter.ts') || f.endsWith('sendFunctionRouter.ts');
  const src = readFileSync(f, 'utf8');
  // Excluir arquivos onde a única ocorrência é em comment/docstring (ex: withRequestId.ts)
  const codeLines = codeOnly(src);
  if (!isAdapter && RE_INVOKE_EVO.test(codeLines)) frontEvoBypass++;
  // Métrica 3: writes diretos em tabelas evolution_*
  if (!isAdapter && RE_EVO_WRITE.test(codeLines)) frontEvoWrites++;
}

for (const f of edgeFns) {
  // Normaliza separadores p/ casar marcadores com '/' em Windows (mesmo padrão de isTooling/isEvoAdapterOrArchive)
  const n = f.split(sep).join('/');
  if (n.includes('__tests__') || n.includes('.test.ts')
      || n.includes('evolution-api-proxy') || n.includes('evolution-proxy') || n.includes('providers/evolution')) continue; // evolution-proxy é proxy por design (V3)
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  const code = lines.join('\n');
  if (code.match(/Deno\.env\.get\(['\"]EVOLUTION_API_URL['\"]/)) backendUrlBypass++;
}

// Métrica 4 (nova): HTTP direto do front à Evolution API
for (const f of tsFiles) {
  if (isTooling(f)) continue;              // whitelist de tooling
  if (isEvoAdapterOrArchive(f)) continue;  // exceções por design
  const codeLines = codeOnly(readFileSync(f, 'utf8'));
  if (RE_EVO_ENV_URL.test(codeLines) || RE_EVO_FETCH_URL.test(codeLines) || hasEvoClientImport(codeLines)) {
    frontDirectEvoHttp++;
  }
}

const passEmoji = n => n === 0 ? '✅' : '🔴';
const fmt = (cur, old) =>
  `(baseline novo: ${BASELINE[old[0]]}, antigo: ${OLD_BASELINE[old[0]]}, delta: ${cur - OLD_BASELINE[old[0]]})`;

console.log('════ INVENTORY v3 — Acoplamento Evolution ════');
console.log(`front invoke bypass:      ${frontEvoBypass}  ${passEmoji(frontEvoBypass)} ${fmt(frontEvoBypass, ['frontEvoBypass'])}`);
console.log(`backend URL bypass:       ${backendUrlBypass}  ${passEmoji(backendUrlBypass)} ${fmt(backendUrlBypass, ['backendUrlBypass'])}`);
console.log(`front evo writes:         ${frontEvoWrites}  ${passEmoji(frontEvoWrites)} ${fmt(frontEvoWrites, ['frontEvoWrites'])}`);
console.log(`front direct evo http:    ${frontDirectEvoHttp}  ${passEmoji(frontDirectEvoHttp)} ${fmt(frontDirectEvoHttp, ['frontDirectEvoHttp'])}`);
console.log('═══════════════════════════════════════════════');
const total = frontEvoBypass + backendUrlBypass + frontEvoWrites + frontDirectEvoHttp;
const btotal = OLD_BASELINE.frontEvoBypass + OLD_BASELINE.backendUrlBypass + OLD_BASELINE.frontEvoWrites + OLD_BASELINE.frontDirectEvoHttp;
console.log(`TOTAL: ${total}  ${passEmoji(total)} (baseline novo: 0, antigo: ${btotal}, delta: ${total - btotal})`);
console.log('Meta: TOTAL → 0 (desacoplamento completo)');

// Exit code para workflow/CI (pipe com tee não quebra): 1 se houver violações
process.exit(total > 0 ? 1 : 0);
