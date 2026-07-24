#!/usr/bin/env node
/**
 * Guardrail: uso correto de schema Supabase.
 *
 * Falha o build quando encontra:
 *  1. `.schema('public')`           em src/ ou supabase/functions/
 *  2. `createClient(...)`           em código de produção sem `db: { schema: '<zapp|evo|...>' }`
 *  3. URLs `*.supabase.co`          fora de arquivos de teste (inclui .lovable/).
 *  4. .from('evolution_messages'|'evolution_conversations') sem sufixo de partição (frontend).
 *  5. .from('evolution_instance_credentials'|'evolution_health_logs') sem .schema('evo') (frontend).
 *  6. .schema('evo').from('evolution_instances') — a view evolution_instances existe em
 *     zapp, NÃO em evo; chamar via .schema('evo') resulta em PGRST205 em produção.
 *
 * Baseline (2026-07-15): script foi introduzido junto da consolidação single-DB.
 * Update (2026-07-16): adicionado scan de .lovable/ para URLs cloud; guardrail para
 *   tabelas evo-only (evolution_instance_credentials, evolution_health_logs).
 * Update (2026-07-16b): adicionada regra SUP-006 para .schema('evo').from('evolution_instances').
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['src', 'supabase/functions', '.lovable'];
const IGNORE_DIR = /node_modules|dist|\.next|\.turbo|coverage/;
const TEST_RE = /\.test\.(ts|tsx|mts|cts|js|jsx)$|__tests__|test\/|tests\//;

const violations = { public: [], noSchema: [], cloudUrl: [], evoUnprefixed: [], evoSchemaRequired: [], evoInstancesBadSchema: [] };

function walk(dir, out = [], allExts = false) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (IGNORE_DIR.test(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out, allExts);
    else if (allExts ? /\.(ts|tsx|mts|cts|js|jsx|json|md|sql|yaml|yml)$/.test(name)
                     : /\.(ts|tsx|mts|cts|js|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

// .lovable/ needs allExts=true to scan JSON/yaml config files too
const files = ROOTS.flatMap((r) =>
  r === '.lovable' ? walk(r, [], true) : walk(r)
);

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
    !/integrations\/supabase\/types\.ts$/.test(f) &&
    // Permite exceção explícita via comentário no topo do arquivo.
    // Use quando o createClient conecta a um projeto Supabase EXTERNO
    // (fora do controle deste repo) onde db.schema não se aplica.
    !/\/\/ schema-check-exempt/.test(src)
  ) {
    violations.noSchema.push(relative('.', f));
  }

  // 3. supabase.co hardcoded em código-fonte (src/ e supabase/functions/ apenas).
  // .lovable/ contém configuração de plataforma — não código-fonte — e pode
  // referenciar URLs Supabase legitimamente (ex: manifest.json com issuer).
  const isSourceFile = f.startsWith('src/') || f.startsWith('supabase/functions/');
  if (!isTest && isSourceFile && /https?:\/\/[a-z0-9-]+\.supabase\.co/i.test(src)) {
    violations.cloudUrl.push(relative('.', f));
  }

  // 4. .schema('evo').from('evolution_messages'|'evolution_conversations') no frontend
  // é proibido — evolution_messages e evolution_conversations existem como VIEWS
  // auto-updatable no schema `zapp` (security_invoker=on). Acessar via .schema('evo')
  // causa PGRST205 porque a raiz particionada não responde ao PostgREST diretamente.
  // CORRETO: supabase.from('evolution_messages') — usa a VIEW em zapp (schema padrão).
  // ERRADO:  supabase.schema('evo').from('evolution_messages') — PGRST205.
  // Subscriptions Realtime usam channel.on({ schema:'evo', table:... }) — não .from().
  const evoRootDirectAccessRe =
    /\.schema\s*\(\s*['"]evo['"]\s*\)\s*\.from\s*\(\s*['"](evolution_messages|evolution_conversations)['"]\s*\)/;
  if (!isTest && f.startsWith('src/') && evoRootDirectAccessRe.test(src)) {
    violations.evoUnprefixed.push(relative('.', f));
  }

  // 5. evolution_instance_credentials e evolution_health_logs vivem em `evo` —
  // o cliente padrão usa schema 'zapp', então qualquer .from() dessas tabelas
  // no frontend deve ser precedido por .schema('evo') ou pelo client evo.
  // Detecta: arquivo usa .from('evolution_instance_credentials'|'evolution_health_logs')
  //          mas NÃO tem .schema('evo') ou supabase.schema('evo') próximo.
  const evoOnlyTableRe =
    /\.from\(\s*['"](evolution_instance_credentials|evolution_health_logs)['"]\s*\)/;
  const hasEvoSchema = /\.schema\(\s*['"]evo['"]\s*\)/.test(src);
  if (!isTest && f.startsWith('src/') && evoOnlyTableRe.test(src) && !hasEvoSchema) {
    violations.evoSchemaRequired.push(relative('.', f));
  }

  // 6. SUP-006: .schema('evo').from('evolution_instances') — PGRST205 em produção.
  // evolution_instances existe como view em zapp, NÃO como tabela em evo.
  // Toda chamada via .schema('evo') retorna "Could not find a relationship..." (PGRST205).
  const sup006Re =
    /\.schema\s*\(\s*['"]evo['"]\s*\)\s*\.from\s*\(\s*['"]evolution_instances['"]\s*\)/;
  if (!isTest && sup006Re.test(src)) {
    violations.evoInstancesBadSchema.push(relative('.', f));
  }
}

const total =
  violations.public.length +
  violations.noSchema.length +
  violations.cloudUrl.length +
  violations.evoUnprefixed.length +
  violations.evoSchemaRequired.length +
  violations.evoInstancesBadSchema.length;

if (total === 0) {
  console.log('✅ check-schema-usage: 0 violações (6 guardrails). Schema consolidado em zapp/evo.');
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
    `\n— [SUP-004] .schema('evo').from('evolution_messages|evolution_conversations') proibido (${violations.evoUnprefixed.length}):`
  );
  console.error("   Essas tabelas existem como VIEWs em zapp (security_invoker=on).");
  console.error("   Use: supabase.from('evolution_messages') — schema padrão zapp.");
  console.error("   NÃO use .schema('evo').from(...) — causa PGRST205.");
  violations.evoUnprefixed.forEach((f) => console.error('   ' + f));
}
if (violations.evoSchemaRequired.length) {
  console.error(
    `\n— .from('evolution_instance_credentials'|'evolution_health_logs') sem .schema('evo') (${violations.evoSchemaRequired.length}):`
  );
  console.error("   Essas tabelas vivem no schema 'evo'. Use supabase.schema('evo').from(...).");
  violations.evoSchemaRequired.forEach((f) => console.error('   ' + f));
}
if (violations.evoInstancesBadSchema.length) {
  console.error(
    `\n— [SUP-006] .schema('evo').from('evolution_instances') proibido (${violations.evoInstancesBadSchema.length}):`
  );
  console.error("   evolution_instances é uma VIEW em zapp, não existe no schema evo.");
  console.error("   Use: supabase.from('evolution_instances') (schema zapp, padrão).");
  violations.evoInstancesBadSchema.forEach((f) => console.error('   ' + f));
}
console.error('\nSchema canônico: zapp (app) + evo (Evolution). Ver docs/SCHEMA_REFERENCE.md.');
process.exit(1);
