#!/usr/bin/env node
/**
 * Guardrail: uso correto de schema Supabase.
 *
 * Falha o build quando encontra:
 *  1. `.schema('public')`   em src/ ou supabase/functions/
 *  2. `createClient(...)`   em código de produção sem `db: { schema: '<zapp|evo|...>' }`
 *  3. URLs `*.supabase.co`  fora de arquivos de teste.
 *
 * Baseline (2026-07-15): script foi introduzido junto da consolidação single-DB.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'supabase/functions'];
const IGNORE_DIR = /node_modules|dist|\.next|\.turbo|coverage/;
const TEST_RE = /\.test\.(ts|tsx|mts|cts|js|jsx)$|__tests__|test\/|tests\//;

const violations = { public: [], noSchema: [], cloudUrl: [], evoUnprefixed: [] };

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (IGNORE_DIR.test(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));

const SCHEMA_OK_RE = /db\s*:\s*\{\s*schema\s*:\s*['"](zapp|evo|email_app|financeiro|vendas|ops|ai|bpm|archive|auth)['"]/;
const HAS_CREATE_CLIENT = /createClient\s*[<(]/;
const HAS_SCHEMA_METHOD = /\.schema\(\s*['"](zapp|evo|email_app|financeiro|vendas|ops|ai|bpm|archive)['"]/;

for (const f of files) {
  const isTest = TEST_RE.test(f);
  const src = readFileSync(f, 'utf8');

  // 1. schema('public')
  if (/\.schema\(\s*['"]public['"]\s*\)/.test(src)) {
    violations.public.push(relative('.', f));
  }

  // 2. createClient sem schema (só produção; ignora _shared factories, types e testes)
  if (
    !isTest &&
    HAS_CREATE_CLIENT.test(src) &&
    !SCHEMA_OK_RE.test(src) &&
    !HAS_SCHEMA_METHOD.test(src) &&
    !/createZappAdminClient|createEvoAdminClient/.test(src) &&
    !/_shared\/db-client\.ts$/.test(f) &&
    !/integrations\/supabase\/types\.ts$/.test(f)
  ) {
    violations.noSchema.push(relative('.', f));
  }

  // 3. supabase.co hardcoded fora de testes
  if (!isTest && /https?:\/\/[a-z0-9-]+\.supabase\.co/i.test(src)) {
    violations.cloudUrl.push(relative('.', f));
  }

  // 4. .from('evolution_messages'|'evolution_conversations') no frontend sem sufixo
  // de partição. Essas são tabelas-pai particionadas em `evo` — o frontend deve
  // consultar a partição real (evolution_messages_wpp2). Edge Functions rodam com
  // service_role e o PG roteia para a partição correta, então o guardrail se
  // aplica apenas a src/.
  const parentPartitionRe =
    /\.from\(\s*['"](evolution_messages|evolution_conversations)['"]\s*\)/g;
  if (!isTest && f.startsWith('src/') && parentPartitionRe.test(src)) {
    violations.evoUnprefixed.push(relative('.', f));
  }
}

const total =
  violations.public.length +
  violations.noSchema.length +
  violations.cloudUrl.length +
  violations.evoUnprefixed.length;

if (total === 0) {
  console.log('✅ check-schema-usage: 0 violações. Schema consolidado em zapp/evo.');
  process.exit(0);
}

console.error('❌ check-schema-usage encontrou violações:\n');
if (violations.public.length) {
  console.error(`— .schema('public') proibido (${violations.public.length}):`);
  violations.public.forEach((f) => console.error('   ' + f));
}
if (violations.noSchema.length) {
  console.error(`\n— createClient sem "db: { schema: ... }" (${violations.noSchema.length}):`);
  violations.noSchema.forEach((f) => console.error('   ' + f));
}
if (violations.cloudUrl.length) {
  console.error(`\n— URL *.supabase.co em código de produção (${violations.cloudUrl.length}):`);
  violations.cloudUrl.forEach((f) => console.error('   ' + f));
}
if (violations.evoUnprefixed.length) {
  console.error(
    `\n— .from('evolution_messages'|'evolution_conversations') proibido (${violations.evoUnprefixed.length}):`
  );
  console.error("   Use a partição real (ex: 'evolution_messages_wpp2') com .schema('evo').");
  violations.evoUnprefixed.forEach((f) => console.error('   ' + f));
}
console.error('\nSchema canônico: zapp (app) + evo (Evolution). Ver docs/SCHEMA_REFERENCE.md.');
process.exit(1);
