#!/usr/bin/env node
/**
 * gen-types-zapp.mjs — Gera types.ts para a instância Supabase self-hosted
 * incluindo os schemas `zapp` e `evo` (além de `public`).
 *
 * Uso:
 *   META_URL=https://supabase-meta.atomicabr.com.br \
 *   META_TOKEN=<service_role_or_meta_token> \
 *   node scripts/gen-types-zapp.mjs
 *
 * Diferenças vs gen-types.mjs:
 *  - inclui schemas zapp,evo,public no endpoint /generators/typescript
 *  - garante que tabelas CRM (deals, pipelines, contatos_crm, etc.) fiquem
 *    tipadas mesmo quando vivem fora do schema public
 *  - mantém a cauda Lovable (DatabaseWithoutInternals + helpers)
 */
import { writeFileSync, readFileSync } from 'node:fs';

const META = process.env.META_URL || 'http://10.0.1.52:8080';
const TOKEN = process.env.META_TOKEN || '';
const SCHEMAS = (process.env.SCHEMAS || 'public,zapp,evo').trim();
const OUT = process.env.OUT_FILE || 'src/integrations/supabase/types.ts';

const headers = { 'content-type': 'application/json' };
if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

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

writeFileSync(OUT, out);
const linesOut = out.split('\n').length;
console.log(`✓ ${OUT} gerado (${linesOut} linhas) para [${SCHEMAS}]`);
