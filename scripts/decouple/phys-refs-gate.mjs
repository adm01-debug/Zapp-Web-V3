#!/usr/bin/env node
/**
 * E71 — phys-refs-gate.mjs
 *
 * Gate de referências físicas: bloqueia referências físicas QUALIFICADAS NOVAS
 * a tabelas físicas `zapp.evolution_*` em migrations novas:
 *   zapp.evolution_messages, zapp.evolution_contacts, zapp.evolution_conversations
 *
 * Contexto (pós-desacoplamento 2026-08-12): o schema-dono do dado Evolution é
 * `evo`. `zapp.evolution_*` são cópias em transição; refs físicas novas
 * (SELECT/JOIN/INSERT direto) acoplam migrations ao layout físico dessas
 * tabelas. O caminho permitido é o contrato curado (views `public.*` + RPCs).
 *
 * Uso:
 *   # CI (CHANGED_FILES = lista de paths separada por \n, filtrada a supabase/migrations/*.sql):
 *   CHANGED_FILES="supabase/migrations/xxx.sql
 *   supabase/migrations/yyy.sql" node scripts/decouple/phys-refs-gate.mjs --allowlist auto
 *
 *   # Local (--files aceita lista separada por espaço/vírgula/\n):
 *   node scripts/decouple/phys-refs-gate.mjs --allowlist auto --files "supabase/migrations/xxx.sql"
 *
 *   # Allowlist explícita em arquivo (um basename por linha, # = comentário):
 *   node scripts/decouple/phys-refs-gate.mjs --allowlist scripts/decouple/phys-refs-allowlist.txt --files "..."
 *
 * Modos de allowlist:
 *   auto   — gera a allowlist do ESTADO ATUAL do diretório de migrations
 *            (arquivos que já contêm refs), EXCLUINDO os arquivos sob scan —
 *            assim uma migration nova com ref nunca se auto-permite em CI.
 *   <path> — lê a allowlist de um arquivo commitado.
 *
 * Exit: 0 se nenhuma violação NOVA; 1 se alguma migration escaneada contém
 *       ref física fora da allowlist.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const MIGRATION_DIR = 'supabase/migrations';

// Ref física QUALIFICADA às 3 tabelas canônicas do mirror zapp (não pega
// partições: \b falha antes de '_wpp2' etc.).
// v2 (achado W-V3, 2026-08-15): case-insensitive + aspas opcionais no schema e
// na tabela — `zapp."evolution_messages"`, `"zapp".evolution_messages` e
// `ZAPP.EVOLUTION_MESSAGES` eram bypasses. `(?![\w])` exclui partições
// (_wpp2 etc.) mesmo com aspas opcionais antes do fim.
const REF_RE = /(?<![A-Za-z0-9_])["']?zapp["']?\.["']?evolution_(messages|contacts|conversations)(?![\w])/gi;

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { allowlist: 'auto', allowlistPath: null, filesArg: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--allowlist') {
      const v = argv[i + 1];
      if (v && v !== 'auto') { opts.allowlist = 'file'; opts.allowlistPath = v; }
      i++;
    } else if (a === '--files') {
      opts.filesArg = argv[i + 1];
      i++;
    } else {
      console.error(`❌ argumento desconhecido: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

// ── scan ────────────────────────────────────────────────────────────────────
function collectScannedFiles(opts) {
  let raw = '';
  if (process.env.CHANGED_FILES) raw += process.env.CHANGED_FILES + '\n';
  if (opts.filesArg) raw += opts.filesArg + '\n';
  const paths = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const files = [];
  for (const p of paths) {
    if (p.startsWith(MIGRATION_DIR + '/') && p.endsWith('.sql')) files.push(p);
  }
  return [...new Set(files)];
}

function listMigrationFiles() {
  try {
    return readdirSync(MIGRATION_DIR)
      .filter(f => /^\d{14}_.*\.sql$/.test(f))
      .sort();
  } catch {
    return [];
  }
}

function findRefs(content, file) {
  const hits = [];
  REF_RE.lastIndex = 0;
  let m;
  while ((m = REF_RE.exec(content)) !== null) {
    hits.push({
      file,
      line: content.slice(0, m.index).split('\n').length,
      ref: m[0],
    });
  }
  return hits;
}

function buildAllowlist(scanned) {
  // ESTADO ATUAL: arquivos que JÁ contêm refs físicas, menos os sob scan.
  const allowed = new Set();
  for (const f of listMigrationFiles()) {
    const rel = MIGRATION_DIR + '/' + f;
    if (scanned.has(rel)) continue; // arquivo sob scan nunca se auto-permite
    let content;
    try { content = readFileSync(rel, 'utf8'); } catch { continue; }
    REF_RE.lastIndex = 0;
    if (REF_RE.test(content)) allowed.add(f);
  }
  return allowed;
}

function readAllowlistFile(path) {
  const allowed = new Set();
  let content;
  try { content = readFileSync(path, 'utf8'); } catch (e) {
    console.error(`❌ não foi possível ler allowlist: ${path} (${e.message})`);
    process.exit(2);
  }
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t && !t.startsWith('#')) allowed.add(t);
  }
  return allowed;
}

// ── main ────────────────────────────────────────────────────────────────────
const opts = parseArgs(process.argv.slice(2));
const scannedFiles = collectScannedFiles(opts);
const scannedSet = new Set(scannedFiles);

const allowlist = opts.allowlist === 'file'
  ? readAllowlistFile(opts.allowlistPath)
  : buildAllowlist(scannedSet);

const hr = '═'.repeat(64);
console.log(`\n${hr}`);
console.log('  E71 — PHYS REFS GATE (zapp.evolution_messages|contacts|conversations)');
console.log(hr);
console.log(`  Allowlist: ${opts.allowlist === 'auto' ? `auto (estado atual, ${allowlist.size} arquivo(s))` : opts.allowlistPath}`);
console.log(`  Arquivos sob scan: ${scannedFiles.length}`);

if (opts.allowlist === 'auto' && allowlist.size > 0) {
  console.log('  ── Allowlist atual (refs pré-existentes):');
  for (const f of [...allowlist].sort()) console.log(`     ${f}`);
}

if (scannedFiles.length === 0) {
  console.log('  ✅ OK: nenhuma migration nova para escanear (CHANGED_FILES/--files vazio).');
  console.log(`${hr}\n`);
  process.exit(0);
}

const violations = [];
for (const file of scannedFiles) {
  let content;
  try { content = readFileSync(file, 'utf8'); } catch (e) {
    console.warn(`  ⚠️  arquivo não encontrado, pulando: ${file}`);
    continue;
  }
  const hits = findRefs(content, file);
  if (hits.length === 0) continue;
  if (!allowlist.has(basename(file))) violations.push(...hits);
}

if (violations.length > 0) {
  console.log('  ❌ VIOLAÇÕES NOVAS (ref física a zapp.evolution_* fora da allowlist):');
  for (const v of violations) {
    console.log(`     ${v.file}:${v.line}  ${v.ref}`);
  }
  console.log('     ─────────────────────────────────────────────────────────────');
  console.log('     Migrations são imutáveis: crie um arquivo NOVO e use o contrato');
  console.log('     curado (views public.* / RPCs) em vez de ref física direta.');
  console.log(`${hr}`);
  console.error(`❌ FALHOU: ${violations.length} violação(ões) nova(s) de ref física.`);
  console.log(`${hr}\n`);
  process.exit(1);
}

console.log(`  ✅ OK: ${scannedFiles.length} migration(s) escaneada(s), 0 violações novas.`);
console.log(`${hr}\n`);
process.exit(0);
