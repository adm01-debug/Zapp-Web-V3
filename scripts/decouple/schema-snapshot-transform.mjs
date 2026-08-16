#!/usr/bin/env node
// E41: transforma dump pg_dump --schema-only (schema evo) em SQL idempotente.
// Uso: node e41-transform.mjs <input.sql> <output.sql>
//
// Estrategia: split statement-a-statement respeitando dollar-quoting/strings,
// classifica cada statement pela primeira palavra-chave SQL (ignorando
// comentarios "--" precedentes) e aplica a regra de idempotencia correspondente.

import fs from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('uso: node e41-transform.mjs <input.sql> <output.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(inputPath, 'utf8');

// ---------------------------------------------------------------------------
// 1. Splitter statement-safe (respeita '--' line comments, 'strings', "idents"
//    e $tag$ dollar-quoting, sem parsing recursivo dentro do dollar-quote).
// ---------------------------------------------------------------------------
function splitStatements(text) {
  const stmts = [];
  const n = text.length;
  let i = 0;
  let start = 0;

  while (i < n) {
    const c = text[i];

    if (c === '-' && text[i + 1] === '-') {
      let j = text.indexOf('\n', i);
      if (j === -1) j = n;
      i = j + 1;
      continue;
    }

    if (c === "'") {
      i++;
      while (i < n) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === '"') {
      i++;
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') { i += 2; continue; }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === '$') {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
      if (text[j] === '$') {
        const tag = text.slice(i, j + 1);
        const closeIdx = text.indexOf(tag, j + 1);
        if (closeIdx !== -1) {
          i = closeIdx + tag.length;
          continue;
        }
        i++;
        continue;
      }
      i++;
      continue;
    }

    if (c === ';') {
      stmts.push(text.slice(start, i + 1));
      start = i + 1;
      i++;
      continue;
    }

    i++;
  }

  if (start < n) {
    const rest = text.slice(start);
    if (rest.trim().length) stmts.push(rest);
  }

  return stmts;
}

const rawStatements = splitStatements(sql);

// ---------------------------------------------------------------------------
// 2. Classificacao + transformacao por statement.
// ---------------------------------------------------------------------------
function stripLeadingComments(text) {
  return text.replace(/^(\s*--[^\n]*\n)+\s*/, '');
}

let guardCounter = 0;
function uniqueTag(body, prefix) {
  let tag;
  do {
    guardCounter++;
    tag = `$${prefix}${guardCounter}$`;
  } while (body.includes(tag));
  return tag;
}

function wrapGuard(stmtSql, exceptionClause, prefix) {
  // separa o cabecalho "-- Name: ..." (se houver) do corpo SQL, para que o
  // comentario fique legivel ANTES do "DO $tag$" em vez de dentro do BEGIN/END
  const commentMatch = stmtSql.match(/^(\s*(?:--[^\n]*\n)+\s*)/);
  const leadingComment = commentMatch ? commentMatch[1] : '';
  const body = stmtSql.slice(leadingComment.length).trim().replace(/;\s*$/, '');
  const tag = uniqueTag(body, prefix);
  return `${leadingComment}DO ${tag}\nBEGIN\n  ${body};\nEXCEPTION ${exceptionClause} THEN NULL;\nEND\n${tag};`;
}

const counts = { before: {}, after: {} };
function bump(bucket, type) {
  counts[bucket][type] = (counts[bucket][type] || 0) + 1;
}

const unclassified = [];
const removed = [];
const out = [];

for (const rawStmt of rawStatements) {
  const body = stripLeadingComments(rawStmt);
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    // comentario/whitespace sem SQL (ex: cabecalho final do dump) — preserva verbatim
    out.push(rawStmt);
    continue;
  }

  let type = null;
  let transformed = rawStmt;

  const startsWith = (re) => re.test(trimmedBody);

  // --- SCHEMA ---
  if (startsWith(/^CREATE SCHEMA\s+(?!IF NOT EXISTS)/i)) {
    type = 'SCHEMA';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE SCHEMA\s+(?!IF NOT EXISTS)/i, 'CREATE SCHEMA IF NOT EXISTS ');
    bump('after', type);
  }
  // --- TABLE (inclui PARTITION OF) ---
  else if (startsWith(/^CREATE TABLE\s+(?!IF NOT EXISTS)/i)) {
    type = trimmedBody.includes('PARTITION OF') ? 'TABLE_PARTITION_OF' : 'TABLE';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE TABLE IF NOT EXISTS ');
    bump('after', type);
  }
  // --- FOREIGN TABLE (nao listado nas regras explicitas — tratado por analogia a TABLE) ---
  else if (startsWith(/^CREATE FOREIGN TABLE\s+(?!IF NOT EXISTS)/i)) {
    type = 'FOREIGN_TABLE';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE FOREIGN TABLE\s+(?!IF NOT EXISTS)/i, 'CREATE FOREIGN TABLE IF NOT EXISTS ');
    bump('after', type);
  }
  // --- SEQUENCE ---
  else if (startsWith(/^CREATE SEQUENCE\s+(?!IF NOT EXISTS)/i)) {
    type = 'SEQUENCE';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE SEQUENCE\s+(?!IF NOT EXISTS)/i, 'CREATE SEQUENCE IF NOT EXISTS ');
    bump('after', type);
  }
  // --- INDEX (UNIQUE ou nao) ---
  else if (startsWith(/^CREATE (UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS|CONCURRENTLY)/i)) {
    type = 'INDEX';
    bump('before', type);
    transformed = rawStmt.replace(
      /CREATE (UNIQUE\s+)?INDEX\s+(?!IF NOT EXISTS)/i,
      (m, uniq) => `CREATE ${uniq ? uniq.trim() + ' ' : ''}INDEX IF NOT EXISTS `,
    );
    bump('after', type);
  }
  // --- FUNCTION ---
  else if (startsWith(/^CREATE FUNCTION\s+/i)) {
    type = 'FUNCTION';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE FUNCTION\s+/i, 'CREATE OR REPLACE FUNCTION ');
    bump('after', type);
  }
  // --- PROCEDURE (nao listado nas regras explicitas — PG15 suporta OR REPLACE PROCEDURE) ---
  else if (startsWith(/^CREATE PROCEDURE\s+/i)) {
    type = 'PROCEDURE';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE PROCEDURE\s+/i, 'CREATE OR REPLACE PROCEDURE ');
    bump('after', type);
  }
  // --- MATERIALIZED VIEW (antes de VIEW pois regex de VIEW faria match parcial) ---
  else if (startsWith(/^CREATE MATERIALIZED VIEW\s+/i)) {
    type = 'MATERIALIZED_VIEW';
    bump('before', type);
    transformed = wrapGuard(rawStmt, 'WHEN duplicate_table OR duplicate_object', 'mv');
    bump('after', type);
  }
  // --- VIEW ---
  else if (startsWith(/^CREATE VIEW\s+/i)) {
    type = 'VIEW';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE VIEW\s+/i, 'CREATE OR REPLACE VIEW ');
    bump('after', type);
  }
  // --- TRIGGER (PG15 suporta CREATE OR REPLACE TRIGGER; CONSTRAINT TRIGGER nao suporta) ---
  else if (startsWith(/^CREATE CONSTRAINT TRIGGER\s+/i)) {
    type = 'CONSTRAINT_TRIGGER';
    bump('before', type);
    transformed = wrapGuard(rawStmt, 'WHEN duplicate_object', 'ctrg');
    bump('after', type);
  }
  else if (startsWith(/^CREATE TRIGGER\s+/i)) {
    type = 'TRIGGER';
    bump('before', type);
    transformed = rawStmt.replace(/CREATE TRIGGER\s+/i, 'CREATE OR REPLACE TRIGGER ');
    bump('after', type);
  }
  // --- TYPE ---
  else if (startsWith(/^CREATE TYPE\s+/i)) {
    type = 'TYPE';
    bump('before', type);
    transformed = wrapGuard(rawStmt, 'WHEN duplicate_object', 'typ');
    bump('after', type);
  }
  // --- POLICY ---
  else if (startsWith(/^CREATE POLICY\s+/i)) {
    type = 'POLICY';
    bump('before', type);
    transformed = wrapGuard(rawStmt, 'WHEN duplicate_object', 'pol');
    bump('after', type);
  }
  // --- PUBLICATION / SUBSCRIPTION: remover (runtime, nao estrutura) ---
  else if (startsWith(/^CREATE (PUBLICATION|SUBSCRIPTION)\s+/i)) {
    type = 'PUBLICATION_SUBSCRIPTION';
    bump('before', type);
    removed.push(trimmedBody.split('\n')[0]);
    transformed = null; // omitido do output
  }
  // --- ALTER TABLE: sub-classificar pelo verbo interno ---
  else if (startsWith(/^ALTER TABLE\s+/i)) {
    if (/ADD CONSTRAINT/i.test(trimmedBody)) {
      type = 'ALTER_TABLE_ADD_CONSTRAINT';
      bump('before', type);
      transformed = wrapGuard(rawStmt, 'WHEN duplicate_object', 'con');
      bump('after', type);
    } else if (/ATTACH PARTITION/i.test(trimmedBody)) {
      type = 'ALTER_TABLE_ATTACH_PARTITION';
      bump('before', type);
      transformed = wrapGuard(rawStmt, 'WHEN duplicate_table OR duplicate_object', 'atp');
      bump('after', type);
    } else if (/ENABLE ROW LEVEL SECURITY/i.test(trimmedBody) || /FORCE ROW LEVEL SECURITY/i.test(trimmedBody)) {
      type = 'ROW_SECURITY';
      bump('before', type);
      bump('after', type); // idempotente nativamente, mantido verbatim
    } else if (/ALTER COLUMN[\s\S]*SET DEFAULT/i.test(trimmedBody)) {
      type = 'DEFAULT';
      bump('before', type);
      bump('after', type); // idempotente nativamente, mantido verbatim
    } else if (/REPLICA IDENTITY (FULL|DEFAULT|NOTHING|USING INDEX)/i.test(trimmedBody)) {
      // nao listado nas regras explicitas — reatribuir REPLICA IDENTITY e
      // idempotente nativamente (apenas seta relreplident, sem erro em rerun)
      type = 'REPLICA_IDENTITY';
      bump('before', type);
      bump('after', type);
    } else if (/ADD GENERATED (ALWAYS|BY DEFAULT) AS IDENTITY/i.test(trimmedBody)) {
      // nao listado nas regras explicitas — NAO e idempotente nativamente
      // (rerun falha com "column already has an identity"), guard DO
      type = 'ALTER_TABLE_ADD_IDENTITY';
      bump('before', type);
      transformed = wrapGuard(rawStmt, 'WHEN duplicate_object OR OTHERS', 'idn');
      bump('after', type);
    } else {
      unclassified.push({ type: 'ALTER_TABLE_OTHER', preview: trimmedBody.slice(0, 200) });
      bump('before', 'ALTER_TABLE_OTHER');
      bump('after', 'ALTER_TABLE_OTHER');
    }
  }
  // --- ALTER INDEX ... ATTACH PARTITION (nao listado nas regras explicitas —
  //     tratado por analogia a ATTACH PARTITION de tabela; catch mais amplo
  //     pois o SQLSTATE emitido pelo Postgres ao re-anexar um indice de
  //     particao ja anexado nao e um duplicate_object/duplicate_table limpo) ---
  else if (startsWith(/^ALTER INDEX\s+[\s\S]*ATTACH PARTITION/i)) {
    type = 'INDEX_ATTACH_PARTITION';
    bump('before', type);
    transformed = wrapGuard(rawStmt, 'WHEN duplicate_table OR duplicate_object OR OTHERS', 'idx');
    bump('after', type);
  }
  // --- ALTER SEQUENCE ... OWNED BY: idempotente, mantido ---
  else if (startsWith(/^ALTER SEQUENCE\s+[\s\S]*OWNED BY/i)) {
    type = 'SEQUENCE_OWNED_BY';
    bump('before', type);
    bump('after', type);
  }
  // --- COMMENT ON: idempotente, mantido ---
  else if (startsWith(/^COMMENT ON\s+/i)) {
    type = 'COMMENT';
    bump('before', type);
    bump('after', type);
  }
  // --- SET: idempotente, mantido ---
  else if (startsWith(/^SET\s+/i)) {
    type = 'SET';
    bump('before', type);
    bump('after', type);
  }
  // --- GRANT/REVOKE: idempotente, mantido ---
  else if (startsWith(/^(GRANT|REVOKE)\s+/i)) {
    type = 'GRANT_REVOKE';
    bump('before', type);
    bump('after', type);
  }
  // --- CREATE EXTENSION: nao deveria aparecer num dump de schema, mas se
  //     aparecer e idempotente nativamente via IF NOT EXISTS do pg_dump
  //     (pg_dump ja emite "CREATE EXTENSION IF NOT EXISTS") ---
  else if (startsWith(/^CREATE EXTENSION\s+/i)) {
    type = 'EXTENSION';
    bump('before', type);
    bump('after', type);
  }
  // --- preambulo pg_dump: SELECT pg_catalog.set_config(...) — idempotente, mantido ---
  else if (startsWith(/^SELECT pg_catalog\.set_config\(/i)) {
    type = 'SET_CONFIG';
    bump('before', type);
    bump('after', type);
  }
  else {
    unclassified.push({ type: 'UNKNOWN', preview: trimmedBody.slice(0, 200) });
    bump('before', 'UNKNOWN');
    bump('after', 'UNKNOWN');
  }

  if (transformed !== null) out.push(transformed);
}

// ---------------------------------------------------------------------------
// 3. Escreve saida
// ---------------------------------------------------------------------------
const finalSql = out.join('\n');
fs.writeFileSync(outputPath, finalSql, 'utf8');

// ---------------------------------------------------------------------------
// 4. Sumario
// ---------------------------------------------------------------------------
function printCounts(label, bucket) {
  console.log(`\n-- ${label} --`);
  const keys = Object.keys(bucket).sort();
  let total = 0;
  for (const k of keys) {
    console.log(`  ${k}: ${bucket[k]}`);
    total += bucket[k];
  }
  console.log(`  TOTAL: ${total}`);
}

console.log(`Statements de entrada (top-level, split por ';'): ${rawStatements.length}`);
printCounts('Contagem por tipo (ANTES)', counts.before);
printCounts('Contagem por tipo (DEPOIS, mesmo bucket = so mudou o texto)', counts.after);

console.log(`\nStatements removidos (PUBLICATION/SUBSCRIPTION): ${removed.length}`);
removed.forEach((r) => console.log(`  - ${r}`));

console.log(`\nStatements NAO classificados pelas regras (revisados manualmente no codigo, ver comentarios do script): ${unclassified.length}`);
unclassified.forEach((u) => console.log(`  - [${u.type}] ${u.preview.replace(/\n/g, ' ')}`));

const outStatementCount = out.filter((s) => s.trim() && !/^\s*(--|$)/.test(s.trim())).length;
console.log(`\nStatements de saida escritos: ${out.length} (entrada ${rawStatements.length} - removidos ${removed.length} = ${rawStatements.length - removed.length})`);
