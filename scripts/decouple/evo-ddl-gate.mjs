#!/usr/bin/env node
/**
 * evo-ddl-gate.mjs — Gate E42: bloqueia DDL NOVO em schema `evo`
 *
 * Contexto (Onda Fase 3):
 *   O schema `evo` (dados WhatsApp/Evolution) é tratado como fronteira: a
 *   infra da Evolution vive no repo adm01-debug/evolution-stack e o schema
 *   `evo` não deve receber DDL novo via migrations deste repo sem revisão.
 *   Este gate falha (exit 1) qualquer migration NOVA que execute DDL em
 *   `evo` — detecção por regex de statement:
 *     (CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT ON) + referência \bevo\.
 *
 * Modos:
 *   node evo-ddl-gate.mjs --allowlist auto
 *       Gera allowlist do estado atual (todas as migrations existentes com
 *       DDL em evo) e valida os candidatos contra ela.
 *   node evo-ddl-gate.mjs --allowlist auto --files "a.sql,b.sql"
 *       Candidatos explícitos (separados por vírgula/espaço/nova linha).
 *   CHANGED_FILES="supabase/migrations/x.sql
 *   supabase/migrations/y.sql" node evo-ddl-gate.mjs --allowlist auto
 *       Candidatos via env CHANGED_FILES (newline-separated) — usado pelo
 *       workflow .github/workflows/evo-ddl-gate.yml.
 *
 * Semântica da allowlist:
 *   - Sem candidatos explícitos (verificação local / estado atual):
 *     allowlist = TODAS as migrations existentes com DDL em evo
 *     → 0 violações (exit 0). É o modo que valida o estado atual do repo.
 *   - Com candidatos explícitos (CI via CHANGED_FILES/--files): os candidatos
 *     são EXCLUÍDOS da allowlist (o estado "atual" é o baseline sem o PR);
 *     qualquer candidato com DDL em evo é violação NOVA → exit 1 com lista.
 *
 * Exit: 0 = sem violações novas; 1 = violação(ões) listada(s).
 * Node ESM, zero dependências externas (node 20).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const DEFAULT_MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations');

// DDL statement-start keywords (spec E42) — statement precisa COMEÇAR com
// um destes E conter \bevo\. em qualquer ponto (multi-linha incluso).
const DDL_START_RE = /^\s*(?:CREATE|ALTER|DROP|GRANT|REVOKE|COMMENT\s+ON)\b/i;
// v2 (achado W-V3, 2026-08-15): aspas opcionais no schema — `"evo".x` era bypass
const EVO_SCHEMA_RE = /(?<![A-Za-z0-9_])["']?evo["']?\./i;

/**
 * Scanner string/comment-aware:
 *  - remove comentários `--` e `/* *​/` (fora de strings)
 *  - preserva strings '...', "...", $tag$...$tag$
 *  - divide em statements no `;` fora de strings/comentários
 * @param {string} sql
 * @returns {string[]}
 */
function scanStatements(sql) {
  const out = [];
  let cur = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {            // comentário de linha
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {            // comentário de bloco
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      continue;
    }
    if (c === "'") {                            // string '...' (escape '')
      cur += c;
      i++;
      while (i < n) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { cur += "''"; i += 2; continue; }
          cur += "'"; i++;
          break;
        }
        cur += sql[i]; i++;
      }
      continue;
    }
    if (c === '"') {                            // identifier "..." (escape "")
      cur += c;
      i++;
      while (i < n) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') { cur += '""'; i += 2; continue; }
          cur += '"'; i++;
          break;
        }
        cur += sql[i]; i++;
      }
      continue;
    }
    if (c === '$') {                            // dollar-quote $tag$...$tag$
      const m = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        cur += tag;
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }
    if (c === ';') {                            // fim de statement
      out.push(cur);
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/**
 * Statements de DDL em schema evo dentro de um arquivo.
 * @param {string} sql
 * @returns {string[]} statements (normalizados p/ 1 linha, truncados)
 */
function evoDdlStatements(sql) {
  return scanStatements(sql)
    .filter((stmt) => DDL_START_RE.test(stmt) && EVO_SCHEMA_RE.test(stmt))
    .map((stmt) => stmt.trim().replace(/\s+/g, ' ').slice(0, 140));
}

/** @param {string} filePath @returns {string[]} */
function evoDdlInFile(filePath) {
  return evoDdlStatements(readFileSync(filePath, 'utf8'));
}

/** @param {string} dir @returns {string[]} basenames *.sql ordenados */
function listSqlFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql') && statSync(join(dir, f)).isFile())
      .sort();
  } catch {
    return [];
  }
}

function usage() {
  console.error(
    'Uso: node evo-ddl-gate.mjs --allowlist auto [--files "a.sql,b.sql"]\n' +
    '     CHANGED_FILES="<newline-separated paths>" node evo-ddl-gate.mjs --allowlist auto\n' +
    '     [--migrations-dir <dir>]  (default: supabase/migrations do repo)\n'
  );
}

function main() {
  const args = process.argv.slice(2);
  const allowlistAuto = args.includes('--allowlist') && args.includes('auto');
  if (!allowlistAuto) {
    usage();
    process.exit(2);
  }

  const dirIdx = args.indexOf('--migrations-dir');
  const migrationsDir =
    dirIdx > -1 && args[dirIdx + 1] ? resolve(args[dirIdx + 1]) : DEFAULT_MIGRATIONS_DIR;

  // --- candidatos -------------------------------------------------------
  const filesIdx = args.indexOf('--files');
  const envChanged = process.env.CHANGED_FILES;
  let candidates = [];
  let explicit = false;
  if (filesIdx > -1 && args[filesIdx + 1]) {
    candidates = args[filesIdx + 1].split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    explicit = true;
  } else if (envChanged) {
    candidates = envChanged.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    explicit = true;
  }

  const allFiles = listSqlFiles(migrationsDir);
  const allWithEvoDdl = allFiles.filter((f) => evoDdlInFile(join(migrationsDir, f)).length > 0);

  // --- allowlist auto ---------------------------------------------------
  // Estado atual = migrations existentes com DDL em evo. Em CI, candidatos
  // são excluídos (baseline = estado SEM o PR) → DDL evo novo = violação.
  let allowlist;
  if (explicit) {
    const candNames = new Set(candidates.map((c) => basename(c)));
    allowlist = new Set(allWithEvoDdl.filter((n) => !candNames.has(n)));
  } else {
    allowlist = new Set(allWithEvoDdl);
  }

  // --- resolução + checagem ---------------------------------------------
  const violations = [];
  const allowlistedCount = [];
  let checked = 0;
  let skipped = 0;

  const scanTargets = explicit ? candidates : allFiles;
  for (const cand of scanTargets) {
    if (!cand.endsWith('.sql')) { skipped++; continue; }
    // resolve: path absoluto, path repo-relativo ou basename avulso
    let fileAbs = null;
    const abs = isAbsolute(cand) ? cand : join(REPO_ROOT, cand);
    if (existsSync(abs)) fileAbs = abs;
    else if (existsSync(join(migrationsDir, basename(cand)))) {
      fileAbs = join(migrationsDir, basename(cand));
    }
    if (!fileAbs) { skipped++; continue; } // deletado/inexistente no checkout
    const name = basename(fileAbs);
    const ddl = evoDdlInFile(fileAbs);
    if (ddl.length === 0) { checked++; continue; }
    checked++;
    if (allowlist.has(name)) {
      allowlistedCount.push(name);
      continue;
    }
    violations.push({ file: cand, ddl });
  }

  // --- report ------------------------------------------------------------
  console.log('=== evo-ddl-gate (E42) ===');
  console.log(`migrations dir: ${migrationsDir}`);
  console.log(`migrations existentes: ${allFiles.length}`);
  console.log(`allowlist auto (estado atual, DDL em evo): ${allWithEvoDdl.length} arquivo(s)`);
  console.log(
    `candidatos: ${explicit ? candidates.length : allFiles.length}` +
    ` (${explicit ? 'CHANGED_FILES/--files' : 'scan completo do estado atual'})` +
    ` | verificados: ${checked} | no allowlist: ${allowlistedCount.length} | ignorados: ${skipped}`
  );

  if (violations.length > 0) {
    console.error(`\nEVO DDL GATE: ${violations.length} violação(ões) NOVA(s) — DDL em schema evo fora do allowlist:`);
    for (const v of violations) {
      console.error(`  - ${v.file}`);
      for (const stmt of v.ddl.slice(0, 3)) {
        console.error(`      ${stmt}`);
      }
    }
    console.error(
      '\nO schema evo é fronteira: DDL novo nele deve ser revisado (contrato zapp→evo) ' +
      'e registrado explicitamente. Nenhuma migration existente foi alterada.'
    );
    process.exit(1);
  }

  console.log(`EVO DDL GATE OK: 0 violações novas em schema evo (exit 0)`);
  process.exit(0);
}

main();
