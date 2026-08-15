#!/usr/bin/env node
// scripts/decouple/inventory.mjs — v5 (2026-08-15)
// Conta bypasses de acoplamento vs baseline (E5/E21 do Plano 100 Etapas)
// Uso: node scripts/decouple/inventory.mjs
//      node scripts/decouple/inventory.mjs --json          (saída JSON estruturada)
//      INVENTORY_ROOT=/caminho/do/repo node scripts/decouple/inventory.mjs  (override p/ testes)
//
// Métricas (v5 — adicionadas I1/I2 conforme E21, 2026-08-15):
//   1. frontEvoBypass:     arquivos front chamando invoke('evolution-api', …) FORA de whatsappAdapter.ts
//   2. backendUrlBypass:   edge fns lendo EVOLUTION_API_URL fora do gateway —
//      agora detecta Deno.env.get E requireEnv, com aspas simples/duplas E template literal (backtick)
//   3. frontEvoWrites:     arquivos front fazendo .from('evolution_*').insert/update/delete direto
//      (leituras via PostgREST são arquiteturalmente legítimas — não contamos)
//   4. frontDirectEvoHttp: arquivos front com HTTP direto à Evolution API —
//      AMPLIADA (V1): qualquer string contendo 'evolution.atomicabr.com.br' OU
//      '/message/sendText' OU '/instance/' em src/ (fora exceções) conta na m4.
//      Cobre: axios.post/get, WebSocket('wss://...'), URL montada em variável
//      (ex: const url = base + '/message/sendText'; fetch(url)), fetch direto, env var.
//      FIX v4: strip de comentário inline agora preserva '//' dentro de strings
//      (https://, wss://) — sem isso a detecção de URL ficava cega.
//      Código de teste (src/test/, src/tests/, *.spec) não é produto (mesmo eixo
//      do whitelist de tooling das métricas 1/3).
//   5. i1ZappRefEvo:       funções PL/pgSQL em zapp.* que referenciam evo.* nas migrations
//   6. i2EvoRefZapp:       funções PL/pgSQL em evo.* que referenciam zapp.* nas migrations
//
// Whitelist de tooling (métricas 1, 3 e 4): scripts/, .github/, __tests__/, *.test.ts(x),
// eslint.config.js, docs/ — código que não é produto não conta.
// Métricas 1/3 também excluem src/test/ e src/tests/ (novo na v4).
//
// Exceções m4 (por design, documentadas):
//   - src/_archive/ (legado arquivado)
//   - src/lib/whatsappAdapter*.ts, src/lib/sendFunctionRouter.ts (gateway do front)
//   - src/pages/admin/ZappWebbDemoPage.tsx (demo admin legada)
//   - src/integrations/zappweb/evolutionClient.ts (client decoupled via proxy — refs de
//     URL/path são documentais; chamadas reais passam por invoke('evolution-proxy'))
//   - src/integrations/zappweb/supabaseClient.ts, src/lib/healthCheck.ts,
//     src/features/inbox/hooks/useMessagesCursor.ts (áreas V1 sem HTTP direto)
//   - src/features/integrations/hooks/useEvolutionApiIntegration.ts — AJUSTE V1
//     (falso-positivo): DEFAULT_URL é o default de um campo de formulário (config do
//     admin, gravada no DB), NÃO é alvo de HTTP direto — todas as chamadas reais passam
//     por whatsappAdapter → edge fn 'evolution-api'. Manter como exceção documentada.
// Exceção m2: supabase/functions/connection-health-check/ (healthCheck lê
// EVOLUTION_API_URL por design — é a função de diagnóstico de saúde da API).
//
// Baseline NOVO: 0/0/0/0/0/0 (meta). Delta calculado contra o baseline ANTIGO 9/0/6/2/20/96.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, sep } from 'path';
import { fileURLToPath } from 'url';

const IS_JSON = process.argv.includes('--json');

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
  i1ZappRefEvo:       0,   // meta: 0 (T0 = 20 funções)
  i2EvoRefZapp:       0,   // meta: 0 (T0 = 96 funções)
};

// Baseline ANTIGO (v2/T0) — usado para calcular o delta
const OLD_BASELINE = {
  frontEvoBypass:     9,   // arquivos front que invocam 'evolution-api' diretamente (ex-whatsappAdapter)
  backendUrlBypass:   0,   // edge fns lendo EVOLUTION_API_URL direto (zerado em F5)
  frontEvoWrites:     6,   // arquivos front com .from('evolution_*').insert/update/delete direto
  frontDirectEvoHttp: 2,   // arquivos front com HTTP direto à Evolution API (v3)
  i1ZappRefEvo:       20,  // 20 funções zapp.* → evo.* no T0
  i2EvoRefZapp:       96,  // 96 funções evo.* → zapp.* no T0
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

// Whitelist de tooling: caminhos que não são código de produto (métricas 1, 3 e 4)
const TOOLING_MARKERS = ['scripts/', '.github/', '__tests__', '.test.ts', 'eslint.config.js', 'docs/'];
function isTooling(p) {
  const n = p.split(sep).join('/');
  return TOOLING_MARKERS.some(m => n.includes(m));
}

// Exclusões da métrica 4: arquivos/áreas onde o HTTP direto é por design (v4 — ampliadas)
function isM4Exception(p) {
  const n = p.split(sep).join('/');
  return n.includes('src/_archive/')
    || /src\/lib\/whatsappAdapter[^/]*\.ts$/.test(n)          // whatsappAdapter(+Transport/Types)
    || n.endsWith('src/lib/sendFunctionRouter.ts')
    || n.includes('src/pages/admin/ZappWebbDemoPage.tsx')      // demo admin legada (V3 F2)
    || n.includes('src/integrations/zappweb/evolutionClient.ts') // client decoupled via proxy
    || n.includes('src/integrations/zappweb/supabaseClient.ts')  // V1: sem HTTP direto
    || n.includes('src/lib/healthCheck.ts')                      // V1: sem HTTP direto
    || n.includes('src/features/inbox/hooks/useMessagesCursor.ts') // V1: sem HTTP direto
    // V1 (falso-positivo ajustado): DEFAULT_URL é default de formulário (config),
    // não alvo de HTTP direto — chamadas reais via whatsappAdapter → edge fn.
    || n.includes('src/features/integrations/hooks/useEvolutionApiIntegration.ts');
}

// Remove linhas de comentário/docstring (mesma regra do v2)
// v4 FIX: strip de comentário inline é ciente de strings — o indexOf('//') ingênuo
// do v3 cortava 'https://' dentro de literais e MASCARAVA a m4 ampliada (V1).


const tsFiles = walk(join(ROOT, 'src'), ['.ts', '.tsx']);
const edgeFns = walk(join(ROOT, 'supabase/functions'), ['.ts']);

let frontEvoBypass = 0, backendUrlBypass = 0, frontEvoWrites = 0, frontDirectEvoHttp = 0;

// Listas de violadores por métrica (v4 — impressas quando > 0, para diagnóstico do guard)
const violators = {
  frontEvoBypass: [],
  backendUrlBypass: [],
  frontEvoWrites: [],
  frontDirectEvoHttp: [],
  i1ZappRefEvo: [],
  i2EvoRefZapp: [],
};

// Caminho relativo (src/...) com separador normalizado p/ impressão
const rootNorm = ROOT.split(sep).join('/').replace(/\/+$/, '');
const rel = f => f.split(sep).join('/').replace(rootNorm + '/', '');

// Regex detecta invoke('evolution-api', com qualquer argumento seguinte (idêntico ao v2)
const RE_INVOKE_EVO = /invoke\(['\"`]evolution-api['\"`]/;
// strip de comentario inline ciente de strings E block comments (v4.1):
// - 'https://' dentro de literal NAO e cortado (fix v4)
// - /* ... */ multi-linha NAO conta na metrica (fix v4.1 — 2 FPs reais)
function stripInlineComment(line, inBlock) {
  if (inBlock) {
    const end = line.indexOf('*/');
    return end > -1 ? line.slice(end + 2) : '';
  }
  const bc = line.indexOf('/*');
  const sc = line.indexOf('//');
  if (bc > -1 && (sc === -1 || bc < sc)) return line.slice(0, bc);
  let inS = null;
  for (let i = 0; i < line.length - 1; i++) {
    const c = line[i];
    if (inS) {
      if (c === '\\') { i++; continue; }
      if (c === inS) inS = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inS = c; continue; }
    if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

function codeOnly(src) {
  let inBlock = false;
  return src.split('\n').map(l => {
    if (!inBlock && l.indexOf('/*') > -1 && (l.indexOf('//') === -1 || l.indexOf('/*') < l.indexOf('//'))) inBlock = true;
    const out = stripInlineComment(l, inBlock);
    if (inBlock && l.indexOf('*/') > -1) inBlock = false;
    return out;
  }).filter(l => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).join('\n');
}


// Regex detecta .from('evolution_ALGO').método-de-escrita (idêntico ao v2)
const RE_EVO_WRITE  = /\.from\(['\"]evolution_[^'\"]+['\"]\)\s*\n?[^;]*(\.insert|\.update|\.delete|\.upsert)/;

// Métrica 4 — regex (v4: RE_EVO_DIRECT é o alvo ampliado da Validação V1)
const RE_EVO_DIRECT    = /evolution\.atomicabr\.com\.br|\/message\/sendText|\/instance\//i;
const RE_EVO_ENV_URL   = /VITE_EVOLUTION_API_URL/;                                   // env var direta no front
const RE_EVO_FETCH_URL = /fetch\s*\([^)]*(evolution-api|message\/sendText)/i;        // fetch p/ URL Evolution construída
const RE_EVO_CLIENT_IMP = /import\s+(?:type\s+)?[^;]*\bevolutionClient\b[^;]*from\s+['\"][^'\"]+['\"]/;

// Import de evolutionClient é válido (não conta) se a origem for _archive ou whatsappAdapter
function hasEvoClientImport(code) {
  const m = code.match(RE_EVO_CLIENT_IMP);
  if (!m) return false;
  const fm = m[0].match(/from\s+['\"]([^'\"]+)['\"]/);
  if (!fm) return false;
  return !fm[1].includes('_archive') && !fm[1].includes('whatsappAdapter');
}

for (const f of tsFiles) {
  const n = f.split(sep).join('/');
  // v4: src/test/ e src/tests/ também são fora de produto (métricas 1/3)
  if (n.includes('__tests__') || n.includes('.test.ts') || n.includes('.test.tsx')
      || n.includes('.spec.ts') || n.includes('.spec.tsx') || n.includes('src/_archive/')
      || n.includes('src/test/') || n.includes('src/tests/')) continue;
  if (isTooling(f)) continue; // whitelist de tooling (métricas 1/3 compartilham o scan de src/)
  // Métrica 1: invoke direto — excluir o próprio adapter (ele invoca por design)
  const isAdapter = f.endsWith('whatsappAdapter.ts') || f.endsWith('sendFunctionRouter.ts');
  const src = readFileSync(f, 'utf8');
  // Excluir arquivos onde a única ocorrência é em comment/docstring (ex: withRequestId.ts)
  const codeLines = codeOnly(src);
  if (!isAdapter && RE_INVOKE_EVO.test(codeLines)) { frontEvoBypass++; violators.frontEvoBypass.push(rel(f)); }
  // Métrica 3: writes diretos em tabelas evolution_*
  if (!isAdapter && RE_EVO_WRITE.test(codeLines)) { frontEvoWrites++; violators.frontEvoWrites.push(rel(f)); }
}

for (const f of edgeFns) {
  const n = f.split(sep).join('/');  // normaliza \ para / (bug Windows 2026-08-14 V0)
  // v4: connection-health-check lê EVOLUTION_API_URL por design (healthCheck) — exceção V1
  if (n.includes('__tests__') || n.includes('.test.ts')
      || n.includes('evolution-api-proxy') || n.includes('providers/evolution')
      || n.includes('connection-health-check')) continue;
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  const code = lines.join('\n');
  // v4: Deno.env.get E requireEnv, com ' " ou ` (template literal)
  if (code.match(/(?:Deno\.env\.get|requireEnv)\s*\(\s*[`'\"]EVOLUTION_API_URL[`'\"]\s*\)/)) {
    backendUrlBypass++; violators.backendUrlBypass.push(rel(f));
  }
}

// Métrica 4 (v4): HTTP direto do front à Evolution API — qualquer string com
// 'evolution.atomicabr.com.br' | '/message/sendText' | '/instance/' em src/ (fora exceções)
// v4: código de teste (src/test/, src/tests/, *.spec) também não é produto — mesmo
// eixo do whitelist de tooling aplicado nas métricas 1/3.
for (const f of tsFiles) {
  const n = f.split(sep).join('/');
  if (n.includes('__tests__') || n.includes('.test.ts') || n.includes('.test.tsx')
      || n.includes('.spec.ts') || n.includes('.spec.tsx')
      || n.includes('src/test/') || n.includes('src/tests/')) continue;
  if (isTooling(f)) continue;              // whitelist de tooling
  if (isM4Exception(f)) continue;          // exceções por design (V1)
  const codeLines = codeOnly(readFileSync(f, 'utf8'));
  if (RE_EVO_DIRECT.test(codeLines) || RE_EVO_ENV_URL.test(codeLines)
      || RE_EVO_FETCH_URL.test(codeLines) || hasEvoClientImport(codeLines)) {
    frontDirectEvoHttp++; violators.frontDirectEvoHttp.push(rel(f));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas I1/I2 (v5 — E21): análise estática de migrations SQL
// I1: funções PL/pgSQL no schema zapp.* que referenciam evo.* no corpo
// I2: funções PL/pgSQL no schema evo.* que referenciam zapp.* no corpo
// ─────────────────────────────────────────────────────────────────────────────
function scanMigrationsForI1I2(migrationsDir) {
  const i1Fns = new Set(); // zapp.fn_x que menciona evo.
  const i2Fns = new Set(); // evo.fn_x que menciona zapp.

  let files;
  try {
    files = readdirSync(migrationsDir);
  } catch (_) {
    return { i1: 0, i2: 0, i1Fns: [], i2Fns: [] };
  }

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const src = readFileSync(join(migrationsDir, file), 'utf8');

    // Split por CREATE [OR REPLACE] FUNCTION — cada slice[1..] começa em "schema.nome("
    const fnBlocks = src.split(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/i);

    for (const block of fnBlocks.slice(1)) {
      // Captura o schema e o nome da função: "schema.nome(" ou "schema.nome  ("
      const nameLine = block.match(/^(\w+)\.(\w+)\s*\(/);
      if (!nameLine) continue;
      const schema = nameLine[1].toLowerCase();
      const fnName = nameLine[2];

      // Extrai o corpo da função: conteúdo entre $$ ... $$
      // Tenta capturar o corpo mais externo (não-greedy não funciona bem aqui; greedy limitado)
      const bodyMatch = block.match(/\$\$[\s\S]*?\$\$/);
      const body = bodyMatch ? bodyMatch[0] : block.slice(0, 4000); // fallback: primeiros 4 KB

      if (schema === 'zapp' && /\bevo\./i.test(body)) {
        i1Fns.add(`zapp.${fnName}`);
      }
      if (schema === 'evo' && /\bzapp\./i.test(body)) {
        i2Fns.add(`evo.${fnName}`);
      }
    }
  }

  return { i1: i1Fns.size, i2: i2Fns.size, i1Fns: [...i1Fns].sort(), i2Fns: [...i2Fns].sort() };
}

const migrationsDir = join(ROOT, 'supabase', 'migrations');
const { i1, i2, i1Fns: i1List, i2Fns: i2List } = scanMigrationsForI1I2(migrationsDir);

violators.i1ZappRefEvo = i1List;
violators.i2EvoRefZapp = i2List;

// ─────────────────────────────────────────────────────────────────────────────
// Saída
// ─────────────────────────────────────────────────────────────────────────────

const passEmoji = n => n === 0 ? '✅' : '🔴';

const metrics = {
  frontEvoBypass,
  backendUrlBypass,
  frontEvoWrites,
  frontDirectEvoHttp,
  i1ZappRefEvo: i1,
  i2EvoRefZapp: i2,
};

const total = Object.values(metrics).reduce((a, b) => a + b, 0);
const btotal = Object.values(OLD_BASELINE).reduce((a, b) => a + b, 0);

if (IS_JSON) {
  const delta = {};
  for (const k of Object.keys(metrics)) delta[k] = metrics[k] - OLD_BASELINE[k];

  const allPass = Object.keys(metrics).every(k => metrics[k] <= BASELINE[k]);

  const out = {
    version: '5',
    timestamp: new Date().toISOString().slice(0, 10),
    metrics,
    baseline_old: OLD_BASELINE,
    baseline_new: BASELINE,
    delta,
    score: allPass ? 'PASS' : 'FAIL',
    violations: violators,
  };
  console.log(JSON.stringify(out, null, 2));
} else {
  const fmt = (cur, key) =>
    `(baseline novo: ${BASELINE[key]}, antigo: ${OLD_BASELINE[key]}, delta: ${cur - OLD_BASELINE[key]})`;

  function printMetric(label, key, count) {
    console.log(`${label} ${count}  ${passEmoji(count)} ${fmt(count, key)}`);
    if (count > 0) {
      console.log(`  violadores (${key}):`);
      for (const v of violators[key]) console.log(`    - ${v}`);
    }
  }

  console.log('════ INVENTORY v5 — Acoplamento Evolution ════');
  printMetric('front invoke bypass:      ', 'frontEvoBypass',     frontEvoBypass);
  printMetric('backend URL bypass:       ', 'backendUrlBypass',   backendUrlBypass);
  printMetric('front evo writes:         ', 'frontEvoWrites',     frontEvoWrites);
  printMetric('front direct evo http:    ', 'frontDirectEvoHttp', frontDirectEvoHttp);
  printMetric('I1 zapp.* → evo.* (sql): ', 'i1ZappRefEvo',       i1);
  printMetric('I2 evo.* → zapp.* (sql): ', 'i2EvoRefZapp',       i2);
  console.log('═══════════════════════════════════════════════');
  console.log(`TOTAL: ${total}  ${passEmoji(total)} (baseline novo: 0, antigo: ${btotal}, delta: ${total - btotal})`);
  console.log('Meta: TOTAL → 0 (desacoplamento completo)');
}

// fail-closed: exit != 0 quando as métricas 1-4 excedem 0 (guard original — I1/I2 são métricas de progresso)
const exitCode = (frontEvoBypass + backendUrlBypass + frontEvoWrites + frontDirectEvoHttp) > 0 ? 1 : 0;
process.exit(exitCode);
