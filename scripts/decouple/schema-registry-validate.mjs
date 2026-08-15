#!/usr/bin/env node
/**
 * schema-registry-validate.mjs — Validador estrutural de schema registry JSON
 *
 * Valida a estrutura de docs/decouple/schema-registry/*.json (ex.: evo.json):
 *   1. JSON válido e objeto raiz
 *   2. Campos obrigatórios: schema (string não vazia), generated_from, date
 *   3. tables: array não vazio; tables[].name string não vazia e ÚNICA
 *   4. owner: se informado, deve ser string não vazia
 *   5. columns: se informado, array de {name, type} com name/type strings não vazias
 *      e nomes de coluna únicos dentro da tabela
 *
 * Modo ADVISORY: este gate valida apenas a estrutura do registro (repo).
 * A validação contra o banco real (owners reais, colunas reais) é feita pelo
 * maestro em rodada posterior — o bloqueio só entra depois dessa validação.
 *
 * Uso: node scripts/decouple/schema-registry-validate.mjs [caminho-para-evo.json] [--ci]
 *   (padrão: docs/decouple/schema-registry/evo.json)
 * Exit 0 = válido | Exit 1 = inválido
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '..', '..');
const CI    = process.argv.includes('--ci');

const argFile = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DEFAULT_FILE = 'docs/decouple/schema-registry/evo.json';
const filePath = argFile ? argFile : DEFAULT_FILE;
const absPath  = filePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(filePath)
  ? filePath
  : join(ROOT, filePath);

const errors   = [];
const warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// ── 1. Arquivo existe e é JSON válido ───────────────────────────────────────
if (!existsSync(absPath)) {
  console.error(`[schema-registry-validate] ERRO: arquivo não encontrado: ${absPath}`);
  process.exit(1);
}

let doc;
try {
  doc = JSON.parse(readFileSync(absPath, 'utf8'));
} catch (e) {
  console.error(`[schema-registry-validate] ERRO: JSON inválido em ${filePath}: ${e.message}`);
  process.exit(1);
}

if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
  err('raiz deve ser um objeto JSON');
} else {
  // ── 2. Campos obrigatórios do topo ────────────────────────────────────────
  for (const field of ['schema', 'generated_from', 'date']) {
    if (typeof doc[field] !== 'string' || doc[field].trim() === '') {
      err(`campo obrigatório ausente ou vazio: "${field}"`);
    }
  }
  if (typeof doc.schema === 'string' && doc.schema.trim() !== 'evo') {
    warn(`schema "${doc.schema}" ≠ "evo" (registro fora do escopo canônico do gate)`);
  }

  // ── 3. tables: array não vazio, names únicos ──────────────────────────────
  if (!Array.isArray(doc.tables) || doc.tables.length === 0) {
    err('"tables" deve ser um array não vazio');
  } else {
    const seen = new Set();
    for (const [i, t] of doc.tables.entries()) {
      const idx = `tables[${i}]`;
      if (typeof t !== 'object' || t === null) {
        err(`${idx}: entrada deve ser um objeto`);
        continue;
      }
      if (typeof t.name !== 'string' || t.name.trim() === '') {
        err(`${idx}: "name" obrigatório (string não vazia)`);
      } else if (seen.has(t.name)) {
        err(`${idx}: nome duplicado "${t.name}" (nomes devem ser únicos)`);
      } else {
        seen.add(t.name);
      }

      // 4. owner: presente quando informado
      if ('owner' in t) {
        if (typeof t.owner !== 'string' || t.owner.trim() === '') {
          err(`${idx} (${t.name ?? '?'}): "owner" informado deve ser string não vazia`);
        }
      }

      // 5. columns: array de {name, type} com nomes únicos
      if ('columns' in t) {
        if (!Array.isArray(t.columns)) {
          err(`${idx} (${t.name ?? '?'}): "columns" deve ser um array`);
        } else {
          const colSeen = new Set();
          for (const [j, c] of t.columns.entries()) {
            const cidx = `${idx}.columns[${j}]`;
            if (typeof c !== 'object' || c === null ||
                typeof c.name !== 'string' || c.name.trim() === '' ||
                typeof c.type !== 'string' || c.type.trim() === '') {
              err(`${cidx} (tabela ${t.name ?? '?'}): cada coluna exige {name, type} strings não vazias`);
            } else if (colSeen.has(c.name)) {
              err(`${cidx} (tabela ${t.name ?? '?'}): coluna duplicada "${c.name}"`);
            } else {
              colSeen.add(c.name);
            }
          }
        }
      }
    }
  }
}

// ── Resultado ───────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`[schema-registry-validate] AVISO: ${w}`);
if (errors.length > 0) {
  console.error(`[schema-registry-validate] FALHOU (${errors.length} erro(s)) em ${filePath}:`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

const tableCount = Array.isArray(doc?.tables) ? doc.tables.length : 0;
const withOwner  = Array.isArray(doc?.tables) ? doc.tables.filter((t) => 'owner' in t).length : 0;
const withCols   = Array.isArray(doc?.tables) ? doc.tables.filter((t) => Array.isArray(t.columns)).length : 0;
console.log(`[schema-registry-validate] OK — ${filePath}`);
console.log(`  schema=${doc?.schema ?? '?'} | generated_from=${doc?.generated_from ?? '?'} | date=${doc?.date ?? '?'}`);
console.log(`  tables=${tableCount} | com owner=${withOwner} | com columns=${withCols}${CI ? ' | modo CI' : ''}`);
console.log('  (ADVISORY: estrutura do repo validada; owners/colunas reais serão validados pelo maestro contra o banco)');
process.exit(0);
