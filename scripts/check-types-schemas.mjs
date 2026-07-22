#!/usr/bin/env node
/**
 * check-types-schemas.mjs
 * ------------------------------------------------------------------
 * Gate de build/CI que valida se `src/integrations/supabase/types.ts`
 * contém os schemas `zapp` e `evo` — pré-requisito para o `tsc` rodar
 * sem milhares de erros TS2339 em cascata.
 *
 * Modos:
 *   1. Local (sempre, bloqueante): inspeciona o types.ts commitado e
 *      valida se `export type Database = { ... }` tem chaves de
 *      primeiro nível `zapp:` e `evo:`.
 *   2. Remoto (quando ZAPP_META_URL/ZAPP_META_TOKEN presentes): consulta
 *      postgres-meta e verifica se o banco expõe os mesmos schemas.
 *      Sem os secrets, emite warning e não bloqueia (útil para PRs de
 *      forks); o modo local continua bloqueando.
 *
 * Flags:
 *   --local-only   Ignora completamente a checagem remota.
 *
 * Exit codes: 0 ok · 1 falha (schema ausente no arquivo ou no banco).
 */
import { readFileSync, existsSync } from 'node:fs';

const TYPES_FILE = 'src/integrations/supabase/types.ts';
const REQUIRED = ['zapp', 'evo'];
const LOCAL_ONLY = process.argv.includes('--local-only');

const META = process.env.META_URL || process.env.ZAPP_META_URL;
const TOKEN = process.env.META_TOKEN || process.env.ZAPP_META_TOKEN;
const SCHEMAS = (process.env.SCHEMAS || 'public,zapp,evo').trim();

/**
 * Extrai as chaves de primeiro nível dentro de `export type Database = { ... }`.
 * Usa contagem de chaves para respeitar aninhamento.
 */
function extractTopLevelKeys(src) {
  const lines = src.split('\n');
  let depth = 0;
  let inDb = false;
  const keys = new Set();
  const keyRe = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{/;
  for (const line of lines) {
    if (!inDb) {
      if (/^export type Database = \{$/.test(line)) {
        inDb = true;
        depth = 1;
      }
      continue;
    }
    if (depth === 1) {
      const m = line.match(keyRe);
      if (m) keys.add(m[1]);
    }
    for (const c of line) {
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth === 0) break;
  }
  return keys;
}

function fail(msg) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════════╗');
  console.error('║  COBERTURA DE SCHEMAS SUPABASE INCOMPLETA — BUILD BLOQUEADO      ║');
  console.error('╠══════════════════════════════════════════════════════════════════╣');
  for (const line of msg.split('\n')) {
    console.error('║  ' + line.padEnd(64) + '║');
  }
  console.error('╠══════════════════════════════════════════════════════════════════╣');
  console.error('║  Como resolver:                                                  ║');
  console.error('║   1. GitHub Actions → "Regenerate Supabase types (zapp + evo)"   ║');
  console.error('║      → Run workflow (schemas: public,zapp,evo)                   ║');
  console.error('║   2. Faça merge do PR gerado                                     ║');
  console.error('║   Alternativa local:                                             ║');
  console.error('║      META_URL=... META_TOKEN=... \\                               ║');
  console.error('║        node scripts/gen-types-zapp.mjs                           ║');
  console.error('╚══════════════════════════════════════════════════════════════════╝');
  process.exit(1);
}

// -------- Modo local (sempre) --------
if (!existsSync(TYPES_FILE)) {
  fail(`Arquivo ${TYPES_FILE} não encontrado.`);
}
const localSrc = readFileSync(TYPES_FILE, 'utf8');
const localKeys = extractTopLevelKeys(localSrc);
const missingLocal = REQUIRED.filter((s) => !localKeys.has(s));

if (missingLocal.length) {
  fail(
    `types.ts está sem os schemas: ${missingLocal.join(', ')}.\n` +
    `Schemas presentes: ${[...localKeys].join(', ') || '(nenhum)'}.`
  );
}
console.log(`✓ [local] types.ts contém schemas: ${[...localKeys].join(', ')}`);

// -------- Modo remoto (opcional) --------
if (LOCAL_ONLY) process.exit(0);

if (!META || !TOKEN) {
  console.warn('⚠ [remoto] ZAPP_META_URL/ZAPP_META_TOKEN ausentes — checagem remota pulada (não-bloqueante).');
  process.exit(0);
}

try {
  const url = new URL('/generators/typescript', META);
  url.searchParams.set('included_schemas', SCHEMAS);
  url.searchParams.set('detect_one_to_one_relationships', 'true');
  const res = await fetch(url, {
    headers: {
      apikey: TOKEN,
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
  });
  if (!res.ok) {
    console.warn(`⚠ [remoto] postgres-meta HTTP ${res.status} — checagem remota pulada (não-bloqueante).`);
    process.exit(0);
  }
  let remote = await res.text();
  try {
    const j = JSON.parse(remote);
    remote = j.types || j.data || remote;
  } catch { /* raw TS */ }
  const remoteKeys = extractTopLevelKeys(remote);
  const missingRemote = REQUIRED.filter((s) => !remoteKeys.has(s));
  if (missingRemote.length) {
    fail(
      `postgres-meta NÃO expõe os schemas: ${missingRemote.join(', ')}.\n` +
      `Schemas retornados: ${[...remoteKeys].join(', ') || '(nenhum)'}.\n` +
      `Verifique inclusão dos schemas e permissões do service_role.`
    );
  }
  console.log(`✓ [remoto] postgres-meta expõe schemas: ${[...remoteKeys].join(', ')}`);
} catch (err) {
  console.warn(`⚠ [remoto] Falha ao consultar postgres-meta (${err?.message || err}) — não-bloqueante.`);
  process.exit(0);
}
