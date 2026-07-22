#!/usr/bin/env node
/**
 * gen-types-zapp.mjs — Gera types.ts para a instância Supabase self-hosted
 * incluindo os schemas `zapp` e `evo` (além de `public`).
 *
 * Uso:
 *   META_URL=https://supabase.atomicabr.com.br/pg \
 *   META_TOKEN=<service_role_key> \
 *   node scripts/gen-types-zapp.mjs
 *
 * Diferenças vs gen-types.mjs:
 *  - inclui schemas zapp,evo,public no endpoint /generators/typescript
 *  - garante que tabelas CRM (deals, pipelines, contatos_crm, etc.) fiquem
 *    tipadas mesmo quando vivem fora do schema public
 *  - mantém a cauda Lovable (DatabaseWithoutInternals + helpers)
 *
 * NOTA: O Kong do Supabase self-hosted usa key-auth (header `apikey`),
 * NÃO `Authorization: Bearer`. Corrigido em 16/07/2026 após falha do
 * workflow #1 (HTTP 401).
 */
import { writeFileSync, readFileSync } from 'node:fs';

const META = process.env.META_URL || 'https://supabase.atomicabr.com.br/pg';
const TOKEN = process.env.META_TOKEN || '';
const SCHEMAS = (process.env.SCHEMAS || 'public,zapp,evo').trim();
const OUT = process.env.OUT_FILE || 'src/integrations/supabase/types.ts';

const headers = { 'content-type': 'application/json' };
if (TOKEN) {
  // Kong key-auth: usa header `apikey` (não Authorization: Bearer)
  headers.apikey = TOKEN;
  // Também envia como Bearer para compatibilidade com postgres-meta direto
  headers.authorization = `Bearer ${TOKEN}`;
}

const url = new URL('/generators/typescript', META);
url.searchParams.set('included_schemas', SCHEMAS);
url.searchParams.set('detect_one_to_one_relationships', 'true');

console.log(`→ Requisitando types.ts para schemas: ${SCHEMAS}`);
console.log(`  META_URL=${META}`);

const res = await fetch(url, { headers });
if (!res.ok) {
  console.error(`✗ postgres-meta HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
let src = await res.text();
try {
  const j = JSON.parse(src);
  src = j.types || j.data || src;
} catch { /* raw TS */ }

// Preserva cauda Lovable (DatabaseWithoutInternals + helpers)
let existingTail = '';
try {
  const existing = readFileSync(OUT, 'utf8');
  const lines = existing.split('\n');
  let depth = 0, inDb = false, endLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^export type Database = \{$/.test(lines[i])) { inDb = true; depth = 1; continue; }
    if (inDb) {
      for (const c of lines[i]) { if (c === '{') depth++; else if (c === '}') depth--; }
      if (depth === 0) { endLine = i; break; }
    }
  }
  if (endLine > 0) existingTail = lines.slice(endLine + 1).join('\n');
} catch { /* first run */ }

let out = src.trimEnd();
if (existingTail && existingTail.includes('DatabaseWithoutInternals')) {
  out += '\n' + existingTail;
  console.log(`✓ Cauda Lovable preservada (${existingTail.split('\n').length} linhas)`);
} else {
  console.warn('⚠ Cauda Lovable não localizada — helpers auxiliares podem faltar.');
}

// Validação: o payload do postgres-meta DEVE conter os schemas requisitados.
// Sem isso, o workflow abriria um PR com types.ts incompleto (só `public`),
// mascarando problema de permissão do service_role ou de include_schemas.
const requestedSchemas = SCHEMAS.split(',').map((s) => s.trim()).filter(Boolean);
const requiredTop = requestedSchemas.filter((s) => s === 'zapp' || s === 'evo');
const missing = requiredTop.filter(
  (s) => !new RegExp(`^\\s{2}${s}\\s*:\\s*\\{`, 'm').test(out)
);
if (missing.length) {
  console.error(`✗ postgres-meta NÃO retornou os schemas: ${missing.join(', ')}.`);
  console.error(`  Verifique include_schemas e as permissões do service_role no Kong.`);
  process.exit(1);
}

writeFileSync(OUT, out);
const linesOut = out.split('\n').length;
console.log(`✓ ${OUT} gerado (${linesOut} linhas) para [${SCHEMAS}]`);
