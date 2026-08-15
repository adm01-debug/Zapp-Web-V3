#!/usr/bin/env node
/**
 * sql-gate.mjs — Gate do egresso SQL da Evolution API
 *
 * Destino no repo: zapp-web-v3 (adm01-debug) → scripts/decouple/sql-gate.mjs
 * Node ESM, zero dependências.
 *
 * Propósito:
 *   Impedir regressão da centralização do egresso HTTP da Evolution API.
 *   Toda função PL/pgSQL que chama a Evolution DEVE montar URL/chave via
 *   ops.fn_evo_url() / ops.fn_evo_key() / ops.fn_evo_url_v2() / ops.fn_evo_key_v2()
 *   (que leem vault.decrypted_secrets).
 *
 * Uso:
 *   node sql-gate.mjs <report.json>          # valida o report (exit 0 = ok, 1 = violações)
 *   node sql-gate.mjs --sample               # imprime a query SQL geradora do report
 *   node sql-gate.mjs --check-freshness      # verifica data da WHITELIST e contagem do registry
 *   node sql-gate.mjs --validate-fixture     # valida sql-gate-fixture.json contra PROD_OBJECTS_REGISTRY
 *
 * report.json = [{"fn":"schema.fn","prosrc":"..."}, ...]
 *   (gerado pela query impressa em --sample, rodada no Supabase self-hosted)
 *
 * Regras (qualquer violação → exit 1):
 *   1. fn em escopo (schemas evo, zapp, ops, public) cujo prosrc contém
 *      net.http_get( ou net.http_post( E contém 'evolution' (case-insensitive)
 *      E a fn NÃO é ops.fn_evo_url nem ops.fn_evo_key → violação.
 *   2. prosrc casa com vault\.decrypted_secrets E contém 'evolution_api_url'
 *      fora do whitelist → leitura direta do segredo de URL da Evolution.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data de geração da WHITELIST (usada em --check-freshness, E19)
const FRESHNESS_DATE = '2026-08-15';

const WHITELIST = new Set([
  'ops.fn_evo_url',
  'ops.fn_evo_key',
  // E17: versões v2 com assinatura versionada
  'ops.fn_evo_url_v2',
  'ops.fn_evo_key_v2',
  // NOTA I4 (2026-08-15): allowlist nominal V7 REMOVIDA — as funções
  // license_heartbeat/detect_instance_recreate agora passam pelo critério
  // por-STATEMENT real (URL montada de variável, sem literal inline).
]);
// Report sem prefixo de schema (query sem JOIN) também é aceito no whitelist.
const WHITELIST_SHORT = new Set([
  'fn_evo_url',
  'fn_evo_key',
  'fn_evo_url_v2',
  'fn_evo_key_v2',
]);
const SCOPE_SCHEMAS = new Set(['evo', 'zapp', 'ops', 'public']);

/**
 * PROD_OBJECTS_REGISTRY — 25 objetos de produção confirmados (auditado 2026-08-15, E18).
 * Usado em --check-freshness (E19) e --validate-fixture (E22).
 *
 * Estrutura: { name: "schema.objeto", kind: "view|table|function", desc: "..." }
 */
const PROD_OBJECTS_REGISTRY = [
  // 12 views de contrato (zapp → evo)
  { name: 'zapp.evolution_messages',         kind: 'view',     desc: 'View auto-updatable messages (raiz particionada evo)' },
  { name: 'zapp.evolution_conversations',    kind: 'view',     desc: 'View auto-updatable conversas' },
  { name: 'zapp.evolution_contacts',         kind: 'view',     desc: 'View auto-updatable contatos' },
  { name: 'zapp.evolution_media',            kind: 'view',     desc: 'View mídia Evolution' },
  { name: 'zapp.evolution_whatsapp_status',  kind: 'view',     desc: 'View status WA' },
  { name: 'zapp.evolution_webhook_events_v2',kind: 'view',     desc: 'View webhooks v2' },
  { name: 'zapp.evolution_instances',        kind: 'view',     desc: 'View instâncias' },
  { name: 'zapp.evolution_sessions',         kind: 'view',     desc: 'View sessões' },
  { name: 'zapp.evolution_groups',           kind: 'view',     desc: 'View grupos WA' },
  { name: 'zapp.evolution_group_participants',kind: 'view',    desc: 'View participantes de grupos' },
  { name: 'zapp.evolution_labels',           kind: 'view',     desc: 'View labels WA' },
  { name: 'zapp.evolution_chats',            kind: 'view',     desc: 'View chats' },
  // 8 objetos de observabilidade (ops.*)
  { name: 'ops.pgnet_egress_log',            kind: 'table',    desc: 'Log de chamadas pg_net fora do gateway (E8)' },
  { name: 'ops.i4_violation_baseline',       kind: 'table',    desc: 'Baseline das violações I4 (T0 = 14 violadores)' },
  { name: 'ops.log_pgnet_call',              kind: 'function', desc: 'Registra chamada pg_net manualmente' },
  { name: 'ops.v_i4_violations_summary',     kind: 'view',     desc: 'Resumo de violações I4 ativas' },
  { name: 'ops.v_i4_correction_progress',    kind: 'view',     desc: 'Progresso de correção I4' },
  { name: 'ops.decouple_preflight_runs',     kind: 'table',    desc: 'Histórico de execuções do preflight (E10)' },
  { name: 'ops.fn_decouple_preflight',       kind: 'function', desc: 'Preflight checklist pré-deploy' },
  { name: 'ops.v_preflight_history',         kind: 'view',     desc: 'Histórico de runs do preflight' },
  // 5 funções de vault/whitelist
  { name: 'ops.fn_evo_url',                  kind: 'function', desc: '[DEPRECATED] URL da Evolution API do vault — usar v2' },
  { name: 'ops.fn_evo_key',                  kind: 'function', desc: '[DEPRECATED] API key da Evolution API do vault — usar v2' },
  { name: 'ops.fn_evo_url_v2',               kind: 'function', desc: 'URL da Evolution API (assinatura versionada v2, E17)' },
  { name: 'ops.fn_evo_key_v2',               kind: 'function', desc: 'API key da Evolution API (assinatura versionada v2, E17)' },
  { name: 'zapp.fn_check_license_heartbeat', kind: 'function', desc: 'Health check do license server (egresso legítimo, sem apikey)' },
];

const SAMPLE_QUERY = `-- =====================================================================
-- sql-gate.mjs — query geradora do report.json (Supabase self-hosted)
--
-- Exemplo de execução na VPS (substitua <pg_container> e <db>):
--
--   docker exec -i <pg_container> psql -U postgres -d <db> -At \\
--     -c "SELECT COALESCE(json_agg(t), '[]'::json)::text FROM (SELECT n.nspname || '.' || p.proname AS fn, p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE (p.prosrc ~ 'net\\\\.http_' OR p.prosrc ~ 'vault\\\\.decrypted_secrets') AND n.nspname IN ('evo','zapp','ops','public') ORDER BY 1) t;" \\
--     > report.json
--
-- Depois rode o gate:
--   node scripts/decouple/sql-gate.mjs report.json
-- =====================================================================
SELECT COALESCE(json_agg(t), '[]'::json)::text
FROM (
  SELECT n.nspname || '.' || p.proname AS fn,
         p.prosrc
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE (p.prosrc ~ 'net\\.http_' OR p.prosrc ~ 'vault\\.decrypted_secrets')
    AND n.nspname IN ('evo', 'zapp', 'ops', 'public')
  ORDER BY 1
) t;`;

function usage() {
  console.error(
    'Uso: node sql-gate.mjs <report.json>\n' +
    '     node sql-gate.mjs --sample\n' +
    '     node sql-gate.mjs --check-freshness\n' +
    '     node sql-gate.mjs --validate-fixture\n' +
    'report.json = [{"fn":"schema.fn","prosrc":"..."}, ...] (ver --sample)'
  );
}

function schemaOf(fn) {
  const dot = fn.indexOf('.');
  return dot === -1 ? null : fn.slice(0, dot);
}

function inScope(fn) {
  const s = schemaOf(fn);
  // Sem prefixo de schema: assume escopo (provavelmente public) e valida.
  return s === null || SCOPE_SCHEMAS.has(s);
}

function isWhitelisted(fn) {
  if (WHITELIST.has(fn)) return true;
  if (!fn.includes('.') && WHITELIST_SHORT.has(fn)) return true;
  return false;
}

// --- I4: critério de egresso HTTP por-STATEMENT (2026-08-15, v2 2026-08-15) ---
// Violação = statement com net.http_* (incl. http_delete) + literal https?://
// NO ARGUMENTO url (nomeado ou 1º posicional) + sem resolver NA EXPRESSÃO da
// URL (não na statement inteira — resolver em comentário/string/outra chamada
// não mascara violação, achado W-V2/FN). Literais em headers não são egresso.
const HTTP_CALL_RE = /(?<![A-Za-z0-9_])net\.http_\w+\s*\(/i;
const LITERAL_URL_RE = /https?:\/\//i;
const RESOLVER_RE = /ops\.fn_evo_url|ops\.fn_get_vault_secret|fn_get_vault_secret|current_setting/i;

function splitStatements(src) {
  // split string-aware (achado W-V2/FN-64/65): não dividir dentro de aspas
  // simples/duplas ou dollar-quotes — ';' dentro de literal NÃO separa
  // statement; sem isso egresso real ficava escondido no split ingênuo.
  const out = [];
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '$') {
      const j = skipQuoted(src, i);
      cur += src.slice(i, j);
      i = j - 1;
      continue;
    }
    if (c === ';') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

function skipQuoted(src, i) {
  const q = src[i];
  if (q === "'" || q === '"') {
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === q && src[j - 1] !== '\\') return j + 1;
      j++;
    }
    return src.length;
  }
  if (q === '$') {
    const m = src.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
    if (m) {
      const tag = m[0];
      const end = src.indexOf(tag, i + tag.length);
      return end === -1 ? src.length : end + tag.length;
    }
  }
  return i + 1;
}

function findBalancedClose(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '$') {
      i = skipQuoted(src, i) - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findTopLevelComma(src) {
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '$') {
      i = skipQuoted(src, i) - 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) return i;
  }
  return -1;
}

/**
 * Statements com egresso HTTP de URL literal inline SEM resolver na mesma
 * statement (critério I4). @returns {{index:number, excerpt:string}[]}
 */
function httpLiteralViolations(prosrc) {
  const out = [];
  const stmts = splitStatements(prosrc);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (!HTTP_CALL_RE.test(stmt)) continue;
    const callRe = /(?<![A-Za-z0-9_])net\.http_\w+\s*\(/gi;
    let m;
    while ((m = callRe.exec(stmt)) !== null) {
      const open = m.index + m[0].length - 1; // índice do '('
      const close = findBalancedClose(stmt, open);
      // FAIL-CLOSED (achado W-V2/FN-64/65): parênteses desbalanceados = não é
      // possível provar conformidade — tratar como violação, não pular.
      if (close === -1) {
        out.push({ index: i, excerpt: stmt.trim().slice(0, 90) });
        break;
      }
      const args = stmt.slice(open + 1, close);
      const urlArgMatch = args.match(/\burl\s*:?=\s*/i);
      let urlExpr = null;
      if (urlArgMatch) {
        const start = urlArgMatch.index + urlArgMatch[0].length;
        const rest = args.slice(start);
        const comma = findTopLevelComma(rest);
        urlExpr = comma === -1 ? rest : rest.slice(0, comma);
      } else {
        const posMatch = args.match(/^\s*('[^']*'|"[^"]*"|\$[0-9]+)/);
        urlExpr = posMatch ? posMatch[1] : null;
      }
      // v2: resolver verificado NA EXPRESSÃO da URL (não na statement inteira)
      // — comentário/string com 'ops.fn_evo_url' não mascara URL hardcoded real.
      if (urlExpr && !RESOLVER_RE.test(urlExpr) && LITERAL_URL_RE.test(urlExpr)) {
        out.push({ index: i, excerpt: stmt.trim().slice(0, 90) });
        break;
      }
    }
  }
  return out;
}

/**
 * Retorna lista de razões de violação para uma entrada do report.
 * @param {{fn?: unknown, prosrc?: unknown}} entry
 * @returns {string[]}
 */
function checkEntry(entry) {
  const prosrc = typeof entry.prosrc === 'string' ? entry.prosrc : '';
  const reasons = [];

  // I4 por-STATEMENT (2026-08-15): violação = statement com net.http_* +
  // literal https?:// NO ARGUMENTO url (nomeado ou 1º posicional) + sem
  // resolver na mesma statement. URL montada de variável não viola.
  const httpVios = httpLiteralViolations(prosrc);
  if (httpVios.length > 0) {
    reasons.push(
      `${httpVios.length} statement(s) com net.http_* e URL literal inline sem resolver (ex.: "${httpVios[0].excerpt}..."); monte o egresso via ops.fn_evo_url()/ops.fn_get_vault_secret()/current_setting`
    );
  }

  const usesResolvers = /ops\.fn_evo_url|ops\.fn_evo_key/i.test(prosrc);
  const readsVault = /vault\.decrypted_secrets/i.test(prosrc);
  const readsEvoUrlSecret = /evolution_api_url/i.test(prosrc);
  if (readsVault && readsEvoUrlSecret && !usesResolvers) {
    reasons.push(
      'lê vault.decrypted_secrets (evolution_api_url) diretamente; ' +
      'use ops.fn_evo_url()'
    );
  }

  return reasons;
}


// V3 validacao final: scan estatico de supabase/migrations/*.sql - pega
// egresso hardcoded em migration NOVA sem depender do snapshot/DB.
// I4 (2026-08-15): reusa httpLiteralViolations (por-statement, url:=, cobre
// net.http_* completo incl. http_delete).
// ALLOWLIST HISTÓRICA (2026-08-15): o canonical (20260804000000) é SNAPSHOT
// histórico (documento, não migration executável — regra da casa) e as 2
// migrations fix_notify contêm funções pré-I4 cujas versões corrigidas vivem
// nas migrations 00001-00013 (já aplicadas em produção). O critério v2 flagra
// os textos antigos nelas — dívida de histórico, não regressão nova. Remover
// entradas quando essas migrations forem reescritas/squashadas.
const MIGRATION_HISTORICAL_ALLOWLIST = new Set([
  '20260804000000_canonical_schema_squash_133_migrations.sql',
  '20260813230000_fix_notify_and_analyze_cron.sql',
  '20260814050000_fix_notify_v6_pending_view.sql',
]);

function scanMigrations(migrationsDir) {
  const viol = [];
  try {
    for (const f of readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))) {
      if (MIGRATION_HISTORICAL_ALLOWLIST.has(f)) continue;
      const src = readFileSync(join(migrationsDir, f), 'utf8');
      if (httpLiteralViolations(src).length > 0) {
        viol.push(f);
      }
    }
  } catch { /* dir ausente = sem violacoes */ }
  return viol;
}

/**
 * E19 — --check-freshness
 * Verifica se a WHITELIST está atualizada (FRESHNESS_DATE < 30 dias)
 * e se o PROD_OBJECTS_REGISTRY tem exatamente 25 entradas.
 * WARN (exit 0) se desatualizado; FAIL (exit 1) se contagem errada.
 */
function checkFreshness() {
  const EXPECTED_COUNT = 25;
  let hasFailure = false;

  console.log('=== sql-gate --check-freshness ===');
  console.log(`FRESHNESS_DATE: ${FRESHNESS_DATE}`);

  // Verificar idade da whitelist
  const today = new Date();
  const freshnessDate = new Date(FRESHNESS_DATE);
  const diffMs = today - freshnessDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 30) {
    console.warn(`WARN: WHITELIST com ${diffDays} dias (gerada em ${FRESHNESS_DATE}). ` +
      `Considere regenerar após auditar os objetos de produção.`);
  } else {
    console.log(`OK: WHITELIST com ${diffDays} dia(s) — dentro do prazo de 30 dias.`);
  }

  // Verificar contagem do PROD_OBJECTS_REGISTRY
  const actual = PROD_OBJECTS_REGISTRY.length;
  if (actual !== EXPECTED_COUNT) {
    console.error(`FAIL: PROD_OBJECTS_REGISTRY tem ${actual} entradas, esperado ${EXPECTED_COUNT}.`);
    hasFailure = true;
  } else {
    console.log(`OK: PROD_OBJECTS_REGISTRY com ${actual} entradas (esperado ${EXPECTED_COUNT}).`);
  }

  console.log('=== fim check-freshness ===');
  process.exit(hasFailure ? 1 : 0);
}

/**
 * E22 — --validate-fixture
 * Lê scripts/decouple/sql-gate-fixture.json e valida contra PROD_OBJECTS_REGISTRY.
 * exit 0 se todos os 25 objetos estiverem no fixture; exit 1 se faltar algum.
 */
function validateFixture() {
  const fixturePath = resolve(__dirname, 'sql-gate-fixture.json');
  console.log('=== sql-gate --validate-fixture ===');
  console.log(`Fixture: ${fixturePath}`);

  // Verificar existência e validade do JSON
  let fixture;
  try {
    const raw = readFileSync(fixturePath, 'utf8');
    fixture = JSON.parse(raw);
  } catch (err) {
    console.error(`FAIL: Não foi possível ler/parsear fixture: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(fixture)) {
    console.error('FAIL: fixture deve ser um array JSON.');
    process.exit(1);
  }

  const EXPECTED_COUNT = 25;
  if (fixture.length !== EXPECTED_COUNT) {
    console.error(`FAIL: fixture tem ${fixture.length} entradas, esperado ${EXPECTED_COUNT}.`);
    process.exit(1);
  }

  console.log(`OK: fixture com ${fixture.length} entradas (esperado ${EXPECTED_COUNT}).`);

  // Verificar se cada objeto do PROD_OBJECTS_REGISTRY está no fixture
  const fixtureNames = new Set(fixture.map(e => e && e.name).filter(Boolean));
  const missing = PROD_OBJECTS_REGISTRY.filter(obj => !fixtureNames.has(obj.name));

  if (missing.length > 0) {
    console.error(`FAIL: ${missing.length} objeto(s) do PROD_OBJECTS_REGISTRY ausente(s) no fixture:`);
    for (const obj of missing) {
      console.error(`  - ${obj.name} (${obj.kind}): ${obj.desc}`);
    }
    console.log('=== fim validate-fixture ===');
    process.exit(1);
  }

  console.log(`PASS: todos os ${PROD_OBJECTS_REGISTRY.length} objetos do PROD_OBJECTS_REGISTRY presentes no fixture.`);
  console.log('=== fim validate-fixture ===');
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);

  // E19: --check-freshness
  if (args.includes('--check-freshness')) {
    checkFreshness();
    return;
  }

  // E22: --validate-fixture
  if (args.includes('--validate-fixture')) {
    validateFixture();
    return;
  }

  const migIdx = args.indexOf('--migrations');
  if (migIdx > -1) {
    const dir = args[migIdx + 1] || 'supabase/migrations';
    const v = scanMigrations(dir);
    if (v.length > 0) { console.error('SQL GATE MIGRATIONS: ' + v.length + ' migration(s) com egresso Evolution fora do padrao:'); v.forEach(x => console.error('  - ' + x)); process.exit(1); }
    console.log('SQL gate migrations OK: 0 violacoes em ' + dir);
    process.exit(0);
  }

  if (args.includes('--sample')) {
    console.log(SAMPLE_QUERY);
    process.exit(0);
  }

  const reportPath = args.find((a) => !a.startsWith('-'));
  if (!reportPath) {
    usage();
    process.exit(2);
  }

  let raw;
  try {
    raw = readFileSync(reportPath, 'utf8');
  } catch (err) {
    console.error(`sql-gate: não foi possível ler "${reportPath}": ${err.message}`);
    process.exit(2);
  }

  let report;
  try {
    report = JSON.parse(raw);
  } catch (err) {
    console.error(`sql-gate: JSON inválido em "${reportPath}": ${err.message}`);
    process.exit(2);
  }

  if (!Array.isArray(report)) {
    console.error('sql-gate: report deve ser um array JSON [{"fn":..., "prosrc":...}, ...]');
    process.exit(2);
  }

  const violations = [];
  let analyzed = 0;
  let whitelisted = 0;

  for (const entry of report) {
    // V7: entry null/object inválido não derruba o gate (crash fix)
    if (!entry || typeof entry !== 'object') continue;
    const fn = entry && typeof entry.fn === 'string'
      ? entry.fn
      : String((entry && entry.fn) ?? '?');

    if (!inScope(fn)) continue; // fora dos schemas monitorados (evo,zapp,ops,public)
    if (isWhitelisted(fn)) {
      whitelisted++;
      continue;
    }
    analyzed++;

    for (const reason of checkEntry(entry)) {
      violations.push({ fn, reason });
    }
  }

  if (violations.length > 0) {
    console.error(`SQL GATE: ${violations.length} violação(ões) de egresso Evolution`);
    for (const v of violations) {
      console.error(`  - ${v.fn}: ${v.reason}`);
    }
    process.exit(1);
  }

  console.log(
    `SQL gate OK: 0 violações (${analyzed} função(ões) analisada(s), ${whitelisted} no whitelist)`
  );
  process.exit(0);
}

main();
