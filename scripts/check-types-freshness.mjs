#!/usr/bin/env node
/**
 * check-types-freshness.mjs
 * ------------------------------------------------------------------
 * Bloqueia deploy se `src/integrations/supabase/types.ts` estiver
 * defasado em relação ao schema atual da VPS (postgres-meta).
 *
 * Estratégia:
 *  1. Requisita `/generators/typescript?included_schemas=public,zapp,evo`
 *     ao META_URL configurado (secret ZAPP_META_URL).
 *  2. Calcula sha256 do corpo (excluindo a "cauda Lovable" — helpers
 *     preservados por gen-types-zapp.mjs).
 *  3. Compara com o hash gravado em
 *     `src/integrations/supabase/.types-checksum` (commitado).
 *  4. Falha o CI com instruções se divergir.
 *
 * Uso local (regenerar checksum após aprovar novo types.ts):
 *   META_URL=... META_TOKEN=... node scripts/check-types-freshness.mjs --update
 *
 * Se não houver credenciais (`METAS_URL`/`METAS_TOKEN` ausentes) o script
 * exit 0 com warning — não trava PRs de forks.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const CHECKSUM_FILE = 'src/integrations/supabase/.types-checksum';
const META = process.env.META_URL || process.env.ZAPP_META_URL;
const TOKEN = process.env.META_TOKEN || process.env.ZAPP_META_TOKEN;
const SCHEMAS = (process.env.SCHEMAS || 'public,zapp,evo').trim();
const UPDATE = process.argv.includes('--update');

if (!META || !TOKEN) {
  console.warn('⚠ check-types-freshness: META_URL/META_TOKEN ausentes — skip (não-bloqueante).');
  process.exit(0);
}

function stripTail(src) {
  // Remove tudo após o fechamento do `export type Database = { ... }` para que
  // helpers manuais (DatabaseWithoutInternals, etc.) não afetem o hash.
  const lines = src.split('\n');
  let depth = 0;
  let inDb = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^export type Database = \{$/.test(lines[i])) {
      inDb = true;
      depth = 1;
      continue;
    }
    if (inDb) {
      for (const c of lines[i]) {
        if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      if (depth === 0) return lines.slice(0, i + 1).join('\n');
    }
  }
  return src;
}

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

const url = new URL('/generators/typescript', META);
url.searchParams.set('included_schemas', SCHEMAS);
url.searchParams.set('detect_one_to_one_relationships', 'true');

console.log(`→ Consultando ${url.origin} para schemas: ${SCHEMAS}`);
const res = await fetch(url, { headers: { authorization: `Bearer ${TOKEN}` } });
if (!res.ok) {
  console.error(`✗ postgres-meta HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  // Não bloqueia o CI por indisponibilidade transitória do meta.
  process.exit(0);
}
let remote = await res.text();
try {
  const j = JSON.parse(remote);
  remote = j.types || j.data || remote;
} catch {
  /* raw TS */
}

const remoteHash = sha256(stripTail(remote.trimEnd()));

if (UPDATE) {
  writeFileSync(CHECKSUM_FILE, remoteHash + '\n');
  console.log(`✓ Checksum atualizado (${CHECKSUM_FILE}): ${remoteHash.slice(0, 16)}…`);
  process.exit(0);
}

if (!existsSync(CHECKSUM_FILE)) {
  console.error(`✗ ${CHECKSUM_FILE} não existe. Rode: node scripts/check-types-freshness.mjs --update`);
  process.exit(1);
}
const localHash = readFileSync(CHECKSUM_FILE, 'utf8').trim();

if (localHash !== remoteHash) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════════╗');
  console.error('║  TIPOS SUPABASE DESATUALIZADOS — DEPLOY BLOQUEADO               ║');
  console.error('╠══════════════════════════════════════════════════════════════════╣');
  console.error(`║  local  : ${localHash.slice(0, 16)}…                                    ║`);
  console.error(`║  remoto : ${remoteHash.slice(0, 16)}…                                    ║`);
  console.error('╠══════════════════════════════════════════════════════════════════╣');
  console.error('║  Como resolver:                                                  ║');
  console.error('║   1. Actions → "Regenerate Supabase types (zapp + evo)" → Run    ║');
  console.error('║   2. Faça merge do PR gerado                                     ║');
  console.error('║   3. Atualize o checksum:                                        ║');
  console.error('║      node scripts/check-types-freshness.mjs --update             ║');
  console.error('╚══════════════════════════════════════════════════════════════════╝');
  process.exit(1);
}

console.log(`✓ types.ts em dia com o schema remoto (${remoteHash.slice(0, 16)}…).`);
