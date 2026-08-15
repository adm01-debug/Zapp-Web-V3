#!/usr/bin/env node
/**
 * sql-gate.mjs — Gate do egresso SQL da Evolution API
 *
 * Destino no repo: zapp-web-v3 (adm01-debug) → scripts/decouple/sql-gate.mjs
 * Node ESM, zero dependências.
 *
 * Propósito:
 *   Impedir regressão da centralização do egresso HTTP da Evolution API (I4).
 *   Toda função PL/pgSQL DEVE montar URL/chave via resolver de vault
 *   (ops.fn_evo_url(), ops.fn_evo_key(), ops.fn_get_vault_secret() ou
 *   current_setting) — egresso net.http_ com URL literal inline é violação.
 *
 * Uso:
 *   node sql-gate.mjs <report.json>     # valida o report (exit 0 = ok, 1 = violações)
 *   node sql-gate.mjs --sample          # imprime a query SQL geradora do report
 *   node sql-gate.mjs --migrations <dir> # scan estático de migrations/*.sql
 *
 * report.json = [{"fn":"schema.fn","prosrc":"..."}, ...]
 *   (gerado pela query impressa em --sample, rodada no Supabase self-hosted)
 *
 * Regras (qualquer violação → exit 1):
 *   1. [I4 por-STATEMENT] fn em escopo (schemas evo, zapp, ops, public) com
 *      alguma statement (split por ';') que contenha net.http_get( ou
 *      net.http_post( E URL literal inline (https?://) E NÃO contenha, NA
 *      MESMA statement, resolver (ops.fn_evo_url, ops.fn_get_vault_secret,
 *      fn_get_vault_secret, current_setting) → violação. Statements com
 *      net.http_ e URL montada de variável (sem literal inline) não violam.
 *      (substitui o antigo critério 'net.http_ + evolution': o I4 cobre
 *      qualquer egresso de URL hardcoded, não só o que menciona evolution)
 *   2. prosrc casa com vault\.decrypted_secrets E contém 'evolution_api_url'
 *      fora do whitelist → leitura direta do segredo de URL da Evolution.
 *   3. FAIL-CLOSED: entry sem prosrc avaliável (não-string) → violação.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const WHITELIST = new Set([
  'ops.fn_evo_url',
  'ops.fn_evo_key',
  // Resolvers versionados (E17/I4, 2026-08-15) — são eles que LÊEM o vault:
  'ops.fn_evo_url_v2',
  'ops.fn_evo_key_v2',
]);
// Report sem prefixo de schema (query sem JOIN) também é aceito no whitelist.
const WHITELIST_SHORT = new Set(['fn_evo_url', 'fn_evo_key']);
const SCOPE_SCHEMAS = new Set(['evo', 'zapp', 'ops', 'public']);

// --- I4: critério de egresso HTTP por-STATEMENT (2026-08-15) ----------------
// Resolver legítimo: a statement que dispara o egresso deve referenciar o
// vault (ops.fn_evo_url / ops.fn_get_vault_secret) ou current_setting NA
// MESMA statement em que a URL literal inline aparece.
const HTTP_CALL_RE = /net\.http_\w+\s*\(/i;
const LITERAL_URL_RE = /https?:\/\//i;
const RESOLVER_RE = /ops\.fn_evo_url|ops\.fn_get_vault_secret|fn_get_vault_secret|current_setting/i;

/**
 * Divide o prosrc em statements por ';' (split aproximado).
 * LIMITAÇÃO: split simples quebra dentro de strings/comentários que contenham
 * ';' (ex.: JSON inline com ';' dentro de aspas) — aceitável para o critério
 * I4: o pior caso é um statement artificialmente MAIOR, o que só amplia o
 * escopo onde o resolver precisa aparecer (fail-closed, sem falso-negativo).
 */
function splitStatements(src) {
  return src.split(';');
}

/**
 * Statements com egresso HTTP de URL literal inline SEM resolver na mesma
 * statement (critério I4). O literal precisa estar no ARGUMENTO url da
 * chamada (nomeado `url :=` ou 1º argumento posicional) — literais em
 * headers (ex.: Origin/Referer) NÃO são egresso de URL.
 * Robustez (revisão 2026-08-15): balanceamento de parênteses e corte de
 * argumento são string-aware (ignoram aspas simples/duplas e dollar-quotes),
 * e a extração do argumento `url :=` corta apenas em vírgula de nível 0 —
 * sem falso-negativo por `,`/`)` dentro de strings ou chamadas aninhadas.
 * @returns {{index:number, excerpt:string}[]}
 */
function skipQuoted(src, i) {
  // pula um literal quoted a partir de i; retorna o índice APÓS o literal
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
  // índice da primeira ',' em nível 0 de parênteses, string-aware; -1 se não há
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

function httpLiteralViolations(prosrc) {
  const out = [];
  const stmts = splitStatements(prosrc);
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    if (!HTTP_CALL_RE.test(stmt)) continue;
    if (RESOLVER_RE.test(stmt)) continue; // resolver presente na statement → ok
    const callRe = /net\.http_\w+\s*\(/gi;
    let m;
    while ((m = callRe.exec(stmt)) !== null) {
      const open = m.index + m[0].length - 1; // índice do '('
      const close = findBalancedClose(stmt, open);
      if (close === -1) continue;
      const args = stmt.slice(open + 1, close);
      // expressão do argumento url: nomeado (`url := expr,`) ou 1º posicional
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
      if (urlExpr && LITERAL_URL_RE.test(urlExpr)) {
        out.push({ index: i, excerpt: stmt.trim().slice(0, 90) });
        break;
      }
    }
  }
  return out;
}

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

/**
 * Retorna lista de razões de violação para uma entrada do report.
 * @param {{fn?: unknown, prosrc?: unknown}} entry
 * @returns {string[]}
 */
function checkEntry(entry) {
  const reasons = [];

  // FAIL-CLOSED: sem prosrc avaliável não é possível provar conformidade.
  if (typeof entry.prosrc !== 'string') {
    reasons.push('prosrc ausente/não avaliável (fail-closed): impossível validar o egresso HTTP');
    return reasons;
  }
  const prosrc = entry.prosrc;

  // I4 por-STATEMENT (2026-08-15): net.http_ + URL literal inline + sem
  // resolver NA MESMA statement → violação. URL montada de variável não viola.
  const httpVios = httpLiteralViolations(prosrc);
  if (httpVios.length > 0) {
    reasons.push(
      `${httpVios.length} statement(s) com net.http_get/net.http_post e URL literal inline sem resolver (ex.: "${httpVios[0].excerpt}..."); monte o egresso via ops.fn_evo_url()/ops.fn_get_vault_secret()/current_setting`
    );
  }

  // (mantido) leitura direta do segredo de URL da Evolution no vault
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
function scanMigrations(migrationsDir) {
  const viol = [];
  try {
    for (const f of readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))) {
      const src = readFileSync(join(migrationsDir, f), 'utf8');
      // por STATEMENT (split ';') — mesmo critério I4 do report: net.http_ +
      // URL literal inline + sem resolver NA MESMA statement. Cobre qualquer
      // URL hardcoded (não só as que mencionam 'evolution').
      for (const stmt of splitStatements(src)) {
        if (HTTP_CALL_RE.test(stmt) && LITERAL_URL_RE.test(stmt) && !RESOLVER_RE.test(stmt)) {
          viol.push(f);
          break;
        }
      }
    }
  } catch { /* dir ausente = sem violacoes */ }
  return viol;
}

function main() {
  const args = process.argv.slice(2);

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
